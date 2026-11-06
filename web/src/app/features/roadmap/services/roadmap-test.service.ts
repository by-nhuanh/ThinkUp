import { HttpClient } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { Observable, catchError, defer, map, of, switchMap, tap, throwError } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { RoadmapTest, RoadmapTestQuestion, RoadmapTestResult } from '../models/roadmap.model';
import { RoadmapService } from './roadmap.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';

const RESULT_STORAGE_KEY = 'thinkup-roadmap-last-test';
const DEFAULT_DURATION_MINUTES = 15;
const DRAFT_STORAGE_PREFIX = 'thinkup-roadmap-draft:';

export interface RoadmapTestDraft {
  version: 1;
  fingerprint: string;
  answers: Record<string, string>;
  currentIndex: number;
  markedIds: string[];
  expiresAt: number;
  submissionAttempted: boolean;
}

interface StageTestOptionDto {
  key: string;
  text: string;
}

interface StageTestQuestionDto {
  skill_tag?: string;
  question_id: string;
  stage_id: string;
  node_id?: string;
  question_text: string;
  options?: StageTestOptionDto[];
}

interface StageTestDto {
  stage_id: string;
  total_questions?: number;
  questions?: StageTestQuestionDto[];
}

interface NodeBreakdownDto {
  title?: string;
  correct: number;
  total: number;
  quiz_score: number;
  new_overall_score: number;
  old_status?: string;
  new_status?: string;
  is_review?: boolean;
}

interface StageTestResultDto {
  submission_id?: string;
  stage_id: string;
  total_questions: number;
  correct_count: number;
  score_percentage: number;
  passed: boolean;
  node_breakdown?: Record<string, NodeBreakdownDto>;
}

interface TestHistoryDto {
  _id: string; stage_id: string; total_questions: number; correct_count: number;
  score_percentage: number; node_breakdown?: Record<string, NodeBreakdownDto>; submitted_at: string;
}

interface Envelope<T> {
  success?: boolean;
  message?: string;
  data?: T;
}

export interface RoadmapTestSubmission {
  testId: string;
  roadmapId: string;
  stageId: string;
  stageName: string;
  result: RoadmapTestResult;
  submittedAt: string;
}

