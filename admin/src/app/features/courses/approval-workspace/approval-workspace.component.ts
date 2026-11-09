import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { CustomSelectComponent, CustomSelectOption } from '../../../shared/components/custom-select/custom-select.component';
import { CourseHistoryDialogComponent } from '../components/course-history-dialog/course-history-dialog.component';
import { CourseRejectDialogComponent, RejectPayload } from '../components/course-reject-dialog/course-reject-dialog.component';
import { CourseRiskDialogComponent } from '../components/course-risk-dialog/course-risk-dialog.component';
import { CourseSupplementDialogComponent, SupplementPayload } from '../components/course-supplement-dialog/course-supplement-dialog.component';
import { CourseToastComponent, ToastTone } from '../components/course-toast.component';
import { LESSON_ICON, formatCurrency, formatDateTime } from '../course-utils';
import { LessonKind, WorkspaceChapter, WorkspaceFile } from '../models/course.models';
import { CourseStore } from '../services/course.store';

type WorkspaceTab = 'overview' | 'video' | 'ide' | 'quiz';

const TABS: Array<{ id: WorkspaceTab; label: string }> = [
  { id: 'overview', label: 'Thông tin chung' },
  { id: 'video', label: 'Video & bài đọc' },
  { id: 'ide', label: 'Code IDE' },
  { id: 'quiz', label: 'Quiz & tài liệu' }
];

const LANGUAGES: CustomSelectOption[] = [
  { value: 'Python 3.11', label: 'Python 3.11' },
  { value: 'JavaScript (Node 20)', label: 'JavaScript (Node 20)' },
  { value: 'Java 17', label: 'Java 17' }
];

@Component({
  selector: 'app-course-approval-workspace',
  standalone: true,
  imports: [
    NgTemplateOutlet, CustomSelectComponent,
    CourseHistoryDialogComponent, CourseRejectDialogComponent, CourseRiskDialogComponent,
    CourseSupplementDialogComponent, CourseToastComponent
  ],
  templateUrl: './approval-workspace.component.html',
  styleUrl: '../courses-page.css'
})
export class ApprovalWorkspaceComponent {
  private readonly store = inject(CourseStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly id = toSignal(this.route.paramMap.pipe(map(params => params.get('id') ?? '')), { initialValue: '' });
  readonly workspace = computed(() => this.store.workspaces().find(item => item.approvalId === this.id()) ?? null);

  readonly tabs = TABS;
  readonly tab = signal<WorkspaceTab>('overview');
  readonly collapsed = signal<ReadonlySet<string>>(new Set());
  readonly overrides = signal<Record<string, boolean>>({});
  readonly historyOpen = signal(this.route.snapshot.queryParamMap.get('history') === '1');
  readonly rejectOpen = signal(false);
  readonly supplementOpen = signal(false);
  readonly riskFile = signal<WorkspaceFile | null>(null);
  readonly language = signal('Python 3.11');
  readonly languages = LANGUAGES;
  readonly issueFlag = signal(false);
  readonly issueNote = signal('');
  readonly toast = signal<{ message: string; tone: ToastTone } | null>(null);

  readonly checklist = computed(() => (this.workspace()?.checklist ?? []).map(item => ({
    ...item,
    done: this.overrides()[item.id] ?? item.done
  })));
  readonly doneCount = computed(() => this.checklist().filter(item => item.done).length);
  readonly allDone = computed(() => this.checklist().length > 0 && this.doneCount() === this.checklist().length);
  readonly codeLines = computed(() => (this.workspace()?.ide.code ?? '').split('\n'));
  readonly lessonCount = computed(() => (this.workspace()?.chapters ?? [])
    .reduce((total, chapter) => total + chapter.lessons.length, 0));

  setTab(id: WorkspaceTab): void { this.tab.set(id); }
  toggleChapter(no: string): void {
    const next = new Set(this.collapsed());
    next.has(no) ? next.delete(no) : next.add(no);
    this.collapsed.set(next);
  }
  isCollapsed(no: string): boolean { return this.collapsed().has(no); }
  toggleCheck(id: string, done: boolean): void {
    this.overrides.update(values => ({ ...values, [id]: !done }));
  }

  icon(kind: LessonKind): string { return LESSON_ICON[kind]; }
  chapterCount(chapter: WorkspaceChapter): string { return `${chapter.lessons.length} bài`; }
  treeSummary(): string {
    return (this.workspace()?.landing.stats ?? '').split('·').slice(0, 2).join('·').trim();
  }
  questionIndex(): string {
    const question = this.workspace()?.quiz.question;
    if (!question) return '';
    return `CÂU ${String(question.index).padStart(2, '0')} / ${String(question.total).padStart(2, '0')}`;
  }
  correctAnswer(): string {
    const question = this.workspace()?.quiz.question;
    const answer = question?.answers.find(item => item.correct);
    return question && answer ? `${question.correctLetter} · ${answer.text}` : '';
  }
  fileMeta(file: WorkspaceFile): string { return `${file.size} · ${file.scanned ? 'Đã quét' : 'Chưa quét'}`; }
  testLabel(state: 'passed' | 'pending'): string { return state === 'passed' ? 'Đạt' : 'Chưa chạy'; }
  testTone(state: 'passed' | 'pending'): string { return state === 'passed' ? 'success' : 'neutral'; }
  dateTime = formatDateTime;
  money = formatCurrency;

  back(): void { this.router.navigate(['/courses/approvals']); }

  runSample(): void {
    this.notify('Đã chạy mã mẫu: 2/2 test case công khai đạt · 42 ms · 18 MB.', 'success');
  }

  nextCodeLesson(): void {
    this.notify('Đã chuyển sang bài code tiếp theo trong chương 03.', 'info');
  }

  openFile(file: WorkspaceFile): void {
    if (file.risky) {
      this.riskFile.set(file);
      return;
    }
    this.notify(`Đang mở bản xem trước ${file.name}.`, 'info');
  }

  downloadFile(file: WorkspaceFile): void {
    if (file.risky) {
      this.riskFile.set(file);
      return;
    }
    this.notify(`Đang tải ${file.name} (${file.size}).`, 'info');
  }

  closeRisk(): void { this.riskFile.set(null); }
  requestReplacement(): void {
    this.riskFile.set(null);
    this.supplementOpen.set(true);
  }

  approve(): void {
    const ws = this.workspace();
    if (!ws || !this.allDone()) return;
    this.store.approveApproval(ws.approvalId);
    this.notify('Đã phê duyệt và phát hành khóa học.', 'success');
  }

  confirmReject(payload: RejectPayload): void {
    const ws = this.workspace();
    if (!ws) return;
    this.store.rejectApproval(ws.approvalId, payload.reason, payload.detail);
    this.rejectOpen.set(false);
    this.notify('Đã từ chối xuất bản và gửi lý do tới giảng viên.', 'success');
  }

  confirmSupplement(payload: SupplementPayload): void {
    const ws = this.workspace();
    if (!ws) return;
    this.store.requestSupplement(ws.approvalId, payload.items, payload.issueType, payload.detail);
    this.supplementOpen.set(false);
    this.notify('Đã gửi yêu cầu bổ sung tới giảng viên.', 'success');
  }

  notify(message: string, tone: ToastTone): void {
    this.toast.set({ message, tone });
    setTimeout(() => { if (this.toast()?.message === message) this.toast.set(null); }, 4200);
  }
}
