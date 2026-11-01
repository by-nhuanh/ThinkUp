import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { LucideArrowLeft, LucideLayers, LucidePlus, LucideSave, LucideTrash2 } from '@lucide/angular';
import { FlashcardCardDraft, FlashcardSetDraft } from '../models/flashcard.model';
import { FlashcardService } from '../services/flashcard.service';
import { ToastService } from '../../../core/services/toast.service';

type DraftField = 'front' | 'back' | 'code' | 'note';

@Component({
  selector: 'app-flashcard-form',
  standalone: true,
  imports: [RouterLink, LucideArrowLeft, LucideLayers, LucidePlus, LucideSave, LucideTrash2],
  templateUrl: './flashcard-form.component.html',
  styleUrls: ['../styles/roadmap-ui.css', './flashcard-form.component.css']
})
export class FlashcardFormComponent {
  private readonly flashcardService = inject(FlashcardService);
  private readonly toastService = inject(ToastService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  private readonly editId = this.route.snapshot.paramMap.get('id');
  readonly isEdit = computed(() => Boolean(this.editId));
  readonly set = computed(() => (this.editId ? this.flashcardService.getSet(this.editId) : null));

  readonly title = signal('');
  readonly desc = signal('');
  readonly rows = signal<FlashcardCardDraft[]>([]);
  readonly submitted = signal(false);

  readonly titleError = computed(() => this.submitted() && !this.title().trim());
  readonly cardsError = computed(() => {
    if (!this.submitted()) return '';

    const rows = this.rows();
    const filled = rows.filter((row) => row.front.trim() || row.back.trim());
    if (filled.length === 0) return 'Vui lòng thêm ít nhất một flashcard.';
    if (filled.some((row) => !row.front.trim() || !row.back.trim())) {
      return 'Mỗi flashcard cần có đủ kiến thức và mô tả.';
    }
    return '';
  });
  readonly filledCount = computed(
    () => this.rows().filter((row) => row.front.trim() && row.back.trim()).length
  );

  constructor() {
    const set = this.set();
    if (set) {
      this.populateForm(set);
    } else if (this.editId) {
      this.flashcardService.loadSet(this.editId).subscribe({
        next: loaded => this.populateForm(loaded),
        error: () => this.toastService.showToast({ type: 'error', message: 'Không thể tải bộ flashcard.' })
      });
    } else {
      this.rows.set([this.createRow(), this.createRow(), this.createRow()]);
    }

    const queryTitle = this.route.snapshot.queryParamMap.get('title');
    if (!set && queryTitle) {
      this.title.set(queryTitle);
    }

    if (this.route.snapshot.queryParamMap.get('add') === '1') {
      this.addRow();
    }
  }

  private populateForm(set: NonNullable<ReturnType<FlashcardService['getSet']>>): void {
    this.title.set(set.title);
    this.desc.set(set.desc);
    this.rows.set(set.cards.map(card => ({
      key: card.id, front: card.front, back: card.back, code: card.code ?? '', note: card.note ?? ''
    })));
  }

  private createRow(): FlashcardCardDraft {
    return {
      key: `row-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      front: '',
      back: '',
      code: '',
      note: ''
    };
  }

  addRow(): void {
    this.rows.update((rows) => [...rows, this.createRow()]);
  }

  removeRow(key: string): void {
    this.rows.update((rows) => rows.filter((row) => row.key !== key));
  }

  updateTitle(event: Event): void {
    this.title.set((event.target as HTMLInputElement).value);
  }

  updateDesc(event: Event): void {
    this.desc.set((event.target as HTMLInputElement).value);
  }

  updateRow(key: string, field: DraftField, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.rows.update((rows) => rows.map((row) => (row.key === key ? { ...row, [field]: value } : row)));
  }

  rowInvalid(row: FlashcardCardDraft): boolean {
    if (!this.submitted()) return false;
    const hasContent = Boolean(row.front.trim() || row.back.trim());
    return hasContent && (!row.front.trim() || !row.back.trim());
  }

  save(event: Event): void {
    event.preventDefault();
    this.submitted.set(true);

    if (!this.title().trim() || this.cardsError()) return;

    const draft: FlashcardSetDraft = {
      title: this.title(),
      desc: this.desc(),
      cards: this.rows()
    };

    if (this.isEdit() && this.editId) {
      this.flashcardService.updateSet(this.editId, draft).subscribe({
        next: result => {
          this.toastService.showToast({ type: 'success', message: result.message });
          this.router.navigate(['/learning/flashcards', this.editId]);
        },
        error: error => this.toastService.showToast({ type: 'error', message: error?.error?.message || 'Không thể lưu bộ flashcard.' })
      });
      return;
    }

    this.flashcardService.createSet(draft).subscribe({
      next: result => {
        this.toastService.showToast({ type: 'success', message: result.message });
        this.router.navigate(['/learning/flashcards', result.setId]);
      },
      error: error => this.toastService.showToast({ type: 'error', message: error?.error?.message || 'Không thể tạo bộ flashcard.' })
    });
  }

  cancel(): void {
    if (this.isEdit() && this.editId) {
      this.router.navigate(['/learning/flashcards', this.editId]);
      return;
    }
    this.router.navigate(['/learning/flashcards']);
  }
}
