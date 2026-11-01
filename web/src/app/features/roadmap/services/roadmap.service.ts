import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, forkJoin, map, of, switchMap, tap, catchError, throwError } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  RoadmapDetail,
  RoadmapDifficulty,
  RoadmapMetaItem,
  RoadmapProgress,
  RoadmapSkill,
  RoadmapSkillStatus,
  RoadmapStage,
  RoadmapStageProgress
} from '../models/roadmap.model';

interface CareerDto {
  category_id: number;
  career_name: string;
  description?: string;
  total_stages?: number;
  total_nodes?: number;
  has_custom_template?: boolean;
}

interface NodeDto {
  node_id: string;
  title: string;
  level?: string;
  tags?: string[];
  description?: string;
  status?: string;
  score?: number;
  is_review?: boolean;
  last_quiz_score?: number | null;
  course_score?: number | null;
}

interface StageDto {
  stage_id: string;
  title: string;
  description?: string;
  order?: number;
  nodes?: NodeDto[];
}

interface TemplateDto {
  category_id: number;
  career_name: string;
  description?: string;
  stages?: StageDto[];
}

interface MyRoadmapDto {
  has_roadmap: boolean;
  category_id?: number;
  career_name?: string;
  current_stage_id?: string;
  overall_progress?: number;
  progress_percentage?: number;
  total_nodes?: number;
  completed_nodes?: number;
  stages?: StageDto[];
}

interface Envelope<T> {
  success?: boolean;
  data?: T;
}

interface SelectResultDto {
  category_id?: number;
  career_name?: string;
  is_active?: boolean;
}

const STAGE_PALETTE = [
  { icon: 'foundation', tint: '#E8F1FF', accent: '#155DFC' },
  { icon: 'code', tint: '#E9FBF5', accent: '#0FA97C' },
  { icon: 'framework', tint: '#FFF4E6', accent: '#E08A1E' },
  { icon: 'shield', tint: '#F3EDFF', accent: '#7A4DFF' },
  { icon: 'sparkles', tint: '#FFEFF5', accent: '#E0457B' },
  { icon: 'people', tint: '#E9F7FF', accent: '#0B84C7' }
] as const;

export const MASTERY_THRESHOLD = 70;

function mapSkillStatus(status?: string): RoadmapSkillStatus {
  switch (status) {
    case 'completed':
      return 'completed';
    case 'in_progress':
      return 'in-progress';
    case 'review':
      return 'review';
    default:
      return 'not-started';
  }
}

function mapDifficulty(level?: string): RoadmapDifficulty {
  if (level === 'advanced') return 'Nâng cao';
  if (level === 'intermediate') return 'Trung cấp';
  return 'Cơ bản';
}

