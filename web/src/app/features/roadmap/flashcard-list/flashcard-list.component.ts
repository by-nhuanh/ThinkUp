import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  LucideArrowLeft,
  LucideCalendarDays,
  LucideLayers,
  LucidePencil,
  LucidePlay,
  LucidePlus,
  LucideRotateCcw,
  LucideSearch
} from '@lucide/angular';
import { FlashcardListFilter, FlashcardSet } from '../models/flashcard.model';
import { FlashcardService } from '../services/flashcard.service';
import { FlashcardSetIconComponent } from '../components/flashcard-set-icon/flashcard-set-icon.component';
import { RoadmapProgressComponent } from '../components/roadmap-progress/roadmap-progress.component';

interface FilterOption {
  id: FlashcardListFilter;
  label: string;
}

const FILTERS: FilterOption[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'learning', label: 'Đang học' },
  { id: 'review', label: 'Ôn tập' },
  { id: 'completed', label: 'Đã hoàn thành' }
];

@Component({
  selector: 'app-flashcard-list',
  standalone: true,
  imports: [
    RouterLink,
    LucideArrowLeft,
    LucideCalendarDays,
    LucideLayers,
    LucidePencil,
    LucidePlay,
    LucidePlus,
    LucideRotateCcw,
    LucideSearch,
    FlashcardSetIconComponent,
    RoadmapProgressComponent
  ],
  templateUrl: './flashcard-list.component.html',
  styleUrls: ['../styles/roadmap-ui.css', './flashcard-list.component.css']
})
export class FlashcardListComponent {
  private readonly flashcardService = inject(FlashcardService);
  private readonly router = inject(Router);

  readonly filters = FILTERS;
  readonly activeFilter = signal<FlashcardListFilter>('all');
  readonly keyword = signal('');
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly sets = this.flashcardService.sets;
  readonly counts = computed<Record<FlashcardListFilter, number>>(() => ({
    all: this.flashcardService.countByFilter('all'),
    learning: this.flashcardService.countByFilter('learning'),
    review: this.flashcardService.countByFilter('review'),
    completed: this.flashcardService.countByFilter('completed')
  }));

  readonly filteredSets = computed(() => {
    const filter = this.activeFilter();
    const keyword = this.keyword().trim().toLowerCase();

    return this.sets().filter((set) => {
      const matchesFilter = this.flashcardService.matchesFilter(set, filter);
      const matchesKeyword =
        !keyword || set.title.toLowerCase().includes(keyword) || set.desc.toLowerCase().includes(keyword);
      return matchesFilter && matchesKeyword;
    });
  });

  constructor() {
    this.flashcardService.loadSets().subscribe({
      next: () => this.loading.set(false),
      error: () => {
        this.loading.set(false);
        this.error.set('Không tải được danh sách flashcard. Vui lòng thử lại sau.');
      }
    });
  }

  setFilter(filter: FlashcardListFilter): void {
    this.activeFilter.set(filter);
  }

  onSearchInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.keyword.set(target.value);
  }

  clearSearch(): void {
    this.keyword.set('');
  }

  stats(set: FlashcardSet) {
    return this.flashcardService.getStats(set);
  }

  isCompleted(set: FlashcardSet): boolean {
    return this.flashcardService.getSetState(set) === 'completed';
  }

  formatDate(iso: string): string {
    const [year, month, day] = iso.split('-');
    return `${day}/${month}/${year}`;
  }

  openSet(setId: string): void {
    this.router.navigate(['/learning/flashcards', setId]);
  }

  study(setId: string, event: Event): void {
    event.stopPropagation();
    this.router.navigate(['/learning/flashcards', setId, 'study']);
  }

  edit(setId: string, event: Event): void {
    event.stopPropagation();
    this.router.navigate(['/learning/flashcards', setId, 'edit']);
  }
}
