import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { LucideArrowRight, LucideBookmark, LucideCircleCheck } from '@lucide/angular';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { RoadmapMetaItem } from '../models/roadmap.model';
import { RoadmapService } from '../services/roadmap.service';

@Component({
  selector: 'app-roadmap-list',
  standalone: true,
  imports: [RouterLink, LucideArrowRight, LucideBookmark, LucideCircleCheck],
  templateUrl: './roadmap-list.component.html',
  styleUrls: ['../styles/roadmap-ui.css', './roadmap-list.component.css']
})
export class RoadmapListComponent {
  private readonly roadmapService = inject(RoadmapService);
  private readonly authService = inject(AuthService);
  private readonly toastService = inject(ToastService);
  private readonly router = inject(Router);

  readonly roadmaps = this.roadmapService.roadmapsList;
  readonly enrolledRoadmaps = this.roadmapService.enrolledRoadmaps;

  isEnrolled(roadmapId: string): boolean {
    return this.enrolledRoadmaps().includes(roadmapId);
  }

  toggleEnroll(roadmap: RoadmapMetaItem): void {
    if (!this.authService.isAuthenticated()) {
      this.router.navigate(['/auth/login'], { queryParams: { returnUrl: '/learning/roadmap' } });
      return;
    }

    if (this.isEnrolled(roadmap.id)) {
      this.roadmapService.unenrollRoadmap(roadmap.id);
      this.toastService.showToast({ type: 'success', message: 'Đã hủy chọn lộ trình học.' });
      return;
    }

    const result = this.roadmapService.enrollRoadmap(roadmap.id);
    this.toastService.showToast({
      type: result.success ? 'success' : 'warning',
      message: result.message
    });
  }
}
