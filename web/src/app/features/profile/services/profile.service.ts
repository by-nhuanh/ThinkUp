import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../../core/services/auth.service';
import {
  UserProfile,
  LearningStat,
  CurrentCourse,
  Achievement,
  RecentActivity,
  ProfileOverviewData,
  Certificate,
} from '../../../core/models/profile.model';
import {
  MOCK_PROFILE,
  MOCK_LEARNING_STATS,
  MOCK_CURRENT_COURSES,
  MOCK_COMPLETED_COURSES,
  MOCK_ACHIEVEMENTS,
  MOCK_RECENT_ACTIVITIES,
  MOCK_ROADMAP_PROGRESS,
  MOCK_TOTAL_AWARDS,
  MOCK_CERTIFICATES,
  MOCK_TOTAL_CERTIFICATES,
  MOCK_TOTAL_COMPLETED_COURSES,
} from '../../../core/data/mock/mock-profile';

const PROFILE_STORAGE_KEY = 'thinkup_user_profile';
const CURRENT_USER_KEY = 'thinkup_current_user';

@Injectable({ providedIn: 'root' })
export class ProfileService {
  private http = inject(HttpClient);
  private authService = inject(AuthService);
  private apiUrl = environment.apiUrl;

  // Reactive State Signals
  readonly profile = signal<UserProfile>(this.initialProfile());
  readonly learningStats = signal<LearningStat[]>(MOCK_LEARNING_STATS);
  readonly roadmapProgress = signal<number>(MOCK_ROADMAP_PROGRESS);
  readonly currentCourses = signal<CurrentCourse[]>(MOCK_CURRENT_COURSES);
  readonly completedCourses = signal<CurrentCourse[]>(MOCK_COMPLETED_COURSES);
  readonly totalCompletedCourses = signal<number>(MOCK_TOTAL_COMPLETED_COURSES);
  readonly achievements = signal<Achievement[]>(MOCK_ACHIEVEMENTS);
  readonly totalAwards = signal<number>(MOCK_TOTAL_AWARDS);
  readonly recentActivities = signal<RecentActivity[]>(MOCK_RECENT_ACTIVITIES);
  readonly certificates = signal<Certificate[]>(MOCK_CERTIFICATES);
  readonly totalCertificates = signal<number>(MOCK_TOTAL_CERTIFICATES);

  constructor() {
    this.loadFromStorage();
  }

  private initialProfile(): UserProfile {
    const user = this.authService.currentUser();
    return user
      ? { ...MOCK_PROFILE, name: user.full_name, email: user.email, avatarUrl: user.avatar || '' }
      : MOCK_PROFILE;
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(PROFILE_STORAGE_KEY);
      if (!stored) return;

      const user = this.authService.currentUser();
      const parsed = JSON.parse(stored) as Partial<UserProfile>;
      if (user && parsed.email !== user.email) return;

      if (stored.includes('Nguyễn Văn An')) {
        localStorage.removeItem(PROFILE_STORAGE_KEY);
        this.profile.set(this.initialProfile());
        return;
      }

      this.profile.set({
        ...this.initialProfile(),
        ...parsed,
        avatarUrl: parsed.avatarUrl || '',
      });
    } catch {}
  }

  getProfileOverview(): Observable<ProfileOverviewData> {
    return this.http
      .get<{ success: boolean; data: ProfileOverviewData }>(
        `${this.apiUrl}/user/profile/overview`,
        { withCredentials: true }
      )
      .pipe(
        tap((res) => {
          if (!res.success || !res.data) return;

          const data = res.data;
          this.profile.set(data.profile);
          this.learningStats.set(data.learningStats);
          this.roadmapProgress.set(data.roadmapProgress);
          this.currentCourses.set(data.currentCourses);
          this.completedCourses.set(data.completedCourses ?? []);
          this.achievements.set(data.achievements);
          this.totalAwards.set(data.totalAwards);
          this.recentActivities.set(data.recentActivities);
          this.certificates.set(data.certificates ?? []);
        }),
        map((res) => res.data),
        catchError(() => {
          // Backend chưa sẵn sàng: giữ dữ liệu đang có để trang vẫn hiển thị.
          const fallback: ProfileOverviewData = {
            profile: this.profile(),
            learningStats: this.learningStats(),
            roadmapProgress: this.roadmapProgress(),
            currentCourses: this.currentCourses(),
            completedCourses: this.completedCourses(),
            achievements: this.achievements(),
            totalAwards: this.totalAwards(),
            recentActivities: this.recentActivities(),
            certificates: this.certificates(),
          };
          return of(fallback);
        })
      );
  }

  /**
   * Cập nhật hồ sơ. Chỉ ghi state/localStorage khi API trả về thành công,
   * lỗi được đẩy về component để hiển thị modal thất bại (BR: giữ nguyên dữ liệu form).
   */
  updateProfile(updated: Partial<UserProfile>): Observable<UserProfile> {
    const nextProfile: UserProfile = { ...this.profile(), ...updated };
    nextProfile.name =
      [nextProfile.lastName, nextProfile.firstName].filter(Boolean).join(' ').trim() ||
      nextProfile.name;

    return this.http
      .put<{ success: boolean; data: UserProfile }>(
        `${this.apiUrl}/user/profile`,
        nextProfile,
        { withCredentials: true }
      )
      .pipe(
        tap((res) => {
          const saved = res?.success && res.data ? res.data : nextProfile;
          this.applyProfile(saved);
        }),
        map((res) => (res?.success && res.data ? res.data : nextProfile))
      );
  }

  private applyProfile(nextProfile: UserProfile): void {
    this.profile.set(nextProfile);
    try {
      localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(nextProfile));

      // Đồng bộ thông tin user hiện tại cho Header
      const current = JSON.parse(localStorage.getItem(CURRENT_USER_KEY) || '{}');
      const nextUser = {
        ...current,
        full_name: nextProfile.name,
        fullName: nextProfile.name,
        name: nextProfile.name,
        avatar: nextProfile.avatarUrl,
        avatarUrl: nextProfile.avatarUrl,
      };
      localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(nextUser));
      window.dispatchEvent(new Event('storage'));
    } catch {}
  }
}
