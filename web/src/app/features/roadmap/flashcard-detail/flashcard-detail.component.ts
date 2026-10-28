import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  LucideArrowLeft,
  LucideCalendarDays,
  LucideLayers,
  LucideLightbulb,
  LucideListOrdered,
  LucidePlay,
  LucidePlus,
  LucideRotateCcw,
  LucideShuffle,
  LucideTrash2,
  LucideX
} from '@lucide/angular';
import { FlashcardCardStatus, FlashcardStudyMode } from '../models/flashcard.model';
import { FlashcardService } from '../services/flashcard.service';
import { ToastService } from '../../../core/services/toast.service';
import { FlashcardSetIconComponent } from '../components/flashcard-set-icon/flashcard-set-icon.component';

type CardFilter = 'all' | FlashcardCardStatus;
type ListFilter = 'all' | 'learned' | 'review' | 'new';

interface StudyModeOption {
  id: FlashcardStudyMode;
  label: string;
  desc: string;
}

const STUDY_MODES: StudyModeOption[] = [
  { id: 'shuffle', label: 'Học ngẫu nhiên', desc: 'Xáo trộn thứ tự để ghi nhớ chủ động hơn' },
  { id: 'ordered', label: 'Học theo thứ tự', desc: 'Lần lượt từ thẻ đầu tiên đến thẻ cuối' },
  { id: 'review-first', label: 'Học lại từ đầu', desc: 'Ưu tiên các thẻ cần ôn tập trước' }
];

const CARD_STATUS_LABEL: Record<FlashcardCardStatus, string> = {
  learned: 'Đã học',
  review: 'Cần ôn tập',
  new: 'Chưa học'
};

@Component({
  selector: 'app-flashcard-detail',
  standalone: true,
  imports: [
    RouterLink,
    LucideArrowLeft,
    LucideCalendarDays,
    LucideLayers,
    LucideLightbulb,
    LucideListOrdered,
    LucidePlay,
    LucidePlus,
    LucideRotateCcw,
    LucideShuffle,
    LucideTrash2,
    LucideX,
    FlashcardSetIconComponent
  ],
  templateUrl: './flashcard-detail.component.html',
  styleUrls: ['../styles/roadmap-ui.css', './flashcard-detail.component.css']
})
export class FlashcardDetailComponent {
  private readonly flashcardService = inject(FlashcardService);
  private readonly toastService = inject(ToastService);
  private readonly router = inject(Router);

  readonly setId = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';
  readonly studyModes = STUDY_MODES;

  readonly cardFilter = signal<CardFilter>('all');
  readonly studyMode = signal<FlashcardStudyMode>('shuffle');
  readonly deleteConfirm = signal(false);

  readonly set = computed(() => this.flashcardService.getSet(this.setId));
  readonly stats = computed(() => {
    const set = this.set();
    return set
      ? this.flashcardService.getStats(set)
      : { total: 0, learned: 0, review: 0, fresh: 0, percent: 0 };
  });

  readonly filters = computed<Array<{ id: ListFilter; label: string; count: number }>>(() => [
    { id: 'all', label: 'Tất cả', count: this.stats().total },
    { id: 'learned', label: 'Đã học', count: this.stats().learned },
    { id: 'review', label: 'Ôn tập', count: this.stats().review },
    { id: 'new', label: 'Chưa học', count: this.stats().fresh }
  ]);

  readonly filteredCards = computed(() => {
    const set = this.set();
    if (!set) return [];
    const filter = this.cardFilter();
    return filter === 'all' ? set.cards : set.cards.filter((card) => card.status === filter);
  });

  cardStatusLabel(status: FlashcardCardStatus): string {
    return CARD_STATUS_LABEL[status];
  }

  formatDate(iso: string): string {
    const [year, month, day] = iso.split('-');
    return `${day}/${month}/${year}`;
  }

  setCardFilter(filter: CardFilter): void {
    this.cardFilter.set(filter);
  }

  chooseMode(mode: FlashcardStudyMode): void {
    this.studyMode.set(mode);
  }

  startStudy(): void {
    this.router.navigate(['/learning/flashcards', this.setId, 'study'], {
      queryParams: { mode: this.studyMode() }
    });
  }

  addCard(): void {
    this.router.navigate(['/learning/flashcards', this.setId, 'edit'], {
      queryParams: { add: '1' }
    });
  }

  confirmDelete(): void {
    this.flashcardService.deleteSet(this.setId);
    this.deleteConfirm.set(false);
    this.toastService.showToast({ type: 'success', message: 'Đã xóa bộ flashcard.' });
    this.router.navigate(['/learning/flashcards']);
  }
}
