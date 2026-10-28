import { Injectable, computed, signal } from '@angular/core';
import {
  RoadmapDetail,
  RoadmapMetaItem,
  RoadmapProgress,
  RoadmapSkill,
  RoadmapSkillStatus,
  RoadmapStage,
  RoadmapStageProgress,
  RoadmapTestResult
} from '../models/roadmap.model';
import { ROADMAPS_DATA, ROADMAPS_LIST } from '../../../core/data/mock/mock-roadmaps';

const STORAGE_KEY = 'thinkup-roadmap-storage';
const STORAGE_VERSION = 2;

interface PersistedSkillState {
  status: RoadmapSkillStatus;
  mastery: number;
}

interface PersistedTestState {
  score: number;
  correctCount: number;
  total: number;
  submittedAt: string;
}

interface PersistedState {
  version: number;
  enrolled: string[];
  statuses: Record<string, Record<string, PersistedSkillState>>;
  tests: Record<string, PersistedTestState>;
}

/** Điểm năng lực tối thiểu để một kỹ năng được coi là đạt chuẩn. */
export const MASTERY_THRESHOLD = 70;

function cloneRoadmaps(): Record<string, RoadmapDetail> {
  return JSON.parse(JSON.stringify(ROADMAPS_DATA)) as Record<string, RoadmapDetail>;
}

@Injectable({ providedIn: 'root' })
export class RoadmapService {
  private readonly roadmapsSig = signal<Record<string, RoadmapDetail>>(cloneRoadmaps());
  private readonly enrolledSig = signal<string[]>([]);
  private readonly testResultsSig = signal<Record<string, PersistedTestState>>({});
  private readonly statusesSig = signal<Record<string, Record<string, PersistedSkillState>>>({});

  readonly roadmapsList = signal<RoadmapMetaItem[]>(ROADMAPS_LIST);
  readonly enrolledRoadmaps = computed(() => this.enrolledSig());
  readonly roadmapIds = computed(() => Object.keys(this.roadmapsSig()));
  readonly testResults = computed(() => this.testResultsSig());

  constructor() {
    this.initFromStorage();
  }

