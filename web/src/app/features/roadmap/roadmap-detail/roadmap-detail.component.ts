import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  LucideArrowRight,
  LucideBookmark,
  LucideChevronDown,
  LucideChevronRight,
  LucideCircleCheck,
  LucideSearch
} from '@lucide/angular';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { RoadmapSkill, RoadmapStage } from '../models/roadmap.model';
import { RoadmapService } from '../services/roadmap.service';
import { RoadmapProgressComponent } from '../components/roadmap-progress/roadmap-progress.component';
import { RoadmapStageIconComponent } from '../components/roadmap-stage-icon/roadmap-stage-icon.component';
import { RoadmapStatusChipComponent } from '../components/roadmap-status-chip/roadmap-status-chip.component';

type StageFilter = 'all' | 'completed' | 'in-progress' | 'not-started';

const FILTERS: Array<{ id: StageFilter; label: string }> = [
  { id: 'all', label: 'Tất cả' },
  { id: 'completed', label: 'Đã hoàn thành' },
  { id: 'in-progress', label: 'Đang học' },
  { id: 'not-started', label: 'Chưa bắt đầu' }
];

@Component({
  selector: 'app-roadmap-detail',
  standalone: true,
  imports: [
    RouterLink,
    LucideArrowRight,
    LucideBookmark,
    LucideChevronDown,
    LucideChevronRight,
    LucideCircleCheck,
    LucideSearch,
    RoadmapProgressComponent,
    RoadmapStageIconComponent,
    RoadmapStatusChipComponent
  ],
  templateUrl: './roadmap-detail.component.html',
  styleUrls: ['../styles/roadmap-ui.css', './roadmap-detail.component.css']
})
export class RoadmapDetailComponent {
  private readonly roadmapService = inject(RoadmapService);
  private readonly authService = inject(AuthService);
  private readonly toastService = inject(ToastService);
  private readonly router = inject(Router);

  readonly roadmapId = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';
  readonly filters = FILTERS;

  readonly searchKeyword = signal('');
  readonly statusFilter = signal<StageFilter>('all');
  private readonly expandedStageIds = signal<ReadonlySet<string>>(new Set());

  readonly roadmap = computed(() => this.roadmapService.getRoadmapById(this.roadmapId));
  readonly progress = computed(() => this.roadmapService.getProgress(this.roadmapId));
  readonly isEnrolled = computed(() => this.roadmapService.isEnrolled(this.roadmapId));

  readonly visibleStages = computed<RoadmapStage[]>(() => {
    const roadmap = this.roadmap();
    if (!roadmap) return [];

    const keyword = this.searchKeyword().trim().toLowerCase();
    const filter = this.statusFilter();

    return roadmap.stages
      .map((stage) => {
        const skills = stage.skills.filter((skill) => {
          const matchesKeyword =
            !keyword ||
            skill.title.toLowerCase().includes(keyword) ||
            skill.desc.toLowerCase().includes(keyword);
          return matchesKeyword && this.matchesFilter(skill, filter);
        });

        const stageMatchesKeyword =
          !keyword ||
          stage.name.toLowerCase().includes(keyword) ||
          stage.desc.toLowerCase().includes(keyword);

        return { stage, skills, visible: skills.length > 0 || (stageMatchesKeyword && filter === 'all') };
      })
      .filter((entry) => entry.visible)
      .map((entry) => entry.stage);
  });

  readonly hasActiveFilters = computed(
    () => this.searchKeyword().trim().length > 0 || this.statusFilter() !== 'all'
  );

  constructor() {
    const firstOpenStage = this.roadmap()?.stages.find(
      (stage) => this.roadmapService.getStageProgress(stage).percent < 100
    );
    if (firstOpenStage) {
      this.expandedStageIds.set(new Set([firstOpenStage.id]));
    }
  }

  private matchesFilter(skill: RoadmapSkill, filter: StageFilter): boolean {
    if (filter === 'all') return true;
    if (filter === 'in-progress') return skill.status === 'in-progress' || skill.status === 'review';
    return skill.status === filter;
  }

  stageProgress(stage: RoadmapStage) {
    return this.roadmapService.getStageProgress(stage);
  }

  isExpanded(stage: RoadmapStage): boolean {
    if (this.hasActiveFilters()) return true;
    return this.expandedStageIds().has(stage.id);
  }

  toggleStage(stage: RoadmapStage): void {
    const next = new Set(this.expandedStageIds());
    if (next.has(stage.id)) {
      next.delete(stage.id);
    } else {
      next.add(stage.id);
    }
    this.expandedStageIds.set(next);
  }

  visibleChips(stage: RoadmapStage): RoadmapSkill[] {
    return this.stageSkills(stage).slice(0, 5);
  }

  hiddenChipCount(stage: RoadmapStage): number {
    return Math.max(0, this.stageSkills(stage).length - 5);
  }

  stageSkills(stage: RoadmapStage): RoadmapSkill[] {
    const keyword = this.searchKeyword().trim().toLowerCase();
    const filter = this.statusFilter();

    return stage.skills.filter((skill) => {
      const matchesKeyword =
        !keyword ||
        skill.title.toLowerCase().includes(keyword) ||
        skill.desc.toLowerCase().includes(keyword) ||
        stage.name.toLowerCase().includes(keyword);
      return matchesKeyword && this.matchesFilter(skill, filter);
    });
  }

  setFilter(filter: StageFilter): void {
    this.statusFilter.set(filter);
  }

  onSearchInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.searchKeyword.set(target.value);
  }

  clearFilters(): void {
    this.searchKeyword.set('');
    this.statusFilter.set('all');
  }

  toggleEnroll(): void {
    if (!this.authService.isAuthenticated()) {
      this.router.navigate(['/auth/login'], {
        queryParams: { returnUrl: `/learning/roadmap/${this.roadmapId}` }
      });
      return;
    }

    if (this.isEnrolled()) {
      this.roadmapService.unenrollRoadmap(this.roadmapId);
      this.toastService.showToast({ type: 'success', message: 'Đã hủy chọn lộ trình học.' });
      return;
    }

    const result = this.roadmapService.enrollRoadmap(this.roadmapId);
    this.toastService.showToast({
      type: result.success ? 'success' : 'warning',
      message: result.message
    });
  }

  testLink(stage: RoadmapStage): string[] {
    return ['/learning/roadmap', this.roadmapId, 'test', stage.id];
  }

  skillLink(stage: RoadmapStage, skill: RoadmapSkill): string[] {
    return ['/learning/roadmap', this.roadmapId, skill.id];
  }
}