@Injectable({ providedIn: 'root' })
export class RoadmapService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/user/roadmap`;

  private readonly roadmapsSig = signal<RoadmapMetaItem[]>([]);
  private readonly detailsSig = signal<Record<string, RoadmapDetail>>({});
  private readonly myRoadmapSig = signal<MyRoadmapDto | null>(null);
  private readonly loadingSig = signal(false);

  readonly roadmapsList = computed(() => this.roadmapsSig());
  readonly loading = computed(() => this.loadingSig());
  readonly enrolledRoadmaps = computed(() => {
    const my = this.myRoadmapSig();
    return my?.has_roadmap && my.category_id != null ? [String(my.category_id)] : [];
  });
  readonly roadmapIds = computed(() => Object.keys(this.detailsSig()));

  loadCareers(): Observable<RoadmapMetaItem[]> {
    this.loadingSig.set(true);
    return forkJoin([this.http.get<Envelope<CareerDto[]>>(`${this.base}/careers`), this.loadMyRoadmap()]).pipe(
      map(([response]) => (response.data ?? []).map(item => this.mapCareer(item))),
      tap(items => {
        this.roadmapsSig.set(items);
        this.loadingSig.set(false);
      }),
      catchError(error => {
        this.loadingSig.set(false);
        return throwError(() => error);
      })
    );
  }

  loadMyRoadmap(): Observable<MyRoadmapDto | null> {
    return this.http.get<Envelope<MyRoadmapDto>>(`${this.base}/my-roadmap`).pipe(
      map(response => response.data ?? null),
      tap(data => this.myRoadmapSig.set(data)),
      catchError(() => {
        this.myRoadmapSig.set(null);
        return of(null);
      })
    );
  }

  loadRoadmap(categoryId: string): Observable<RoadmapDetail | null> {
    this.loadingSig.set(true);
    return forkJoin([
      this.http.get<Envelope<TemplateDto>>(`${this.base}/template/${encodeURIComponent(categoryId)}`),
      this.loadMyRoadmap()
    ]).pipe(
      map(([response, my]) => {
        const detail = this.mapTemplate(response.data, my);
        if (detail) this.detailsSig.update(cache => ({ ...cache, [categoryId]: detail }));
        return detail;
      }),
      tap(() => this.loadingSig.set(false)),
      catchError(error => {
        this.loadingSig.set(false);
        return throwError(() => error);
      })
    );
  }

  /** Tải lại lộ trình đang kích hoạt sau khi trạng thái node thay đổi (ví dụ sau bài test). */
  refreshActiveRoadmap(): Observable<RoadmapDetail | null> {
    return this.loadMyRoadmap().pipe(
      switchMap(my => {
        if (!my?.has_roadmap || my.category_id == null) return of(null);
        return this.loadRoadmap(String(my.category_id));
      })
    );
  }

  selectRoadmap(categoryId: string): Observable<{ success: boolean; message: string }> {
    return this.http.post<{ success: boolean; message: string; data?: SelectResultDto }>(
      `${this.base}/select`,
      { category_id: Number(categoryId) }
    ).pipe(
      tap(() => this.loadMyRoadmap().subscribe()),
      map(response => ({ success: response.success !== false, message: response.message }))
    );
  }

  /**
   * Backend hiện chưa có endpoint hủy lộ trình; chọn lộ trình khác sẽ tự vô hiệu hóa lộ trình cũ.
   */
  unenrollRoadmap(_roadmapId: string): { success: boolean; message: string } {
    return {
      success: false,
      message: 'API chưa hỗ trợ hủy lộ trình. Hãy chọn lộ trình khác để thay thế.'
    };
  }

  getRoadmapById(id: string): RoadmapDetail | null {
    return this.detailsSig()[id] ?? null;
  }

  getRoadmapMeta(id: string): RoadmapMetaItem | null {
    return this.roadmapsSig().find(item => item.id === id) ?? null;
  }

  getStage(roadmapId: string, stageId: string): RoadmapStage | null {
    return this.getRoadmapById(roadmapId)?.stages.find(stage => stage.id === stageId) ?? null;
  }

  getSkill(roadmapId: string, skillId: string): { stage: RoadmapStage; skill: RoadmapSkill } | null {
    const roadmap = this.getRoadmapById(roadmapId);
    if (!roadmap) return null;
    for (const stage of roadmap.stages) {
      const skill = stage.skills.find(item => item.id === skillId);
      if (skill) return { stage, skill };
    }
    return null;
  }

  isEnrolled(roadmapId: string): boolean {
    return this.enrolledRoadmaps().includes(roadmapId);
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
    const completed = stage.skills.filter(skill => skill.status === 'completed').length;
    return { completed, total, percent: total === 0 ? 0 : Math.round((completed / total) * 100) };
  }

  getActiveStageId(roadmapId: string): string | null {
    const roadmap = this.getRoadmapById(roadmapId);
    if (!roadmap) return null;
    const active = roadmap.stages.find(stage => this.getStageProgress(stage).percent < 100);
    return active?.id ?? roadmap.stages[roadmap.stages.length - 1]?.id ?? null;
  }

  private mapCareer(dto: CareerDto): RoadmapMetaItem {
    const title = dto.career_name?.trim() || `Lộ trình ${dto.category_id}`;
    const palette = STAGE_PALETTE[dto.category_id % STAGE_PALETTE.length];
    return {
      id: String(dto.category_id),
      title,
      cardTitle: title,
      shortCode: title
        .split(/\s+/)
        .map(part => part[0])
        .join('')
        .slice(0, 4)
        .toUpperCase(),
      color: palette.accent,
      bgColor: palette.tint,
      desc: dto.description || '',
      stagesCount: dto.total_stages ?? 0,
      skillsCount: dto.total_nodes ?? 0
    };
  }

  private mapTemplate(dto: TemplateDto | undefined, my: MyRoadmapDto | null): RoadmapDetail | null {
    if (!dto?.stages?.length) return null;

    const categoryId = String(dto.category_id);
    const isActive = my?.has_roadmap && String(my.category_id) === categoryId;
    const statusByNode = new Map<string, NodeDto>();
    if (isActive) {
      for (const node of my?.stages?.flatMap(stage => stage.nodes ?? []) ?? []) {
        statusByNode.set(node.node_id, node);
      }
    }

    const stages: RoadmapStage[] = dto.stages.map((stage, index) => {
      const palette = STAGE_PALETTE[index % STAGE_PALETTE.length];
      return {
        id: stage.stage_id,
        number: stage.order ?? index + 1,
        name: stage.title,
        desc: stage.description || '',
        icon: palette.icon,
        tint: palette.tint,
        accent: palette.accent,
        skills: (stage.nodes ?? []).map(node =>
          this.mapSkill(node, statusByNode.get(node.node_id), stage.stage_id)
        )
      };
    });

    return {
      id: categoryId,
      title: dto.career_name,
      desc: dto.description || '',
      stages
    };
  }

  private mapSkill(node: NodeDto, state: NodeDto | undefined, stageId: string): RoadmapSkill {
    const source = state ?? node;
    const status = mapSkillStatus(source.status);
    const mastery = typeof source.score === 'number' ? source.score : 0;

    return {
      id: node.node_id,
      title: node.title,
      desc: node.description || '',
      summary: node.description || '',
      status,
      mastery,
      difficulty: mapDifficulty(node.level),
      type: node.tags?.[0] || 'Kỹ năng',
      outcomes: [],
      prerequisites: [],
      nextSkill: null,
      courseIds: [],
      stageId
    };
  }
}