  private initFromStorage(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as PersistedState;
        if (parsed.version === STORAGE_VERSION) {
          this.enrolledSig.set(Array.isArray(parsed.enrolled) ? parsed.enrolled : []);
          this.testResultsSig.set(parsed.tests ?? {});
          this.statusesSig.set(parsed.statuses ?? {});
          this.applyStatuses();
          return;
        }
      }
    } catch {
      // Dữ liệu cũ hoặc hỏng: bỏ qua và seed lại từ mock.
    }
    this.applyStatuses();
    this.persist();
  }

  private applyStatuses(): void {
    const roadmaps = cloneRoadmaps();
    const statuses = this.statusesSig();

    for (const [roadmapId, skillMap] of Object.entries(statuses)) {
      const roadmap = roadmaps[roadmapId];
      if (!roadmap) continue;

      for (const stage of roadmap.stages) {
        for (const skill of stage.skills) {
          const persisted = skillMap[skill.id];
          if (!persisted) continue;
          skill.status = persisted.status;
          skill.mastery = persisted.mastery;
        }
      }
    }

    this.roadmapsSig.set(roadmaps);
  }

  private persist(): void {
    try {
      const state: PersistedState = {
        version: STORAGE_VERSION,
        enrolled: this.enrolledSig(),
        statuses: this.statusesSig(),
        tests: this.testResultsSig()
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Bỏ qua lỗi quota/storage bị chặn.
    }
  }

  private mutateSkill(roadmapId: string, skillId: string, patch: Partial<PersistedSkillState>): void {
    const current = { ...this.statusesSig() };
    const roadmapStatuses = { ...(current[roadmapId] ?? {}) };
    const previous = roadmapStatuses[skillId] ?? { status: 'not-started' as RoadmapSkillStatus, mastery: 0 };
    roadmapStatuses[skillId] = { ...previous, ...patch };
    current[roadmapId] = roadmapStatuses;
    this.statusesSig.set(current);
  }

  getRoadmapById(id: string): RoadmapDetail | null {
    return this.roadmapsSig()[id] ?? null;
  }

  getRoadmapMeta(id: string): RoadmapMetaItem | null {
    return this.roadmapsList().find((item) => item.id === id) ?? null;
  }

  getStage(roadmapId: string, stageId: string): RoadmapStage | null {
    return this.getRoadmapById(roadmapId)?.stages.find((stage) => stage.id === stageId) ?? null;
  }

  getSkill(roadmapId: string, skillId: string): { stage: RoadmapStage; skill: RoadmapSkill } | null {
    const roadmap = this.getRoadmapById(roadmapId);
    if (!roadmap) return null;
    for (const stage of roadmap.stages) {
      const skill = stage.skills.find((item) => item.id === skillId);
      if (skill) return { stage, skill };
    }
    return null;
  }

  isEnrolled(roadmapId: string): boolean {
    return this.enrolledSig().includes(roadmapId);
  }

  enrollRoadmap(roadmapId: string): { success: boolean; message: string } {
    const enrolled = this.enrolledSig();
    if (enrolled.includes(roadmapId)) {
      return { success: true, message: 'Bạn đã chọn lộ trình này.' };
    }
    if (enrolled.length >= 1) {
      return { success: false, message: 'Bạn chỉ được chọn 1 lộ trình học cùng lúc.' };
    }

    this.enrolledSig.set([roadmapId]);
    this.persist();
    return { success: true, message: 'Đã chọn lộ trình học thành công!' };
  }

  unenrollRoadmap(roadmapId: string): void {
    this.enrolledSig.set(this.enrolledSig().filter((id) => id !== roadmapId));
    this.persist();
  }

  updateSkillStatus(roadmapId: string, skillId: string, status: RoadmapSkillStatus): void {
    const mastery =
      status === 'completed' ? 100 : status === 'review' ? 45 : status === 'in-progress' ? 30 : 0;

    this.mutateSkill(roadmapId, skillId, { status, mastery });
    this.applyStatuses();
    this.persist();
  }

  /** Áp dụng kết quả bài test: kỹ năng đạt chuẩn → completed, còn lại → review. */
  applyTestResult(roadmapId: string, stageId: string, result: RoadmapTestResult): void {
    const stage = this.getStage(roadmapId, stageId);
    if (!stage) return;

    for (const skill of stage.skills) {
      const mastered = result.masteredSkillIds.includes(skill.id);
      this.mutateSkill(roadmapId, skill.id, {
        status: mastered ? 'completed' : 'review',
        mastery: mastered ? Math.max(MASTERY_THRESHOLD, result.score) : Math.min(result.score, 60)
      });
    }

    this.applyStatuses();
    this.persist();
  }

  recordTestResult(testId: string, result: RoadmapTestResult): void {
    const current = { ...this.testResultsSig() };
    current[testId] = {
      score: result.score,
      correctCount: result.correctCount,
      total: result.total,
      submittedAt: new Date().toISOString()
    };
    this.testResultsSig.set(current);
    this.persist();
  }

  getTestResult(testId: string): PersistedTestState | null {
    return this.testResultsSig()[testId] ?? null;
  }

  getProgress(roadmapId: string): RoadmapProgress {
    const roadmap = this.getRoadmapById(roadmapId);
    if (!roadmap) return { completed: 0, total: 0, percent: 0 };

    let completed = 0;
    let total = 0;
    for (const stage of roadmap.stages) {
      for (const skill of stage.skills) {
        total += 1;
        if (skill.status === 'completed') completed += 1;
      }
    }

    return {
      completed,
      total,
      percent: total === 0 ? 0 : Math.round((completed / total) * 100)
    };
  }

  getStageProgress(stage: RoadmapStage): RoadmapStageProgress {
    const total = stage.skills.length;
    const completed = stage.skills.filter((skill) => skill.status === 'completed').length;
    return { completed, total, percent: total === 0 ? 0 : Math.round((completed / total) * 100) };
  }

  /** Giai đoạn đang học: giai đoạn đầu tiên chưa hoàn thành, mặc định là giai đoạn 1. */
  getActiveStageId(roadmapId: string): string | null {
    const roadmap = this.getRoadmapById(roadmapId);
    if (!roadmap) return null;
    const active = roadmap.stages.find((stage) => this.getStageProgress(stage).percent < 100);
    return active?.id ?? roadmap.stages[roadmap.stages.length - 1]?.id ?? null;
  }
}
