import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { Location } from '@angular/common';
import { catchError, distinctUntilChanged, finalize, map, of, switchMap } from 'rxjs';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  LucideArrowLeft,
  LucideArrowRight,
  LucideChartColumn,
  LucideChartPie,
  LucideChevronDown,
  LucideChevronRight,
  LucideCircleCheck,
  LucideInfo,
  LucideLayers,
  LucideLightbulb
} from '@lucide/angular';
import { Course } from '../../../core/models/course.model';
import { CommerceService } from '../../../core/services/commerce.service';
import { ToastService } from '../../../core/services/toast.service';
import { RoadmapSkillStatus, RoadmapStage } from '../models/roadmap.model';
import { RoadmapService } from '../services/roadmap.service';
import { FlashcardService } from '../services/flashcard.service';
import { RoadmapCourseCardComponent } from '../components/roadmap-course-card/roadmap-course-card.component';
import { RoadmapProgressComponent } from '../components/roadmap-progress/roadmap-progress.component';
import { RoadmapStageIconComponent } from '../components/roadmap-stage-icon/roadmap-stage-icon.component';

interface StatusOption {
  id: RoadmapSkillStatus;
  label: string;
}

const STATUS_OPTIONS: StatusOption[] = [
  { id: 'completed', label: 'Đã hoàn thành' },
  { id: 'in-progress', label: 'Đang học' },
  { id: 'review', label: 'Ôn tập' },
  { id: 'not-started', label: 'Chưa bắt đầu' }
];

