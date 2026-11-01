import { Component, OnInit, inject, signal } from '@angular/core';
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
export class RoadmapListComponent implements OnInit {
  private readonly roadmapService = inject(RoadmapService);
  private readonly authService = inject(AuthService);
  private readonly toastService = inject(ToastService);
  private readonly router = inject(Router);

  readonly roadmaps = this.roadmapService.roadmapsList;
  readonly enrolledRoadmaps = this.roadmapService.enrolledRoadmaps;
  readonly loading = this.roadmapService.loading;
  readonly error = signal<string | null>(null);
  private readonly enrollingId = signal<string | null>(null);

  ngOnInit(): void {
    this.reload();
  }

  private reload(): void {
    this.error.set(null);
    this.roadmapService.loadCareers().subscribe({
      error: () => this.error.set('Không tải được danh sách lộ trình. Vui lòng thử lại sau.')
    });
  }

  isEnrolled(roadmapId: string): boolean {
    return this.enrolledRoadmaps().includes(roadmapId);
  }

  isEnrolling(roadmapId: string): boolean {
    return this.enrollingId() === roadmapId;
  }

  toggleEnroll(roadmap: RoadmapMetaItem): void {
    if (!this.authService.isAuthenticated()) {
      this.router.navigate(['/auth/login'], { queryParams: { returnUrl: '/learning/roadmap' } });
      return;
    }

    if (this.isEnrolled(roadmap.id)) {
      const result = this.roadmapService.unenrollRoadmap(roadmap.id);
      this.toastService.showToast({ type: 'warning', message: result.message });
      return;
    }

    if (this.enrollingId()) return;

    this.enrollingId.set(roadmap.id);
    this.roadmapService.selectRoadmap(roadmap.id).subscribe({
      next: result => {
        this.enrollingId.set(null);
        this.toastService.showToast({
          type: result.success ? 'success' : 'warning',
          message: result.message
        });
      },
      error: (error: { error?: { message?: string } }) => {
        this.enrollingId.set(null);
        this.toastService.showToast({
          type: 'warning',
          message: error?.error?.message ?? 'Không chọn được lộ trình. Vui lòng thử lại.'
        });
      }
    });
  }
}