@Injectable({ providedIn: 'root' })
export class RoadmapTestService {
  private readonly http = inject(HttpClient);
  private readonly roadmapService = inject(RoadmapService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly accountId = computed(() => this.auth.currentUser()?.id);
  private readonly base = `${environment.apiUrl}/user/roadmap`;

  private readonly lastSubmissionSig = signal<RoadmapTestSubmission | null>(null);
  private readonly submissionOwner = signal<string | undefined>(undefined);

  readonly lastSubmission = computed(() => this.submissionOwner() === this.accountId() ? this.lastSubmissionSig() : null);

  constructor() {
    this.restoreSubmission();
    let previousId = this.accountId();
    effect(() => {
      const id = this.accountId();
      if (previousId && previousId !== id) {
        try {
          sessionStorage.removeItem(RESULT_STORAGE_KEY + ':' + JSON.stringify(previousId));
          for (const key of Object.keys(sessionStorage)) {
            if (key.startsWith(DRAFT_STORAGE_PREFIX)
              && JSON.parse(key.slice(DRAFT_STORAGE_PREFIX.length))[0] === previousId) sessionStorage.removeItem(key);
          }
        } catch { /* Storage may be unavailable. */ }
      }
      previousId = id;
      this.restoreSubmission();
    });
  }

  private readonly guardAccount = <T>(source: Observable<T>): Observable<T> => defer(() => {
    const token = this.auth.getToken();
    return source.pipe(map(value => {
      if (token !== this.auth.getToken()) throw new Error('Phiên đăng nhập đã thay đổi.');
      return value;
    }));
  });

  loadTest(roadmapId: string, stageId: string): Observable<RoadmapTest> {
    return this.http
      .get<Envelope<StageTestDto>>(`${this.base}/stage-test/${encodeURIComponent(stageId)}`)
      .pipe(this.guardAccount, map(response => {
        if (response.success !== true) throw new Error('Phản hồi đề thi không hợp lệ.');
        return this.mapTest(roadmapId, stageId, response.data);
      }));
  }

  loadLatestSubmission(roadmapId: string, stageId: string): Observable<RoadmapTestSubmission | null> {
    return this.http.get<Envelope<TestHistoryDto[]>>(`${this.base}/history`, { params: { stage_id: stageId } }).pipe(this.guardAccount,
      map(response => {
        if (response.success !== true || !Array.isArray(response.data)) throw new Error('Không tải được lịch sử bài test.');
        const latest = response.data.find(item => item.stage_id === stageId);
        if (!latest) return null;
        const submission: RoadmapTestSubmission = {
          testId: latest._id, roadmapId, stageId,
          stageName: this.roadmapService.getStage(roadmapId, stageId)?.name || '', submittedAt: latest.submitted_at,
          result: { score: latest.score_percentage, passed: latest.score_percentage >= 70,
            correctCount: latest.correct_count, total: latest.total_questions,
            masteredSkillIds: Object.entries(latest.node_breakdown || {}).filter(([, node]) => node.new_status === 'completed').map(([id]) => id) },
        };
        this.rememberSubmission(submission);
        return submission;
      }));
  }

  submit(test: RoadmapTest, answers: Record<string, string>): Observable<RoadmapTestSubmission> {
    if (!test.questions.length || test.questions.some(question =>
      !question.options.some(option => option.id === answers[question.id]))) {
      return throwError(() => new Error('Vui lòng chọn đáp án hợp lệ cho tất cả câu hỏi.'));
    }
    const ownerId = this.accountId();
    const payload = {
      answers: test.questions
        .map(question => ({ question_id: question.id, selected_option: answers[question.id] }))
        .filter(item => Boolean(item.selected_option))
    };

    return this.http
      .post<Envelope<StageTestResultDto>>(
        `${this.base}/stage-test/${encodeURIComponent(test.stageId)}/submit`,
        payload
      )
      .pipe(
        this.guardAccount,
        map(response => {
          if (ownerId !== this.accountId()) throw new Error('Phiên đăng nhập đã thay đổi.');
          if (response.success !== true) throw new Error('Máy chủ chưa xác nhận kết quả bài test.');
          return this.buildSubmission(test, response.data);
        }),
        tap(submission => {
          this.clearDraft(test);
          this.rememberSubmission(submission);
        }),
        switchMap(submission =>
          this.roadmapService.refreshActiveRoadmap().pipe(
            map(() => submission),
            catchError(error => {
              if (ownerId !== this.accountId()) return throwError(() => error);
              this.toast.showToast({ type: 'warning', message: 'Bài test đã được lưu, nhưng chưa tải lại được tiến độ lộ trình. Vui lòng tải lại trang.' });
              return of(submission);
            })
          )
        ),
        this.guardAccount
      );
  }

  /** Số câu đã trả lời của đề, dùng cho panel danh sách câu hỏi. */
  countAnswered(test: RoadmapTest, answers: Record<string, string>): number {
    return test.questions.filter(question => Boolean(answers[question.id])).length;
  }

  isAnswered(question: RoadmapTestQuestion, answers: Record<string, string>): boolean {
    return Boolean(answers[question.id]);
  }

  private draftKey(test: RoadmapTest): string | null {
    const userId = this.auth.currentUser()?.id;
    return userId ? DRAFT_STORAGE_PREFIX + JSON.stringify([userId, test.roadmapId, test.stageId]) : null;
  }

  private fingerprint(test: RoadmapTest): string {
    // Reject drafts if question content, order, options, or duration changed.
    return JSON.stringify([test.durationMinutes, test.questions.map(question =>
      [question.id, question.prompt, question.code, question.options])]);
  }

  loadDraft(test: RoadmapTest): RoadmapTestDraft | null {
    const key = this.draftKey(test);
    if (!key) return null;
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return null;
      const draft = JSON.parse(raw) as RoadmapTestDraft;
      const valid = draft?.version === 1 && draft.fingerprint === this.fingerprint(test)
        && typeof draft.submissionAttempted === 'boolean'
        && Number.isFinite(draft.expiresAt) && draft.expiresAt > 0
        && draft.expiresAt <= Date.now() + test.durationMinutes * 60_000
        && Number.isInteger(draft.currentIndex) && draft.currentIndex >= 0
        && draft.currentIndex < test.questions.length
        && draft.answers && typeof draft.answers === 'object' && !Array.isArray(draft.answers)
        && Object.entries(draft.answers).every(([id, option]) =>
          test.questions.some(question => question.id === id && question.options.some(item => item.id === option)))
        && Array.isArray(draft.markedIds) && draft.markedIds.every(id => test.questions.some(question => question.id === id));
      if (valid) return draft;
      sessionStorage.removeItem(key);
    } catch {
      // Corrupt or unavailable storage cannot be used as a valid attempt.
    }
    return null;
  }

