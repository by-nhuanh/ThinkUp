import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { StudentPreferences, User } from '../models/user.model';
import { Course } from '../models/course.model';
import { AuthService } from './auth.service';

interface BackendOnboardingCourse {
  id: string;
  course_id?: string | null;
  title: string;
  description?: string | null;
  short_description?: string | null;
  category_id?: string | null;
  level?: string | null;
  rating?: number | string | null;
  total_reviews?: number | string | null;
  total_students?: number | string | null;
  price?: number | string | null;
  original_price?: number | string | null;
  thumbnail_url?: string | null;
  badge?: string | null;
  tag_ids?: string[];
}

interface OnboardingCoursesResponse {
  message?: string;
  courses: BackendOnboardingCourse[];
}

@Injectable({ providedIn: 'root' })
export class OnboardingService {
  private http = inject(HttpClient);
  private authService = inject(AuthService);
  private apiUrl = environment.apiUrl;

  getRecommendedCourses(): Observable<Course[]> {
    return this.http.get<OnboardingCoursesResponse>(`${this.apiUrl}/user/onboarding/courses`).pipe(
      map(response => this.mapCourses(response.courses))
    );
  }

  private mapCourses(courses: BackendOnboardingCourse[]): Course[] {
    return courses.map(course => ({
        id: course.id,
        courseId: course.course_id || undefined,
        title: course.title,
        description: course.description || undefined,
        shortDescription: course.short_description || undefined,
        instructor: 'Giảng viên ThinkUp',
        category: course.category_id || undefined,
        level: course.level || undefined,
        rating: this.toNumber(course.rating),
        ratingCount: this.toNumber(course.total_reviews),
        studentsCount: this.toNumber(course.total_students),
        originalPrice: this.toNumber(course.original_price ?? course.price),
        salePrice: this.toNumber(course.price),
        thumbnailUrl: course.thumbnail_url || undefined,
        badge: course.badge || undefined,
        tags: course.tag_ids || [],
      }));
  }

  private toNumber(value: number | string | null | undefined): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  /**
   * Kiểm tra xem học viên hiện tại đã hoàn thành khảo sát (hoặc đã bỏ qua) hay chưa.
   */
  isOnboardingCompleted(): boolean {
    return this.getCurrentUser()?.onboarding_completed === true;
  }

  /**
   * Lấy dữ liệu sở thích đã lưu của học viên (nếu đã hoàn thành khảo sát)
   */
  getPreferences(): StudentPreferences | null {
    return this.getCurrentUser()?.preferences ?? null;
  }

  /**
   * Gửi dữ liệu khảo sát lên máy chủ.
   */
  submitOnboarding(preferences: StudentPreferences): Observable<{ success: boolean; message: string }> {
    const payload = {
      targetRole: preferences.targetRole,
      selectedSkills: preferences.selectedSkills,
      currentLevel: preferences.currentLevel
    };

    return this.http.post<{ message: string }>(`${this.apiUrl}/user/onboarding/submit`, payload).pipe(
      tap(() => this.saveCompletedState(preferences)),
      map(response => ({ success: true, message: response.message }))
    );
  }

  /**
   * Gửi yêu cầu bỏ qua khảo sát lên máy chủ.
   */
  skipOnboarding(): Observable<{ success: boolean; message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/user/onboarding/skip`, {}).pipe(
      tap(() => this.saveSkippedState()),
      map(response => ({ success: true, message: response.message }))
    );
  }

  getCurrentUser(): User | null {
    return this.authService.currentUser();
  }

  private saveCompletedState(preferences: StudentPreferences): void {
    const user = this.getCurrentUser();
    if (!user) return;
    this.authService.updateUser({
      ...user,
      onboarding_completed: true,
      preferences: { ...preferences, submittedAt: new Date().toISOString() }
    });
  }

  private saveSkippedState(): void {
    const user = this.getCurrentUser();
    if (!user) return;
    const updated: User = { ...user, onboarding_completed: true };
    delete updated.preferences;
    this.authService.updateUser(updated);
  }
}
