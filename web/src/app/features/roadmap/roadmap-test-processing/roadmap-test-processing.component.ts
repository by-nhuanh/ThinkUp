import { Component, DestroyRef, OnDestroy, OnInit, computed, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { RoadmapTestService } from '../services/roadmap-test.service';

@Component({
  selector: 'app-roadmap-test-processing',
  standalone: true,
  templateUrl: './roadmap-test-processing.component.html',
  styleUrls: ['../styles/roadmap-ui.css', './roadmap-test-processing.component.css']
})
export class RoadmapTestProcessingComponent implements OnInit, OnDestroy {
  private readonly testService = inject(RoadmapTestService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  private readonly params = inject(ActivatedRoute).snapshot.paramMap;
  readonly roadmapId = this.params.get('roadmapId') ?? '';
  readonly stageId = this.params.get('stageId') ?? '';

  readonly submission = computed(() => {
    const result = this.testService.lastSubmission();
    return result?.roadmapId === this.roadmapId && result.stageId === this.stageId ? result : null;
  });
  private redirectId: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    if (!this.submission()) {
      this.testService.loadLatestSubmission(this.roadmapId, this.stageId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: submission => {
          if (submission) this.scheduleRedirect();
          else this.router.navigate(['/learning/roadmap', this.roadmapId], { replaceUrl: true });
        },
        error: () => this.router.navigate(['/learning/roadmap', this.roadmapId], { replaceUrl: true }),
      });
      return;
    }
    this.scheduleRedirect();
  }

  private scheduleRedirect(): void {
    this.redirectId = setTimeout(() => {
      this.router.navigate(['/learning/roadmap', this.roadmapId, 'test', this.stageId, 'result'], {
        replaceUrl: true
      });
    }, 2200);
  }

  ngOnDestroy(): void {
    if (this.redirectId !== null) {
      clearTimeout(this.redirectId);
    }
  }
}