  saveDraft(test: RoadmapTest, state: Omit<RoadmapTestDraft, 'version' | 'fingerprint'>): boolean {
    const key = this.draftKey(test);
    if (!key) return false;
    try {
      sessionStorage.setItem(key, JSON.stringify({ ...state, version: 1, fingerprint: this.fingerprint(test) }));
      return true;
    } catch { return false; }
  }

  clearDraft(test: RoadmapTest): void {
    const key = this.draftKey(test);
    if (!key) return;
    try { sessionStorage.removeItem(key); } catch { /* Storage may be disabled. */ }
  }

  private mapTest(roadmapId: string, stageId: string, dto: StageTestDto | undefined): RoadmapTest {
    if (!dto?.questions?.length || dto.stage_id !== stageId
      || dto.total_questions !== dto.questions.length
      || new Set(dto.questions.map(question => question.question_id)).size !== dto.questions.length) {
      throw new Error('Giai đoạn này chưa có bộ câu hỏi đánh giá.');
    }

    const stage = this.roadmapService.getStage(roadmapId, stageId);
    const questions: RoadmapTestQuestion[] = dto.questions.map(question => ({
      id: question.question_id,
      prompt: question.question_text,
      options: (question.options ?? []).map(option => ({ id: option.key, label: option.text })),
      skillId: question.node_id ?? '',
      tag: question.skill_tag ?? ''
    }));

    return {
      id: dto.stage_id,
      roadmapId,
      stageId,
      title: stage?.name ?? 'Đánh giá năng lực giai đoạn',
      subtitle: stage?.desc || 'Hoàn thành bài test để hệ thống xác định mức độ nắm vững từng kỹ năng.',
      durationMinutes: DEFAULT_DURATION_MINUTES,
      questions
    };
  }

  private buildSubmission(test: RoadmapTest, dto: StageTestResultDto | undefined): RoadmapTestSubmission {
    if (!dto?.submission_id || dto.stage_id !== test.stageId || typeof dto.passed !== 'boolean'
      || !Number.isFinite(dto.score_percentage) || dto.total_questions !== test.questions.length
      || !Number.isInteger(dto.correct_count) || dto.correct_count < 0 || dto.correct_count > dto.total_questions) {
      throw new Error('Máy chủ không trả về kết quả bài test.');
    }

    const breakdown = Object.entries(dto.node_breakdown ?? {});
    const masteredSkillIds = breakdown
      .filter(([, node]) => node.new_status === 'completed')
      .map(([nodeId]) => nodeId);

    const result: RoadmapTestResult = {
      score: dto.score_percentage,
      passed: dto.passed,
      correctCount: dto.correct_count,
      total: dto.total_questions,
      masteredSkillIds
    };

    return {
      testId: dto.submission_id,
      roadmapId: test.roadmapId,
      stageId: test.stageId,
      stageName: test.title,
      result,
      submittedAt: new Date().toISOString()
    };
  }

  private rememberSubmission(submission: RoadmapTestSubmission): void {
    const ownerId = this.accountId();
    this.submissionOwner.set(ownerId);
    this.lastSubmissionSig.set(submission);
    try {
      if (ownerId) sessionStorage.setItem(RESULT_STORAGE_KEY + ':' + JSON.stringify(ownerId), JSON.stringify({ ownerId, submission }));
    } catch {
      // Bỏ qua lỗi quota/storage bị chặn.
    }
  }

  private restoreSubmission(): void {
    const ownerId = this.accountId();
    this.submissionOwner.set(ownerId);
    this.lastSubmissionSig.set(null);
    try {
      // Older unscoped snapshots cannot establish which account owns the result.
      sessionStorage.removeItem(RESULT_STORAGE_KEY);
      const stored = ownerId ? sessionStorage.getItem(RESULT_STORAGE_KEY + ':' + JSON.stringify(ownerId)) : null;
      if (stored) {
        const snapshot = JSON.parse(stored) as { ownerId: string; submission: RoadmapTestSubmission };
        if (snapshot.ownerId === ownerId && snapshot.submission?.testId && snapshot.submission.result
          && snapshot.submission.roadmapId && snapshot.submission.stageId) {
          this.lastSubmissionSig.set(snapshot.submission);
        }
      }
    } catch {
      // Bỏ qua dữ liệu phiên hỏng.
    }
  }
}