@Component({
  selector: 'app-roadmap-skill-detail',
  standalone: true,
  imports: [
    RouterLink,
    LucideArrowLeft,
    LucideArrowRight,
    LucideChartColumn,
    LucideChartPie,
    LucideChevronDown,
    LucideChevronRight,
    LucideCircleCheck,
    LucideInfo,
    LucideLayers,
    LucideLightbulb,
    RoadmapCourseCardComponent,
    RoadmapProgressComponent,
    RoadmapStageIconComponent
  ],
  templateUrl: './roadmap-skill-detail.component.html',
  styleUrls: ['../styles/roadmap-ui.css', './roadmap-skill-detail.component.css']
})
export class RoadmapSkillDetailComponent implements OnInit {
  readonly roadmapService = inject(RoadmapService);
  private readonly flashcardService = inject(FlashcardService);
  private readonly commerceService = inject(CommerceService);
  private readonly toastService = inject(ToastService);
  private readonly router = inject(Router);
  private readonly location = inject(Location);

  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly params = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap });
  get roadmapId(): string { return this.params().get('roadmapId') ?? ''; }
  get skillId(): string { return this.params().get('skillId') ?? ''; }
  readonly statusOptions = STATUS_OPTIONS;
  readonly loading = this.roadmapService.loading;
  readonly error = signal<string | null>(null);
  private creatingFlashcard = false;
  readonly savingStatus = signal(false);
  /** Left roadmap rail collapses into a dropdown so it does not push the page content down. */
  readonly sidebarOpen = signal(false);

  toggleSidebar(): void {
    this.sidebarOpen.update((open) => !open);
  }

  /** Returns to the page the user came from; falls back to the roadmap overview. */
  goBack(): void {
    if (window.history.length > 1) {
      this.location.back();
      return;
    }
    void this.router.navigate(['/learning/roadmap', this.roadmapId]);
  }

  readonly roadmap = computed(() => this.roadmapService.getRoadmapById(this.roadmapId));
  readonly skillInfo = computed(() => this.roadmapService.getSkill(this.roadmapId, this.skillId));
  readonly stage = computed<RoadmapStage | null>(() => this.skillInfo()?.stage ?? null);
  readonly skill = computed(() => this.skillInfo()?.skill ?? null);
  readonly stageProgress = computed(() => {
    const stage = this.stage();
    return stage ? this.roadmapService.getStageProgress(stage) : { completed: 0, total: 0, percent: 0 };
  });
  readonly stages = computed(() => this.roadmap()?.stages ?? []);
  readonly position = computed(() => {
    const roadmap = this.roadmap();
    const stage = this.stage();
    if (!roadmap || !stage) return '';
    return `${stage.number} / ${roadmap.stages.length}`;
  });
  readonly nextSkillTarget = computed(() => {
    const roadmap = this.roadmap();
    const next = this.skill()?.nextSkill;
    if (!roadmap || !next) return null;

    for (const stage of roadmap.stages) {
      const found = stage.skills.find((item) => item.title === next.name);
      if (found) return found;
    }
    return null;
  });
  readonly courses = signal<Course[]>([]);
  readonly coursesError = signal<string | null>(null);

  ngOnInit(): void {
    this.route.paramMap.pipe(
      map(params => params.get('skillId') ?? ''),
      distinctUntilChanged(),
      switchMap(nodeId => {
        this.courses.set([]);
        this.coursesError.set(null);
        return this.roadmapService.loadRecommendedCourses(nodeId).pipe(
          catchError(() => {
            this.coursesError.set('Không tải được khóa học gợi ý. Vui lòng thử lại sau.');
            return of([] as Course[]);
          })
        );
      }),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(courses => this.courses.set(courses));
    this.route.paramMap.pipe(
      map(params => params.get('roadmapId') ?? ''),
      distinctUntilChanged(),
      switchMap(id => {
        this.error.set(null);
        return this.roadmapService.loadRoadmap(id).pipe(
          catchError(() => {
            this.error.set('Không tải được thông tin kỹ năng. Vui lòng thử lại sau.');
            return of(null);
          })
        );
      }),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe();
  }

  changeStatus(status: RoadmapSkillStatus): void {
    const skill = this.skill();
    if (!skill?.manualStatusAllowed || this.savingStatus() || skill.status === status) return;
    this.savingStatus.set(true);
    this.roadmapService.setSkillStatus(this.roadmapId, skill.id, status).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.savingStatus.set(false))
    ).subscribe({
      next: () => this.toastService.showToast({ type: 'success', message: 'Đã lưu trạng thái kỹ năng.' }),
      error: () => this.toastService.showToast({ type: 'warning', message: 'Không thể đổi trạng thái. Hãy tải lại; kỹ năng có thể đã có kết quả học hoặc yêu cầu ôn tập.' })
    });
  }

  stagePercent(stage: RoadmapStage): number {
    return this.roadmapService.getStageProgress(stage).percent;
  }

  openTest(): void {
    if (!this.stage()?.testAvailable) return;
    this.router.navigate(['/learning/roadmap', this.roadmapId, 'test', this.stage()?.id]);
  }

  createFlashcard(): void {
    const skill = this.skill();
    if (!skill || this.creatingFlashcard) return;

    this.creatingFlashcard = true;
    this.flashcardService
      .createFromRoadmap({ nodeId: skill.id, roadmapId: this.roadmapService.getPersonalRoadmapId(this.roadmapId), title: skill.title })
      .pipe(finalize(() => this.creatingFlashcard = false))
      .subscribe({
        next: result => {
          this.router.navigate(['/learning/flashcards', result.setId, 'edit'], {
            queryParams: {
              add: '1',
              returnUrl: `/learning/roadmap/${this.roadmapId}/${skill.id}`
            }
          });
        },
        error: (error: { error?: { message?: string } }) => {
          this.toastService.showToast({
            type: 'error',
            message: error?.error?.message ?? 'Không tạo được bộ flashcard ôn tập.'
          });
        }
      });
  }

  addToCart(courseId: string): void {
    this.commerceService.addToCart(courseId).subscribe((result) => {
      this.toastService.showToast({
        type: 'success',
        message: result.added ? 'Đã thêm khóa học vào giỏ hàng.' : 'Khóa học đã có trong giỏ hàng.'
      });
    });
  }

  goToSkill(skillId: string): void {
    this.router.navigate(['/learning/roadmap', this.roadmapId, skillId]);
  }

  openNextSkill(): void {
    const target = this.nextSkillTarget();
    if (target) this.goToSkill(target.id);
  }
}
