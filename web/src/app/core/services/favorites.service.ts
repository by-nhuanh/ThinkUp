import { Injectable, inject, signal, computed, effect } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, defer, map, of, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Course } from '../models/course.model';
import { AuthService } from './auth.service';

export interface FavoritesQuery {
  sort?: string; page?: number; limit?: number | 'all'; search?: string; category_id?: string; level?: string;
}
interface FavoriteDto {
  id?: string; course_id: string; title: string; slug?: string; thumbnail_url?: string;
  instructor?: { id?: string; name?: string }; rating: number; total_reviews: number; total_students: number;
  price: { sale: number; original: number }; level?: string; tag_names?: string[];
  is_in_cart?: boolean; is_purchased?: boolean;
}
interface Result<T> { success: boolean; data: T; }
interface FavoriteState { course_id: string; is_favorite: boolean; }
const GUEST_KEY = 'thinkup_guest_favorite_courses';

@Injectable({ providedIn: 'root' })
export class FavoritesService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly accountId = computed(() => this.auth.currentUser()?.id);
  private readonly base = `${environment.apiUrl}/user/favorites`;
  private readonly _favorites = signal<Course[]>([]);
  private readonly ids = signal<string[]>([]);
  readonly favorites = this._favorites.asReadonly();
  readonly count = computed(() => this.ids().length);
  readonly pagination = signal({ page: 1, total: 0, totalPages: 1 });

  constructor() {
    effect(() => {
      const user = this.accountId();
      this._favorites.set([]);
      this.ids.set([]);
      if (!user) {
        const courses = this.guestCourses();
        this._favorites.set(courses);
        this.ids.set(courses.map(course => course.id));
      }
    });
  }

  private readonly guard = <T>(source: Observable<T>): Observable<T> => defer(() => {
    const token = this.auth.getToken();
    return source.pipe(map(value => {
      if (token !== this.auth.getToken()) throw new Error('Phiên đăng nhập đã thay đổi.');
      return value;
    }));
  });

  isFavorite(courseId: string): boolean { return this.ids().includes(courseId); }

  loadIds(): Observable<string[]> {
    return this.http.get<Result<{ course_ids: string[]; total: number }>>(`${this.base}/ids`).pipe(this.guard,
      map(response => {
        if (!response.success || !Array.isArray(response.data?.course_ids)) throw new Error('Phản hồi yêu thích không hợp lệ.');
        return response.data.course_ids;
      }), tap(ids => this.ids.set(ids)));
  }

  checkFavorite(courseId: string): Observable<boolean> {
    return this.http.get<Result<FavoriteState>>(`${this.base}/check/${encodeURIComponent(courseId)}`).pipe(this.guard,
      map(response => {
        if (!response.success || typeof response.data?.is_favorite !== 'boolean') throw new Error('Phản hồi yêu thích không hợp lệ.');
        if (this.auth.isAuthenticated()) this.applyState(response.data);
        return response.data.is_favorite;
      }));
  }

  loadFavorites(query: FavoritesQuery = {}): Observable<Course[]> {
    if (!this.auth.isAuthenticated()) return of(this.guestCourses()).pipe(tap(courses => this._favorites.set(courses)));
    let params = new HttpParams().set('sort', query.sort || 'newest').set('page', String(query.page || 1))
      .set('limit', String(query.limit ?? 'all'));
    for (const key of ['search', 'category_id', 'level'] as const) if (query[key]) params = params.set(key, query[key]!);
    return this.http.get<Result<{ favorites: FavoriteDto[]; total: number; page: number; totalPages: number; course_ids: string[] }>>(this.base, { params }).pipe(this.guard,
      map(response => {
        if (!response.success || !Array.isArray(response.data?.favorites)) throw new Error('Phản hồi danh sách yêu thích không hợp lệ.');
        const data = response.data;
        const courses = data.favorites.map(dto => this.mapCourse(dto));
        this.pagination.set({ page: data.page, total: data.total, totalPages: data.totalPages });
        this.ids.set(data.course_ids);
        this._favorites.set(courses);
        return courses;
      }));
  }

  syncGuestFavorites(): Observable<string[]> {
    const guest = this.guestCourses().map(course => course.id);
    if (!guest.length) return this.loadIds();
    return this.http.post<Result<{ course_ids: string[] }>>(`${this.base}/sync`, { guestWishlistIds: guest }).pipe(this.guard,
      map(response => {
        if (!response.success || !Array.isArray(response.data?.course_ids)) throw new Error('Chưa đồng bộ được yêu thích.');
        localStorage.removeItem(GUEST_KEY);
        this.ids.set(response.data.course_ids);
        return response.data.course_ids;
      }));
  }

  addFavorite(course: Course): Observable<boolean> {
    if (!this.auth.isAuthenticated()) return this.isFavorite(course.id) ? of(true) : this.toggleFavorite(course).pipe(map(result => result.isFavorite));
    return this.mutate('add', course.id, course);
  }
  removeFavorite(courseId: string): Observable<boolean> {
    if (!this.auth.isAuthenticated()) {
      const next = this.guestCourses().filter(course => course.id !== courseId);
      localStorage.setItem(GUEST_KEY, JSON.stringify(next));
      this._favorites.set(next); this.ids.set(next.map(course => course.id));
      return of(false);
    }
    return this.mutate('remove', courseId);
  }

  toggleFavorite(course: Course): Observable<{ success: boolean; data: Course[]; isFavorite: boolean }> {
    if (!this.auth.isAuthenticated()) {
      const courses = this.guestCourses();
      const next = courses.some(item => item.id === course.id) ? courses.filter(item => item.id !== course.id) : [course, ...courses];
      localStorage.setItem(GUEST_KEY, JSON.stringify(next));
      this._favorites.set(next);
      this.ids.set(next.map(item => item.id));
      return of({ success: true, data: next, isFavorite: next.some(item => item.id === course.id) });
    }
    return this.mutate('toggle', course.id, course).pipe(map(isFavorite => ({ success: true, data: this._favorites(), isFavorite })));
  }

  private mutate(action: 'add' | 'remove' | 'toggle', courseId: string, course?: Course): Observable<boolean> {
    const request = action === 'remove'
      ? this.http.delete<Result<FavoriteState>>(`${this.base}/${encodeURIComponent(courseId)}`)
      : this.http.post<Result<FavoriteState>>(action === 'toggle' ? `${this.base}/toggle` : this.base, { course_id: courseId });
    return request.pipe(this.guard, map(response => {
      if (!response.success || typeof response.data?.is_favorite !== 'boolean') throw new Error('Máy chủ chưa xác nhận thay đổi yêu thích.');
      this.applyState(response.data, course);
      return response.data.is_favorite;
    }));
  }

  private applyState(state: FavoriteState, course?: Course): void {
    this.ids.update(ids => state.is_favorite ? [...new Set([...ids, state.course_id])] : ids.filter(id => id !== state.course_id));
    this._favorites.update(courses => !state.is_favorite ? courses.filter(item => item.id !== state.course_id)
      : course ? [course, ...courses.filter(item => item.id !== course.id)] : courses);
  }

  private guestCourses(): Course[] {
    try {
      const value = JSON.parse(localStorage.getItem(GUEST_KEY) || '[]');
      return Array.isArray(value) ? value.filter(item => typeof item?.id === 'string') : [];
    } catch { return []; }
  }

  private mapCourse(dto: FavoriteDto): Course {
    return { id: dto.course_id || dto.id!, courseId: dto.course_id, slug: dto.slug, title: dto.title,
      instructor: dto.instructor?.name || '', instructorId: dto.instructor?.id, level: dto.level,
      rating: dto.rating, ratingCount: dto.total_reviews, studentsCount: dto.total_students,
      salePrice: dto.price.sale, originalPrice: dto.price.original, thumbnailUrl: dto.thumbnail_url,
      tags: dto.tag_names, isInWishlist: true, isInCart: dto.is_in_cart, isPurchased: dto.is_purchased };
  }
}
