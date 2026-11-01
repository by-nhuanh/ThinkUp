import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, map, tap } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { FlashcardCard, FlashcardCardStatus, FlashcardListFilter, FlashcardSet, FlashcardSetDraft, FlashcardSetStats, FlashcardStudyMode } from '../models/flashcard.model';

interface FlashcardCardDto {
  card_id?: string;
  id?: string;
  title?: string;
  knowledge?: string;
  description?: string;
  code?: string | null;
  note?: string | null;
  status?: string;
  front?: { knowledge?: string; title?: string };
  back?: { description?: string; code?: string; note?: string };
}
interface FlashcardSetDto {
  id: string; title: string; description?: string; created_at?: string; total_cards?: number;
  learned_cards?: number; review_cards?: number; not_learned_cards?: number; progress_percentage?: number;
  node_id?: string | null; roadmap_id?: string | null; cards?: FlashcardCardDto[];
}
interface FlashcardStatsDto {
  total_cards: number;
  learned_cards: number;
  review_cards: number;
  not_learned_cards: number;
  progress_percentage: number;
  is_qualified_for_roadmap?: boolean;
}
interface FlashcardListResponse { status: string; data: FlashcardSetDto[]; }
interface FlashcardMutationResponse { status: string; message: string; data?: FlashcardSetDto; }
interface FlashcardStatsResponse { status: string; data: FlashcardStatsDto; }

interface RoadmapSyncResult {
  updated: boolean;
  node_id: string;
  new_status?: string;
  message?: string;
  reason?: string;
}
interface RoadmapSyncResponse { status: string; data?: RoadmapSyncResult; }
interface CardStatusUpdateDto {
  success?: boolean;
  card_id?: string;
  new_status?: string;
  stats?: FlashcardStatsDto;
  roadmap_sync?: RoadmapSyncResult | null;
}
interface CardStatusResponse { status: string; message: string; data?: CardStatusUpdateDto; }

export interface FlashcardFromRoadmapPayload {
  nodeId: string;
  roadmapId?: string;
  title?: string;
  cards?: Array<{ knowledge: string; description: string; code?: string; note?: string }>;
}

export type FlashcardSetState = 'learning' | 'review' | 'completed';

