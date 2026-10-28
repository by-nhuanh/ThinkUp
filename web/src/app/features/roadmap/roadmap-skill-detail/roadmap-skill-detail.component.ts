import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  LucideArrowRight,
  LucideChartColumn,
  LucideChartPie,
  LucideChevronRight,
  LucideCircleCheck,
  LucideInfo,
  LucideLayers,
  LucideLightbulb
} from '@lucide/angular';
import { Course } from '../../../core/models/course.model';
import { MOCK_COURSES } from '../../../core/data/mock/mock-courses';
import { CommerceService } from '../../../core/services/commerce.service';
import { ToastService } from '../../../core/services/toast.service';
import { RoadmapSkillStatus, RoadmapStage } from '../models/roadmap.model';
import { RoadmapService } from '../services/roadmap.service';
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
    LucideArrowRight,
    LucideChartColumn,
    LucideChartPie,
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
export class RoadmapSkillDetailComponent {
  readonly roadmapService = inject(RoadmapService);
  private readonly commerceService = inject(CommerceService);
  private readonly toastService = inject(ToastService);
  private readonly router = inject(Router);

  private readonly params = inject(ActivatedRoute).snapshot.paramMap;
  readonly roadmapId = this.params.get('roadmapId') ?? '';
  readonly skillId = this.params.get('skillId') ?? '';
  readonly statusOptions = STATUS_OPTIONS;

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
  readonly courses = computed<Course[]>(() => {
    const skill = this.skill();
    if (!skill) return [];
    return skill.courseIds
      .map((id) => MOCK_COURSES.find((course) => course.id === id))
      .filter((course): course is Course => Boolean(course))
      .slice(0, 2);
  });

  stagePercent(stage: RoadmapStage): number {
    return this.roadmapService.getStageProgress(stage).percent;
  }

  setStatus(status: RoadmapSkillStatus): void {
    const skill = this.skill();
    if (!skill || skill.status === status) return;

    this.roadmapService.updateSkillStatus(this.roadmapId, skill.id, status);
    const label = STATUS_OPTIONS.find((option) => option.id === status)?.label ?? '';
    this.toastService.showToast({
      type: status === 'review' ? 'warning' : 'success',
      message: `Đã cập nhật trạng thái: ${label}`
    });
  }

  openTest(): void {
    this.router.navigate(['/learning/roadmap', this.roadmapId, 'test', this.stage()?.id]);
  }

  createFlashcard(): void {
    this.router.navigate(['/learning/flashcards/new'], {
      queryParams: { title: `Ôn tập ${this.skill()?.title ?? 'kỹ năng'}` }
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
