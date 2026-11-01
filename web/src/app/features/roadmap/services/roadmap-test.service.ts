import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, map, of, switchMap, tap } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { RoadmapTest, RoadmapTestQuestion, RoadmapTestResult } from '../models/roadmap.model';
import { RoadmapService } from './roadmap.service';

const RESULT_STORAGE_KEY = 'thinkup-roadmap-last-test';
const DEFAULT_DURATION_MINUTES = 15;

interface StageTestOptionDto {
  key: string;
  text: string;
}

interface StageTestQuestionDto {
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
  private readonly base = `${environment.apiUrl}/user/roadmap`;

  private readonly lastSubmissionSig = signal<RoadmapTestSubmission | null>(null);

  readonly lastSubmission = this.lastSubmissionSig.asReadonly();

  constructor() {
    this.restoreSubmission();
  }

  loadTest(roadmapId: string, stageId: string): Observable<RoadmapTest> {
    return this.http
      .get<Envelope<StageTestDto>>(`${this.base}/stage-test/${encodeURIComponent(stageId)}`)
      .pipe(map(response => this.mapTest(roadmapId, stageId, response.data)));
  }

  submit(test: RoadmapTest, answers: Record<string, string>): Observable<RoadmapTestSubmission> {
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
        map(response => this.buildSubmission(test, response.data)),
        tap(submission => this.rememberSubmission(submission)),
        switchMap(submission =>
          this.roadmapService.refreshActiveRoadmap().pipe(
            map(() => submission),
            catchError(() => of(submission))
          )
        )
      );
  }

  /** Số câu đã trả lời của đề, dùng cho panel danh sách câu hỏi. */
  countAnswered(test: RoadmapTest, answers: Record<string, string>): number {
    return test.questions.filter(question => Boolean(answers[question.id])).length;
  }

  isAnswered(question: RoadmapTestQuestion, answers: Record<string, string>): boolean {
    return Boolean(answers[question.id]);
  }

  private mapTest(roadmapId: string, stageId: string, dto: StageTestDto | undefined): RoadmapTest {
    if (!dto?.questions?.length) {
      throw new Error('Giai đoạn này chưa có bộ câu hỏi đánh giá.');
    }

    const stage = this.roadmapService.getStage(roadmapId, stageId);
    const questions: RoadmapTestQuestion[] = dto.questions.map(question => ({
      id: question.question_id,
      prompt: question.question_text,
      options: (question.options ?? []).map(option => ({ id: option.key, label: option.text })),
      skillId: question.node_id ?? '',
      tag: question.node_id ?? ''
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
    if (!dto) {
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
      testId: dto.submission_id ?? test.id,
      roadmapId: test.roadmapId,
      stageId: test.stageId,
      stageName: test.title,
      result,
      submittedAt: new Date().toISOString()
    };
  }

  private rememberSubmission(submission: RoadmapTestSubmission): void {
    this.lastSubmissionSig.set(submission);
    try {
      sessionStorage.setItem(RESULT_STORAGE_KEY, JSON.stringify(submission));
    } catch {
      // Bỏ qua lỗi quota/storage bị chặn.
    }
  }

  private restoreSubmission(): void {
    try {
      const stored = sessionStorage.getItem(RESULT_STORAGE_KEY);
      if (stored) {
        this.lastSubmissionSig.set(JSON.parse(stored) as RoadmapTestSubmission);
      }
    } catch {
      // Bỏ qua dữ liệu phiên hỏng.
    }
  }
}
