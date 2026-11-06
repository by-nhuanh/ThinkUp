import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { LucideArrowLeft, LucideCircleCheck, LucideFileText, LucideLayers, LucidePercent, LucideRotateCcw } from '@lucide/angular';
import { FlashcardService } from '../services/flashcard.service';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-flashcard-complete',
  standalone: true,
  imports: [RouterLink, LucideArrowLeft, LucideCircleCheck, LucideFileText, LucideLayers, LucidePercent, LucideRotateCcw],
  templateUrl: './flashcard-complete.component.html',
  styleUrls: ['../styles/roadmap-ui.css', './flashcard-complete.component.css']
})
export class FlashcardCompleteComponent {
  private readonly flashcardService = inject(FlashcardService);
  private readonly router = inject(Router);
  private readonly toastService = inject(ToastService);

  readonly setId = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';

  readonly set = computed(() => this.flashcardService.getSet(this.setId));
  readonly stats = computed(() => {
    const set = this.set();
    return set
      ? this.flashcardService.getStats(set)
      : { total: 0, learned: 0, review: 0, fresh: 0, percent: 0 };
  });

  constructor() {
    this.flashcardService.loadSet(this.setId).subscribe({
      error: () => this.toastService.showToast({ type: 'error', message: 'Không thể tải kết quả flashcard.' })
    });
  }

  restart(): void {
    this.router.navigate(['/learning/flashcards', this.setId, 'study'], {
      queryParams: { mode: 'review-first' }
    });
  }

  reviewAgain(): void {
    this.router.navigate(['/learning/flashcards', this.setId, 'study'], {
      queryParams: { mode: 'ordered', filter: 'review' }
    });
  }
}
