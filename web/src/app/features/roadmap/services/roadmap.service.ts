import { HttpClient } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, defer, forkJoin, map, of, switchMap, tap, catchError, throwError } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../../core/services/auth.service';
import { Course } from '../../../core/models/course.model';
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
  short_code?: string;
  color?: string;
  bg_color?: string;
}

interface NodeDto {
  prerequisites?: string[];
  next_skill?: { name: string; description: string } | null;
  outcomes?: string[];
  manual_status_allowed?: boolean;
  status_lock_reason?: string | null;
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
  total_nodes?: number;
  completed_nodes?: number;
  progress_percentage?: number;
  test_available?: boolean;
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
  roadmap_id?: string;
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

interface RecommendedCourseDto {
  id: string;
  course_id?: string;
  slug?: string;
  title: string;
  instructor_name?: string;
  instructor_id?: string | null;
  thumbnail_url?: string;
  rating: number;
  rating_count: number;
  total_students?: number;
  tags?: string[];
  original_price?: number;
  sale_price?: number;
  price?: { original: number; sale: number };
  level?: string;
  is_in_wishlist?: boolean;
  is_in_cart?: boolean;
  is_purchased?: boolean;
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

export const MASTERY_THRESHOLD = 80;

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
  private readonly auth = inject(AuthService);
  private readonly accountId = computed(() => this.auth.currentUser()?.id);
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

  constructor() {
    effect(() => {
      this.accountId();
      this.detailsSig.set({});
      this.myRoadmapSig.set(null);
    });
  }

  // Discard a response from a session that ended or changed while it was pending.
  private readonly guardAccount = <T>(source: Observable<T>): Observable<T> => defer(() => {
    const token = this.auth.getToken();
    return source.pipe(map(value => {
      if (token !== this.auth.getToken()) throw new Error('Phiên đăng nhập đã thay đổi.');
      return value;
    }));
  });

