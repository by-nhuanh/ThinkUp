import { Injectable, inject, signal } from '@angular/core';
import { RoadmapTest, RoadmapTestQuestion, RoadmapTestResult } from '../models/roadmap.model';
import { buildStageTest } from '../../../core/data/mock/roadmap/roadmap-tests';
import { RoadmapService } from './roadmap.service';

const RESULT_STORAGE_KEY = 'thinkup-roadmap-last-test';

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
  private readonly roadmapService = inject(RoadmapService);
  private readonly lastSubmissionSig = signal<RoadmapTestSubmission | null>(null);

  readonly lastSubmission = this.lastSubmissionSig.asReadonly();

  constructor() {
    this.restoreSubmission();
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

  getTest(roadmapId: string, stageId: string): RoadmapTest | null {
    const stage = this.roadmapService.getStage(roadmapId, stageId);
    if (!stage) return null;
    return buildStageTest(roadmapId, stage);
  }

  submit(test: RoadmapTest, answers: Record<string, string>): RoadmapTestSubmission {
    const result = this.evaluate(test, answers);

    this.roadmapService.recordTestResult(test.id, result);
    this.roadmapService.applyTestResult(test.roadmapId, test.stageId, result);

    const submission: RoadmapTestSubmission = {
      testId: test.id,
      roadmapId: test.roadmapId,
      stageId: test.stageId,
      stageName: test.title,
      result,
      submittedAt: new Date().toISOString()
    };

    this.lastSubmissionSig.set(submission);
    try {
      sessionStorage.setItem(RESULT_STORAGE_KEY, JSON.stringify(submission));
    } catch {
      // Bỏ qua quota.
    }

    return submission;
  }

  private evaluate(test: RoadmapTest, answers: Record<string, string>): RoadmapTestResult {
    const perSkill = new Map<string, { correct: number; total: number }>();
    let correctCount = 0;

    for (const question of test.questions) {
      const stat = perSkill.get(question.skillId) ?? { correct: 0, total: 0 };
      stat.total += 1;
      if (answers[question.id] === question.correctOptionId) {
        stat.correct += 1;
        correctCount += 1;
      }
      perSkill.set(question.skillId, stat);
    }

    const masteredSkillIds = [...perSkill.entries()]
      .filter(([, stat]) => stat.correct / stat.total >= 0.7)
      .map(([skillId]) => skillId);

    const total = test.questions.length;
    const score = total === 0 ? 0 : Math.round((correctCount / total) * 100);

    return {
      score,
      passed: score >= 70,
      correctCount,
      total,
      masteredSkillIds
    };
  }

  /** Số câu đã trả lời của đề, dùng cho panel danh sách câu hỏi. */
  countAnswered(test: RoadmapTest, answers: Record<string, string>): number {
    return test.questions.filter((question) => Boolean(answers[question.id])).length;
  }

  isAnswered(question: RoadmapTestQuestion, answers: Record<string, string>): boolean {
    return Boolean(answers[question.id]);
  }
}
