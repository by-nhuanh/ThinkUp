import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CustomSelectComponent, CustomSelectOption } from '../../../shared/components/custom-select/custom-select.component';
import { RoadmapHintDialogComponent } from '../components/roadmap-hint-dialog/roadmap-hint-dialog.component';
import { CourseToastComponent, ToastTone } from '../components/course-toast.component';
import { LEVEL_TONE, ROADMAP_NODE_TYPES, countChars } from '../course-utils';
import {
  CourseLevel, CourseSuggestion, RoadmapNode, RoadmapNodeType, RoadmapPhase, RoadmapQuestion, RoadmapTest
} from '../models/course.models';
import { CourseStore } from '../services/course.store';

type StudioTab = 'structure' | 'test';

@Component({
  selector: 'app-roadmap-studio',
  standalone: true,
  imports: [
    CustomSelectComponent,
    RoadmapHintDialogComponent,
    CourseToastComponent
  ],
  templateUrl: './roadmap-studio.component.html',
  styleUrl: '../courses-page.css'
})
export class RoadmapStudioComponent {
  private readonly store = inject(CourseStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly roadmapId = this.route.snapshot.paramMap.get('id') ?? '';
  readonly roadmap = computed(() => this.store.roadmaps().find(item => item.id === this.roadmapId) ?? null);
  readonly studio = computed(() => this.store.studios().find(item => item.roadmapId === this.roadmapId) ?? null);

  readonly tab = signal<StudioTab>('structure');
  readonly toast = signal<{ message: string; tone: ToastTone } | null>(null);
  readonly touched = signal(false);

  readonly selectedNodeId = signal(this.findNode(this.studio()?.selectedNodeId ?? '')?.id ?? '');
  readonly nodeDraft = signal<RoadmapNode | null>(this.findNode(this.selectedNodeId()));
  readonly testDraft = signal<RoadmapTest | null>(this.studio()?.test ? clone(this.studio()!.test) : null);
  readonly selectedQuestionId = signal(this.testDraft()?.questions[0]?.id ?? '');
  readonly threshold = signal(this.studio()?.threshold ?? 70);
  readonly attachedIds = signal<string[]>([]);
  readonly hintOpen = signal(false);
  readonly newTag = signal('');
  readonly editingTag = signal<string | null>(null);
  readonly editingTagValue = signal('');

  readonly typeOptions: CustomSelectOption[] = ROADMAP_NODE_TYPES.map(value => ({ value, label: value }));
  readonly levelOptions: CustomSelectOption[] = [
    { value: 'Cơ bản', label: 'Cơ bản' },
    { value: 'Trung cấp', label: 'Trung cấp' },
    { value: 'Nâng cao', label: 'Nâng cao' }
  ];
  readonly stageOptions = computed<CustomSelectOption[]>(() => {
    const phases = this.studio()?.phases ?? [];
    const options = phases.map(phase => ({ value: `${phase.no} · ${phase.name}`, label: `${phase.no} · ${phase.name}` }));
    // Figma lưu giai đoạn của bài test là "03 · Front-end Framework" trong khi cây cấu trúc đánh số
    // giai đoạn đó là 02, nên giữ nguyên giá trị đã lưu làm lựa chọn để select không rơi về placeholder.
    const current = this.testDraft()?.stage;
    if (current && !options.some(option => option.value === current)) {
      options.unshift({ value: current, label: current });
    }
    return options;
  });

  readonly activeQuestion = computed(() => {
    const test = this.testDraft();
    return test?.questions.find(item => item.id === this.selectedQuestionId()) ?? null;
  });
  readonly suggestions = computed(() => this.studio()?.suggestions ?? []);
  readonly visibleSuggestions = computed(() => this.suggestions().filter(item => item.match >= this.threshold()));
  readonly qualifiedCount = computed(() => this.visibleSuggestions().length);
  readonly nodeName = computed(() => this.nodeDraft()?.name ?? '');
  readonly questionsCount = computed(() => this.testDraft()?.questions.length ?? 0);

  readonly nameError = computed(() => this.touched() && countChars(this.nodeDraft()?.name ?? '') === 0);
  readonly descriptionError = computed(() => this.touched() && countChars(this.nodeDraft()?.description ?? '') === 0);
  readonly outcomesError = computed(() => this.touched() && countChars(this.nodeDraft()?.outcomes ?? '') === 0);

  selectNode(node: RoadmapNode): void {
    this.selectedNodeId.set(node.id);
    this.nodeDraft.set(clone(node));
    this.touched.set(false);
  }

  patchNode(patch: Partial<RoadmapNode>): void {
    const current = this.nodeDraft();
    if (!current) return;
    this.nodeDraft.set({ ...current, ...patch });
  }

  setNodeType(value: string): void { this.patchNode({ type: value as RoadmapNodeType }); }
  setNodeLevel(value: string): void { this.patchNode({ level: value as CourseLevel }); }

  addTag(): void {
    const value = this.newTag().trim();
    const current = this.nodeDraft();
    if (!current || !value) return;
    if (current.tags.includes(value)) {
      this.notify(`Sub-tag “${value}” đã tồn tại.`, 'error');
      return;
    }
    this.patchNode({ tags: [...current.tags, value] });
    this.newTag.set('');
  }

  startEditTag(tag: string): void {
    this.editingTag.set(tag);
    this.editingTagValue.set(tag);
  }

  confirmEditTag(tag: string): void {
    const value = this.editingTagValue().trim();
    const current = this.nodeDraft();
    if (!current) return;
    if (!value) {
      this.removeTag(tag);
      return;
    }
    this.patchNode({
      tags: current.tags.map(item => (item === tag ? value : item)).filter((item, index, list) => list.indexOf(item) === index)
    });
    this.editingTag.set(null);
  }

  cancelEditTag(): void {
    this.editingTag.set(null);
  }

  removeTag(tag: string): void {
    const current = this.nodeDraft();
    if (!current) return;
    this.patchNode({ tags: current.tags.filter(item => item !== tag) });
    if (this.editingTag() === tag) this.editingTag.set(null);
  }

  addPhase(): void {
    this.notify('Mẫu thêm giai đoạn mới sẽ mở khi backend cung cấp API.', 'info');
  }

  addNode(phase: RoadmapPhase): void {
    this.notify(`Mẫu thêm node cho giai đoạn ${phase.no} sẽ mở khi backend cung cấp API.`, 'info');
  }

  setThreshold(value: string): void {
    const parsed = Number(value);
    if (Number.isNaN(parsed)) return;
    this.threshold.set(Math.min(100, Math.max(0, Math.round(parsed))));
  }

  attach(suggestion: CourseSuggestion): void {
    if (this.attachedIds().includes(suggestion.id)) return;
    this.attachedIds.set([...this.attachedIds(), suggestion.id]);
    this.notify(`Đã gắn “${suggestion.title}” vào node ${this.nodeName()}.`, 'success');
  }

  selectQuestion(id: string): void {
    this.selectedQuestionId.set(id);
  }

  patchTest(patch: Partial<RoadmapTest>): void {
    const test = this.testDraft();
    if (!test) return;
    this.testDraft.set({ ...test, ...patch });
  }

  setDuration(value: string): void {
    const parsed = Number(value);
    if (Number.isNaN(parsed)) return;
    this.patchTest({ duration: Math.max(1, Math.round(parsed)) });
  }

  setPassScore(value: string): void {
    const parsed = Number(value);
    if (Number.isNaN(parsed)) return;
    this.patchTest({ passScore: Math.min(100, Math.max(0, Math.round(parsed))) });
  }

  setStage(value: string): void {
    this.patchTest({ stage: value });
  }

  patchQuestion(patch: Partial<RoadmapQuestion>): void {
    this.updateQuestion(question => ({ ...question, ...patch }));
  }

  setAnswerText(letter: string, text: string): void {
    this.updateQuestion(question => ({
      ...question,
      answers: question.answers.map(answer => (answer.letter === letter ? { ...answer, text } : answer))
    }));
  }

  setCorrectAnswer(letter: string): void {
    this.updateQuestion(question => ({
      ...question,
      answers: question.answers.map(answer => ({ ...answer, correct: answer.letter === letter }))
    }));
  }

  addQuestion(): void {
    const test = this.testDraft();
    if (!test) return;
    const index = test.questions.length + 1;
    const question: RoadmapQuestion = {
      id: `q-${Date.now().toString(36)}`,
      index,
      title: `${String(index).padStart(2, '0')} Trắc nghiệm · ${this.roadmap()?.name ?? 'Lộ trình'}`,
      meta: '4 phương án · 1 đáp án đúng',
      prompt: '',
      language: 'HTML / CSS',
      code: '',
      answers: ['A', 'B', 'C', 'D'].map((letter, position) => ({ letter, text: '', correct: position === 0 })),
      hint: '',
      hintSaved: false
    };
    this.testDraft.set({ ...test, questions: [...test.questions, question] });
    this.selectedQuestionId.set(question.id);
  }

  openHint(): void {
    this.hintOpen.set(true);
  }

  closeHint(): void {
    this.hintOpen.set(false);
  }

  saveHint(text: string): void {
    this.updateQuestion(question => ({ ...question, hint: text, hintSaved: true }));
    this.hintOpen.set(false);
    this.notify('Đã lưu gợi ý cho câu hỏi.', 'success');
  }

  saveDraft(): void {
    if (!this.persist()) {
      this.notify('Vui lòng nhập đủ tên node, mô tả và kết quả học được.', 'error');
      return;
    }
    this.notify('Đã lưu bản nháp lộ trình.', 'success');
  }

  publish(): void {
    if (!this.persist()) {
      this.notify('Vui lòng nhập đủ tên node, mô tả và kết quả học được.', 'error');
      return;
    }
    this.store.publishRoadmap(this.roadmapId);
    this.notify('Đã xuất bản lộ trình cho học viên.', 'success');
  }

  back(): void {
    void this.router.navigate(['/courses/roadmaps']);
  }

  notify(message: string, tone: ToastTone): void {
    this.toast.set({ message, tone });
    setTimeout(() => { if (this.toast()?.message === message) this.toast.set(null); }, 4200);
  }

  questionIndex(index: number): string {
    return String(index).padStart(2, '0');
  }

  levelTone(level: CourseLevel): string {
    return LEVEL_TONE[level];
  }

  private persist(): boolean {
    this.touched.set(true);
    const node = this.nodeDraft();
    if (node && (countChars(node.name) === 0 || countChars(node.description) === 0 || countChars(node.outcomes) === 0)) {
      return false;
    }
    if (node) this.store.updateRoadmapNode(this.roadmapId, node);
    const test = this.testDraft();
    if (test) this.store.saveRoadmapTest(this.roadmapId, test);
    this.store.saveRoadmapDraft(this.roadmapId);
    return true;
  }

  private updateQuestion(transform: (question: RoadmapQuestion) => RoadmapQuestion): void {
    const test = this.testDraft();
    if (!test) return;
    const id = this.selectedQuestionId();
    this.testDraft.set({
      ...test,
      questions: test.questions.map(question => (question.id === id ? transform(question) : question))
    });
  }

  private findNode(id: string): RoadmapNode | null {
    const phases = this.studio()?.phases ?? [];
    for (const phase of phases) {
      const node = phase.nodes.find(item => item.id === id);
      if (node) return clone(node);
    }
    return phases[0]?.nodes[0] ? clone(phases[0].nodes[0]) : null;
  }
}

function clone<T>(value: T): T {
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}