  loadCareers(): Observable<RoadmapMetaItem[]> {
    this.loadingSig.set(true);
    return forkJoin([this.http.get<Envelope<CareerDto[]>>(`${this.base}/careers`), this.loadMyRoadmap()]).pipe(this.guardAccount,
      map(([response]) => {
        if (response.success !== true || !Array.isArray(response.data)) throw new Error('Phản hồi danh sách lộ trình không hợp lệ.');
        return response.data.map(item => this.mapCareer(item));
      }),
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
    // Public templates remain usable by guests; authenticated failures must surface.
    if (!this.auth.isAuthenticated()) {
      this.myRoadmapSig.set(null);
      this.detailsSig.set({});
      return of(null);
    }
    const accountToken = this.auth.getToken();
    return this.http.get<Envelope<MyRoadmapDto>>(`${this.base}/my-roadmap`).pipe(this.guardAccount,
      map(response => {
        if (response.success !== true || typeof response.data?.has_roadmap !== 'boolean') throw new Error('Phản hồi lộ trình không hợp lệ.');
        return response.data;
      }),
      tap(data => this.myRoadmapSig.set(data)),
      catchError(error => {
        if (accountToken === this.auth.getToken()) {
          this.myRoadmapSig.set(null);
          this.detailsSig.set({});
        }
        return throwError(() => error);
      })
    );
  }

  loadRoadmap(categoryId: string): Observable<RoadmapDetail | null> {
    this.loadingSig.set(true);
    return forkJoin([
      this.http.get<Envelope<TemplateDto>>(`${this.base}/template/${encodeURIComponent(categoryId)}`),
      this.loadMyRoadmap().pipe(switchMap(my => {
        if (!my?.has_roadmap) return of(my);
        return this.syncCourseProgress().pipe(switchMap(result => result.synced ? this.loadMyRoadmap() : of(my)));
      }))
    ]).pipe(this.guardAccount,
      map(([response, my]) => {
        if (response.success !== true) throw new Error('Phản hồi cấu trúc lộ trình không hợp lệ.');
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

  syncCourseProgress(): Observable<{ synced: boolean }> {
    return this.http.post<Envelope<{ synced: boolean }>>(`${this.base}/sync-course`, {}).pipe(this.guardAccount,
      map(response => {
        if (response.success !== true || typeof response.data?.synced !== 'boolean') throw new Error('Không đồng bộ được tiến độ khóa học vào lộ trình.');
        return response.data;
      }),
      catchError((error: unknown) => {
        // 404: user chua co lo trinh active -> khong can sync, khong throw
        if (error instanceof HttpErrorResponse && error.status === 404) {
          return of({ synced: false });
        }
        return throwError(() => error);
      }));
  }

  /** Tải lại lộ trình đang kích hoạt sau khi trạng thái node thay đổi (ví dụ sau bài test). */
  refreshActiveRoadmap(): Observable<RoadmapDetail | null> {
    return this.loadMyRoadmap().pipe(this.guardAccount,
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
    ).pipe(this.guardAccount,
      tap(response => {
        if (response.success !== true) throw new Error('Máy chủ chưa xác nhận chọn lộ trình.');
        this.detailsSig.set({});
      }),
      switchMap(response => this.loadRoadmap(categoryId).pipe(this.guardAccount,
        map(() => ({ success: response.success, message: response.message }))
      ))
    );
  }

  getPersonalRoadmapId(categoryId: string): string | undefined {
    const my = this.myRoadmapSig();
    return my?.has_roadmap && String(my.category_id) === categoryId ? my.roadmap_id : undefined;
  }

  loadRecommendedCourses(nodeId: string): Observable<Course[]> {
    return this.http.get<Envelope<RecommendedCourseDto[]>>(
      `${this.base}/nodes/${encodeURIComponent(nodeId)}/recommended-courses`
    ).pipe(this.guardAccount, map(response => {
      if (response.success !== true || !Array.isArray(response.data)) throw new Error('Phản hồi khóa học gợi ý không hợp lệ.');
      return response.data.map(course => {
        const originalPrice = course.original_price ?? course.price?.original;
        const salePrice = course.sale_price ?? course.price?.sale;
        if (typeof originalPrice !== 'number' || typeof salePrice !== 'number') throw new Error('Khóa học gợi ý thiếu thông tin giá.');
        return {
          id: course.course_id || course.id, slug: course.slug, title: course.title,
          instructor: course.instructor_name || 'Chưa cập nhật giảng viên', instructorId: course.instructor_id || undefined,
          thumbnailUrl: course.thumbnail_url, rating: course.rating, ratingCount: course.rating_count,
          studentsCount: course.total_students, tags: course.tags, originalPrice, salePrice,
          level: course.level ? mapDifficulty(course.level) : undefined, isInWishlist: course.is_in_wishlist,
          isInCart: course.is_in_cart, isPurchased: course.is_purchased,
        };
      });
    }));
  }

  setSkillStatus(categoryId: string, nodeId: string, status: RoadmapSkillStatus): Observable<void> {
    const apiStatus = status === 'not-started' ? 'not_started' : status === 'in-progress' ? 'in_progress' : status;
    return this.http.patch<{ success: boolean }>(`${this.base}/nodes/${encodeURIComponent(nodeId)}/status`, {
      status: apiStatus
    }).pipe(this.guardAccount,
      tap(response => {
        if (response.success !== true) throw new Error('Máy chủ chưa xác nhận trạng thái kỹ năng.');
      }),
      switchMap(() => this.loadRoadmap(categoryId)),
      map(() => undefined)
    );
  }

  /** Hủy kích hoạt; server giữ nguyên tiến độ để có thể chọn lại. */
  unenrollRoadmap(categoryId: string): Observable<{ success: boolean; message: string }> {
    return this.http.post<{ success: boolean; message: string }>(
      `${this.base}/unselect`, { category_id: Number(categoryId) }
    ).pipe(this.guardAccount,
      tap(response => {
        if (response.success !== true) throw new Error('Máy chủ chưa xác nhận hủy chọn lộ trình.');
        this.detailsSig.set({});
      }),
      switchMap(response => this.loadRoadmap(categoryId).pipe(this.guardAccount,
        map(() => ({ success: response.success, message: response.message }))
      ))
    );
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
    return roadmap.apiProgress ?? { completed: 0, total: roadmap.stages.reduce((sum, stage) => sum + stage.skills.length, 0), percent: 0 };
  }

  getStageProgress(stage: RoadmapStage): RoadmapStageProgress {
    return stage.apiProgress ?? { completed: 0, total: stage.skills.length, percent: 0 };
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
      shortCode: dto.short_code || title
        .split(/\s+/)
        .map(part => part[0])
        .join('')
        .slice(0, 4)
        .toUpperCase(),
      color: dto.color || palette.accent,
      bgColor: dto.bg_color || palette.tint,
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

    const sourceStages = dto.stages;
    const stages: RoadmapStage[] = sourceStages.map((stage, index) => {
      const palette = STAGE_PALETTE[index % STAGE_PALETTE.length];
      const personalStage = isActive ? my?.stages?.find(item => item.stage_id === stage.stage_id) : undefined;
      if (isActive && !personalStage) throw new Error('Cấu trúc lộ trình cá nhân chưa đồng bộ. Vui lòng tải lại.');
      return {
        id: stage.stage_id,
        testAvailable: (isActive ? personalStage?.test_available : stage.test_available) === true,
        apiProgress: personalStage ? this.mapProgress(personalStage) : undefined,
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
      apiProgress: isActive && my ? this.mapProgress(my) : undefined,
      title: dto.career_name,
      desc: dto.description || '',
      stages
    };
  }

  private mapProgress(dto: { total_nodes?: number; completed_nodes?: number; progress_percentage?: number }): RoadmapProgress {
    const { total_nodes: total, completed_nodes: completed, progress_percentage: percent } = dto;
    if (typeof total !== 'number' || typeof completed !== 'number' || typeof percent !== 'number'
      || !Number.isInteger(total) || !Number.isInteger(completed) || !Number.isFinite(percent)
      || total < 0 || completed < 0 || completed > total || percent < 0 || percent > 100) {
      throw new Error('Phản hồi tiến độ lộ trình không hợp lệ.');
    }
    return { total, completed, percent };
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
      manualStatusAllowed: state?.manual_status_allowed === true,
      statusLockReason: state?.status_lock_reason ?? null,
      mastery,
      difficulty: mapDifficulty(node.level),
      type: node.tags?.[0] || 'Kỹ năng',
      outcomes: node.outcomes ?? [],
      prerequisites: node.prerequisites ?? [],
      nextSkill: node.next_skill ?? null,
      courseIds: [],
      stageId
    };
  }
}
