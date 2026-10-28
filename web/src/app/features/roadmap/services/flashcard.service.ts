import { Injectable, computed, signal } from '@angular/core';
import {
  FlashcardCard,
  FlashcardCardStatus,
  FlashcardListFilter,
  FlashcardSet,
  FlashcardSetDraft,
  FlashcardSetStats,
  FlashcardStudyMode
} from '../models/flashcard.model';
import { MOCK_FLASHCARD_SETS } from '../../../core/data/mock/roadmap/roadmap-flashcards';

const STORAGE_KEY = 'thinkup-flashcard-storage';
const STORAGE_VERSION = 1;

interface PersistedState {
  version: number;
  sets: FlashcardSet[];
}

export type FlashcardSetState = 'learning' | 'review' | 'completed';

function cloneSets(): FlashcardSet[] {
  return JSON.parse(JSON.stringify(MOCK_FLASHCARD_SETS)) as FlashcardSet[];
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

@Injectable({ providedIn: 'root' })
export class FlashcardService {
  private readonly setsSig = signal<FlashcardSet[]>(cloneSets());

  readonly sets = computed(() => this.setsSig());

  constructor() {
    this.initFromStorage();
  }

  private initFromStorage(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as PersistedState;
        if (parsed.version === STORAGE_VERSION && Array.isArray(parsed.sets)) {
          this.setsSig.set(parsed.sets);
          return;
        }
      }
    } catch {
      // Dữ liệu hỏng: dùng mock.
    }
    this.persist();
  }

  private persist(): void {
    try {
      const state: PersistedState = { version: STORAGE_VERSION, sets: this.setsSig() };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Bỏ qua quota.
    }
  }

  getSet(id: string): FlashcardSet | null {
    return this.setsSig().find((set) => set.id === id) ?? null;
  }

  getStats(set: FlashcardSet): FlashcardSetStats {
    const total = set.cards.length;
    const learned = set.cards.filter((card) => card.status === 'learned').length;
    const review = set.cards.filter((card) => card.status === 'review').length;
    const fresh = set.cards.filter((card) => card.status === 'new').length;

    return {
      total,
      learned,
      review,
      fresh,
      percent: total === 0 ? 0 : Math.round((learned / total) * 100)
    };
  }

  getSetState(set: FlashcardSet): FlashcardSetState {
    const stats = this.getStats(set);
    if (stats.total > 0 && stats.learned === stats.total) return 'completed';
    if (stats.review > 0) return 'review';
    return 'learning';
  }

  countByFilter(filter: FlashcardListFilter): number {
    if (filter === 'all') return this.setsSig().length;
    return this.setsSig().filter((set) => this.getSetState(set) === filter).length;
  }

  matchesFilter(set: FlashcardSet, filter: FlashcardListFilter): boolean {
    return filter === 'all' || this.getSetState(set) === filter;
  }

  createSet(draft: FlashcardSetDraft): { success: boolean; message: string; setId?: string } {
    const validation = this.validateDraft(draft);
    if (!validation.success) return validation;

    const id = `set-${Date.now()}`;
    const set: FlashcardSet = {
      id,
      title: draft.title.trim(),
      desc: draft.desc.trim(),
      icon: 'code',
      tint: '#E6F4FF',
      accent: '#0088E8',
      createdAt: todayIso(),
      cards: this.draftToCards(draft, [])
    };

    this.setsSig.set([set, ...this.setsSig()]);
    this.persist();
    return { success: true, message: 'Đã tạo bộ flashcard mới.', setId: id };
  }

  updateSet(setId: string, draft: FlashcardSetDraft): { success: boolean; message: string } {
    const validation = this.validateDraft(draft);
    if (!validation.success) return validation;

    const existing = this.getSet(setId);
    if (!existing) return { success: false, message: 'Không tìm thấy bộ flashcard.' };

    const updated: FlashcardSet = {
      ...existing,
      title: draft.title.trim(),
      desc: draft.desc.trim(),
      cards: this.draftToCards(draft, existing.cards)
    };

    this.setsSig.set(this.setsSig().map((set) => (set.id === setId ? updated : set)));
    this.persist();
    return { success: true, message: 'Đã lưu thay đổi bộ flashcard.' };
  }

  deleteSet(setId: string): void {
    this.setsSig.set(this.setsSig().filter((set) => set.id !== setId));
    this.persist();
  }

  updateCardStatus(setId: string, cardId: string, status: FlashcardCardStatus): void {
    const set = this.getSet(setId);
    if (!set) return;

    const updated: FlashcardSet = {
      ...set,
      cards: set.cards.map((card) => (card.id === cardId ? { ...card, status } : card))
    };

    this.setsSig.set(this.setsSig().map((item) => (item.id === setId ? updated : item)));
    this.persist();
  }

  updateCard(setId: string, cardId: string, patch: Partial<Pick<FlashcardCard, 'front' | 'back' | 'code' | 'note'>>): void {
    const set = this.getSet(setId);
    if (!set) return;

    const updated: FlashcardSet = {
      ...set,
      cards: set.cards.map((card) => (card.id === cardId ? { ...card, ...patch } : card))
    };

    this.setsSig.set(this.setsSig().map((item) => (item.id === setId ? updated : item)));
    this.persist();
  }

  /** Tạo hàng đợi ôn tập theo chế độ người dùng chọn ở sidebar. */
  buildStudyQueue(setId: string, mode: FlashcardStudyMode): FlashcardCard[] {
    const set = this.getSet(setId);
    if (!set) return [];

    const cards = [...set.cards];
    if (mode === 'shuffle') return this.shuffle(cards);

    if (mode === 'review-first') {
      const order: Record<FlashcardCardStatus, number> = { review: 0, new: 1, learned: 2 };
      return cards.sort((a, b) => order[a.status] - order[b.status]);
    }

    return cards;
  }

  private shuffle(cards: FlashcardCard[]): FlashcardCard[] {
    const result = [...cards];
    for (let i = result.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  private validateDraft(draft: FlashcardSetDraft): { success: boolean; message: string } {
    if (!draft.title.trim()) {
      return { success: false, message: 'Vui lòng nhập tiêu đề bộ flashcard.' };
    }

    const filled = draft.cards.filter((card) => card.front.trim() || card.back.trim());
    if (filled.length === 0) {
      return { success: false, message: 'Vui lòng thêm ít nhất một flashcard.' };
    }

    const incomplete = filled.find((card) => !card.front.trim() || !card.back.trim());
    if (incomplete) {
      return { success: false, message: 'Mỗi flashcard cần có đủ kiến thức và mô tả.' };
    }

    return { success: true, message: '' };
  }

  private draftToCards(draft: FlashcardSetDraft, existingCards: FlashcardCard[]): FlashcardCard[] {
    const existing = new Map(existingCards.map((card) => [card.id, card]));
    const stamp = Date.now();

    return draft.cards
      .filter((card) => card.front.trim() && card.back.trim())
      .map((card, index) => {
        const matched = existing.get(card.key);
        return {
          id: matched?.id ?? `card-${stamp}-${index + 1}`,
          front: card.front.trim(),
          back: card.back.trim(),
          ...(card.code.trim() ? { code: card.code.trim() } : {}),
          ...(card.note.trim() ? { note: card.note.trim() } : {}),
          status: matched?.status ?? 'new'
        } satisfies FlashcardCard;
      });
  }
}
