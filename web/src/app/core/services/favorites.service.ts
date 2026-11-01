import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, tap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Course } from '../models/course.model';

interface FavoriteCourseDto {
  course_id: string;
  title: string;
  slug?: string;
  thumbnail?: string;
  rating?: number | string;
  total_reviews?: number | string;
  total_students?: number | string;
  price?: {
    sale?: number | string;
    original?: number | string;
  };
}

interface FavoritesListResponse {
  success: boolean;
  data: {
    courses: FavoriteCourseDto[];
  };
}

interface FavoriteToggleResponse {
  success: boolean;
  data: {
    course_id: string;
    is_favorite: boolean;
  };
}

@Injectable({ providedIn: 'root' })
export class FavoritesService {
  private http = inject(HttpClient);
  private apiUrl = environment.apiUrl;

  private _favorites = signal<Course[]>([]);
  readonly favorites = this._favorites.asReadonly();
  readonly count = computed(() => this._favorites().length);

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    try {
      const saved = localStorage.getItem('thinkup_favorite_courses');
      if (saved) {
        const courses = JSON.parse(saved);
        if (Array.isArray(courses) && courses.length > 0) {
          this._favorites.set(courses);
          return;
        }
      }
      this._favorites.set([]);
    } catch {
      this._favorites.set([]);
    }
  }

  private saveToStorage(courses: Course[]): void {
    try {
      const ids = courses.map(c => c.id);
      localStorage.setItem('thinkup_favorite_course_ids', JSON.stringify(ids));
      localStorage.setItem('thinkup_favorite_courses', JSON.stringify(courses));
    } catch {}
  }

  isFavorite(courseId: string): boolean {
    return this._favorites().some(c => c.id === courseId);
  }

  loadFavorites(): Observable<Course[]> {
    return this.http.get<FavoritesListResponse>(`${this.apiUrl}/user/favorites`).pipe(
      map(response => response.data.courses.map(course => this.mapCourse(course))),
      tap(courses => {
        this._favorites.set(courses);
        this.saveToStorage(courses);
      })
    );
  }

  toggleFavorite(course: Course): Observable<{ success: boolean; data: Course[]; isFavorite: boolean }> {
    const courseId = course.id;
    const wasFavorite = this.isFavorite(courseId);

    // Update state immediately for instant responsive UX
    const current = this._favorites();
    const next = wasFavorite
      ? current.filter(c => c.id !== courseId)
      : [course, ...current];
    this._favorites.set(next);
    this.saveToStorage(next);

    return this.http.post<FavoriteToggleResponse>(`${this.apiUrl}/user/favorites/toggle`, {
      course_id: courseId,
    }).pipe(
      map(response => ({
        success: response.success,
        data: next,
        isFavorite: response.data.is_favorite,
      })),
      tap(result => {
        if (result.isFavorite !== !wasFavorite) {
          const reconciled = result.isFavorite
            ? [course, ...current.filter(item => item.id !== courseId)]
            : current.filter(item => item.id !== courseId);
          this._favorites.set(reconciled);
          this.saveToStorage(reconciled);
        }
      }),
      catchError(error => {
        this._favorites.set(current);
        this.saveToStorage(current);
        return throwError(() => error);
      })
    );
  }

  private mapCourse(course: FavoriteCourseDto): Course {
    return {
      id: course.course_id,
      courseId: course.course_id,
      slug: course.slug,
      title: course.title,
      instructor: 'Giảng viên ThinkUp',
      rating: this.toNumber(course.rating),
      ratingCount: this.toNumber(course.total_reviews),
      studentsCount: this.toNumber(course.total_students),
      originalPrice: this.toNumber(course.price?.original),
      salePrice: this.toNumber(course.price?.sale),
      thumbnailUrl: course.thumbnail,
    };
  }

  private toNumber(value: number | string | null | undefined): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
}
