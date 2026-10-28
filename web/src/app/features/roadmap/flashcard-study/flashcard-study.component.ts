import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  LucideArrowLeft,
  LucideArrowRight,
  LucideCheck,
  LucideCircleCheck,
  LucideCircleX,
  LucideCodeXml,
  LucideEye,
  LucideEyeOff,
  LucideLogOut
} from '@lucide/angular';
import { FlashcardCard, FlashcardStudyMode } from '../models/flashcard.model';
import { FlashcardService } from '../services/flashcard.service';
import { ToastService } from '../../../core/services/toast.service';
import { RoadmapProgressComponent } from '../components/roadmap-progress/roadmap-progress.component';
import { FlashcardSetIconComponent } from '../components/flashcard-set-icon/flashcard-set-icon.component';

const VALID_MODES: FlashcardStudyMode[] = ['shuffle', 'ordered', 'review-first'];

@Component({
  selector: 'app-flashcard-study',
  standalone: true,
  imports: [
    RouterLink,
    LucideArrowLeft,
    LucideArrowRight,
    LucideCheck,
    LucideCircleCheck,
    LucideCircleX,
    LucideCodeXml,
    LucideEye,
    LucideEyeOff,
    LucideLogOut,
    RoadmapProgressComponent,
    FlashcardSetIconComponent
  ],
  templateUrl: './flashcard-study.component.html',
  styleUrls: ['../styles/roadmap-ui.css', './flashcard-study.component.css']
})
export class FlashcardStudyComponent {
  private readonly flashcardService = inject(FlashcardService);
  private readonly toastService = inject(ToastService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly setId = this.route.snapshot.paramMap.get('id') ?? '';
  readonly mode = this.resolveMode(this.route.snapshot.queryParamMap.get('mode'));

  readonly queue = signal<FlashcardCard[]>([]);
  readonly currentIndex = signal(0);
  readonly flipped = signal(false);

  readonly set = computed(() => this.flashcardService.getSet(this.setId));
  readonly card = computed<FlashcardCard | null>(() => this.queue()[this.currentIndex()] ?? null);
  readonly total = computed(() => this.queue().length);
  readonly stats = computed(() => {
    const set = this.set();
    return set
      ? this.flashcardService.getStats(set)
      : { total: 0, learned: 0, review: 0, fresh: 0, percent: 0 };
  });
  readonly isLast = computed(() => this.currentIndex() >= this.total() - 1);
  readonly codeLines = computed(() => (this.card()?.code ?? '').split('\n').filter((line) => line.length > 0));

  constructor() {
    const queue = this.flashcardService.buildStudyQueue(this.setId, this.mode);
    const filter = this.route.snapshot.queryParamMap.get('filter');
    this.queue.set(
      filter === 'review' ? queue.filter((card) => card.status === 'review') : queue
    );
  }

  private resolveMode(value: string | null): FlashcardStudyMode {
    return VALID_MODES.includes(value as FlashcardStudyMode) ? (value as FlashcardStudyMode) : 'shuffle';
  }

  toggleAnswer(): void {
    this.flipped.update((value) => !value);
  }

  previous(): void {
    if (this.currentIndex() === 0) return;
    this.currentIndex.update((index) => index - 1);
    this.flipped.set(false);
  }

  next(): void {
    if (this.isLast()) return;
    this.currentIndex.update((index) => index + 1);
    this.flipped.set(false);
  }

  mark(status: 'learned' | 'review'): void {
    const card = this.card();
    if (!card) return;

    this.flashcardService.updateCardStatus(this.setId, card.id, status);

    if (status === 'review') {
      this.toastService.showToast({
        type: 'warning',
        message: 'Đã đưa thẻ vào danh sách cần ôn tập.'
      });
    }

    if (this.isLast()) {
      this.router.navigate(['/learning/flashcards', this.setId, 'complete']);
      return;
    }

    this.flipped.set(false);
    this.currentIndex.update((index) => index + 1);
  }

  exit(): void {
    this.router.navigate(['/learning/flashcards', this.setId]);
  }
}