@Injectable({ providedIn: 'root' })
export class FlashcardService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/user/flashcards`;
  private readonly setsSig = signal<FlashcardSet[]>([]);
  readonly sets = computed(() => this.setsSig());

  loadSets(): Observable<FlashcardSet[]> {
    return this.http.get<FlashcardListResponse>(this.base).pipe(
      map(response => response.data.map(item => this.mapSet(item))),
      tap(sets => this.setsSig.set(sets))
    );
  }

  loadSet(id: string, filterActive = false): Observable<FlashcardSet> {
    const params = new HttpParams().set('mode', 'order').set('filter_active', String(filterActive));
    return this.http.get<{ status: string; data: FlashcardSetDto }>(`${this.base}/${encodeURIComponent(id)}`, { params }).pipe(
      map(response => this.mapSet(response.data)),
      tap(set => this.upsertSet(set))
    );
  }

  getSet(id: string): FlashcardSet | null { return this.setsSig().find(set => set.id === id) ?? null; }

  getStats(set: FlashcardSet): FlashcardSetStats {
    if (set.apiStats) return set.apiStats;
    const total = set.cards.length;
    const learned = set.cards.filter(card => card.status === 'learned').length;
    const review = set.cards.filter(card => card.status === 'review').length;
    const fresh = set.cards.filter(card => card.status === 'new').length;
    return { total, learned, review, fresh, percent: total === 0 ? 0 : Math.round((learned / total) * 100) };
  }

  loadStats(setId: string): Observable<FlashcardSetStats> {
    return this.http
      .get<FlashcardStatsResponse>(`${this.base}/${encodeURIComponent(setId)}/stats`)
      .pipe(
        map(response => this.mapStats(response.data)),
        tap(stats => this.applyStats(setId, stats))
      );
  }

  createFromRoadmap(payload: FlashcardFromRoadmapPayload): Observable<{ success: boolean; message: string; setId: string }> {
    return this.http
      .post<FlashcardMutationResponse>(`${this.base}/from-roadmap`, {
        node_id: payload.nodeId,
        roadmap_id: payload.roadmapId,
        title: payload.title,
        cards: payload.cards ?? []
      })
      .pipe(
        map(response => {
          const data = response.data;
          if (!data?.id) throw new Error('Phản hồi tạo flashcard không có mã bộ thẻ.');
          this.upsertSet(this.mapSet(data));
          return { success: true, message: response.message, setId: data.id };
        })
      );
  }

  syncToRoadmap(nodeId: string, listId: string): Observable<RoadmapSyncResult | null> {
    return this.http
      .post<RoadmapSyncResponse>(`${this.base}/sync-roadmap/${encodeURIComponent(nodeId)}`, {
        list_id: listId
      })
      .pipe(map(response => response.data ?? null));
  }

  getSetState(set: FlashcardSet): FlashcardSetState {
    const stats = this.getStats(set);
    if (stats.total > 0 && stats.learned === stats.total) return 'completed';
    return stats.review > 0 ? 'review' : 'learning';
  }

  countByFilter(filter: FlashcardListFilter): number {
    return filter === 'all' ? this.setsSig().length : this.setsSig().filter(set => this.getSetState(set) === filter).length;
  }

  matchesFilter(set: FlashcardSet, filter: FlashcardListFilter): boolean { return filter === 'all' || this.getSetState(set) === filter; }

  createSet(draft: FlashcardSetDraft): Observable<{ success: boolean; message: string; setId: string }> {
    return this.http.post<FlashcardMutationResponse>(this.base, this.toPayload(draft)).pipe(map(response => {
      const id = response.data?.id;
      if (!id) throw new Error('Phản hồi tạo flashcard không có mã bộ thẻ.');
      if (response.data) this.upsertSet(this.mapSet(response.data));
      return { success: true, message: response.message, setId: id };
    }));
  }

  updateSet(setId: string, draft: FlashcardSetDraft): Observable<{ success: boolean; message: string }> {
    return this.http.put<FlashcardMutationResponse>(`${this.base}/${encodeURIComponent(setId)}`, this.toPayload(draft)).pipe(
      tap(response => { if (response.data) this.upsertSet(this.mapSet(response.data)); }),
      map(response => ({ success: true, message: response.message }))
    );
  }

  updateCardStatus(setId: string, cardId: string, status: FlashcardCardStatus): Observable<RoadmapSyncResult | null> {
    const action = status === 'learned' ? 'đã học' : 'chưa nhớ';
    return this.http.patch<CardStatusResponse>(`${this.base}/${encodeURIComponent(setId)}/cards/${encodeURIComponent(cardId)}/status`, { action }).pipe(
      tap(response => this.patchCardStatus(setId, cardId, status, response.data?.stats)),
      map(response => response.data?.roadmap_sync ?? null)
    );
  }

  startSession(setId: string, mode: FlashcardStudyMode): Observable<FlashcardCard[]> {
    const apiMode = mode === 'shuffle' ? 'random' : 'order';
    return this.http.post<{ status: string; data: { cards_to_learn: FlashcardCardDto[] } }>(`${this.base}/${encodeURIComponent(setId)}/session`, { mode: apiMode }).pipe(
      map(response => response.data.cards_to_learn.map(card => this.mapCard(card)))
    );
  }

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

  private toPayload(draft: FlashcardSetDraft) {
    return {
      title: draft.title.trim(), description: draft.desc.trim(),
      cards: draft.cards.filter(card => card.front.trim() && card.back.trim()).map(card => ({
        knowledge: card.front.trim(), description: card.back.trim(), code: card.code.trim() || undefined, note: card.note.trim() || undefined,
      })),
    };
  }

  private mapSet(dto: FlashcardSetDto): FlashcardSet {
    const total = dto.total_cards ?? dto.cards?.length ?? 0;
    const learned = dto.learned_cards ?? 0;
    const review = dto.review_cards ?? 0;
    const fresh = dto.not_learned_cards ?? Math.max(0, total - learned - review);
    return {
      id: dto.id, title: dto.title, desc: dto.description || '', icon: 'code', tint: '#E6F4FF', accent: '#0088E8',
      createdAt: this.normalizeDate(dto.created_at), cards: (dto.cards || []).map(card => this.mapCard(card)),
      nodeId: dto.node_id || undefined, roadmapId: dto.roadmap_id || undefined,
      apiStats: { total, learned, review, fresh, percent: dto.progress_percentage ?? (total ? Math.round((learned / total) * 100) : 0) },
    };
  }

  private mapCard(dto: FlashcardCardDto): FlashcardCard {
    const knowledge = dto.knowledge ?? dto.front?.knowledge ?? dto.front?.title ?? dto.title ?? '';
    const description = dto.description ?? dto.back?.description ?? '';
    const code = dto.code ?? dto.back?.code;
    const note = dto.note ?? dto.back?.note;

    return {
      id: dto.card_id ?? dto.id ?? '',
      front: knowledge,
      back: description,
      code: code || undefined,
      note: note || undefined,
      status: this.mapStatus(dto.status)
    };
  }

  private mapStats(dto: FlashcardStatsDto): FlashcardSetStats {
    return {
      total: dto.total_cards,
      learned: dto.learned_cards,
      review: dto.review_cards,
      fresh: dto.not_learned_cards,
      percent: dto.progress_percentage
    };
  }

  private applyStats(setId: string, stats: FlashcardSetStats): void {
    this.setsSig.update(sets =>
      sets.map(set => (set.id === setId ? { ...set, apiStats: stats } : set))
    );
  }

  private mapStatus(status?: string): FlashcardCardStatus {
    const normalized = (status || '').toLowerCase();
    if (normalized.includes('đã học') || normalized === 'learned') return 'learned';
    if (normalized.includes('ôn') || normalized.includes('chưa nhớ') || normalized === 'review') return 'review';
    return 'new';
  }

  private normalizeDate(value?: string): string {
    if (!value) return new Date().toISOString().slice(0, 10);
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
    return match ? `${match[3]}-${match[2]}-${match[1]}` : value.slice(0, 10);
  }

  private upsertSet(set: FlashcardSet): void { this.setsSig.update(sets => [set, ...sets.filter(item => item.id !== set.id)]); }

  private patchCardStatus(
    setId: string,
    cardId: string,
    status: FlashcardCardStatus,
    stats?: FlashcardStatsDto
  ): void {
    const mappedStats = stats ? this.mapStats(stats) : undefined;
    this.setsSig.update(sets => sets.map(set => set.id !== setId ? set : {
      ...set,
      apiStats: mappedStats ?? set.apiStats,
      cards: set.cards.map(card => card.id === cardId ? { ...card, status } : card),
    }));
  }

  private shuffle(cards: FlashcardCard[]): FlashcardCard[] {
    const result = [...cards];
    for (let i = result.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
    return result;
  }
}
