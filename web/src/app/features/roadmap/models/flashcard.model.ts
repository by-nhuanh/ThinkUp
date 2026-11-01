/** Trạng thái một thẻ flashcard trong phiên ôn tập. */
export type FlashcardCardStatus = 'new' | 'review' | 'learned';

/** Trạng thái tổng của bộ flashcard. */
export type FlashcardSetStatus = 'learning' | 'review' | 'completed';

export interface FlashcardCard {
  id: string;
  /** Trường "Kiến thức" (bắt buộc). */
  front: string;
  /** Trường "Mô tả" (bắt buộc). */
  back: string;
  /** Trường "Code" (tùy chọn). */
  code?: string;
  /** Trường "Chú thích" (tùy chọn). */
  note?: string;
  status: FlashcardCardStatus;
}

export interface FlashcardSet {
  id: string;
  title: string;
  desc: string;
  /** Khoá icon hiển thị (xem `flashcard-set-icon`). */
  icon: string;
  tint: string;
  accent: string;
  /** ISO date. */
  createdAt: string;
  cards: FlashcardCard[];
  nodeId?: string;
  roadmapId?: string;
  apiStats?: FlashcardSetStats;
}

export interface FlashcardSetStats {
  total: number;
  learned: number;
  review: number;
  fresh: number;
  percent: number;
}

export interface FlashcardCardDraft {
  key: string;
  front: string;
  back: string;
  code: string;
  note: string;
}

export interface FlashcardSetDraft {
  title: string;
  desc: string;
  cards: FlashcardCardDraft[];
}

/** Chế độ ôn tập ở sidebar trang chi tiết bộ flashcard. */
export type FlashcardStudyMode = 'shuffle' | 'ordered' | 'review-first';

export type FlashcardListFilter = 'all' | 'learning' | 'review' | 'completed';
