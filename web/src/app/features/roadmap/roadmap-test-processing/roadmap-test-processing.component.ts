import { Component, OnDestroy, OnInit, computed, inject } from '@angular/core';
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

  private readonly params = inject(ActivatedRoute).snapshot.paramMap;
  readonly roadmapId = this.params.get('roadmapId') ?? '';
  readonly stageId = this.params.get('stageId') ?? '';

  readonly submission = computed(() => this.testService.lastSubmission());
  private redirectId: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    if (!this.submission()) {
      this.router.navigate(['/learning/roadmap', this.roadmapId], { replaceUrl: true });
      return;
    }

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
