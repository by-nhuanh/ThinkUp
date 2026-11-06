import { Injectable, effect, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, defer, forkJoin } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import { CourseService } from '../../../core/services/course.service';
import { AuthService } from '../../../core/services/auth.service';
import { UserProfile, LearningStat, CurrentCourse, Achievement, RecentActivity, ProfileOverviewData, Certificate } from '../../../core/models/profile.model';

@Injectable({ providedIn: 'root' })
export class ProfileService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly courses = inject(CourseService);
  private readonly apiUrl = environment.apiUrl;
  readonly profile = signal<UserProfile>(this.initialProfile());
  // These summaries have no overview contract; keep empty states, never demo records.
  readonly learningStats = signal<LearningStat[]>([]);
  readonly roadmapProgress = signal(0);
  readonly achievements = signal<Achievement[]>([]);
  readonly totalAwards = signal(0);
  readonly currentCourses = signal<CurrentCourse[]>([]);
  readonly completedCourses = signal<CurrentCourse[]>([]);
  readonly totalCompletedCourses = signal(0);
  readonly recentActivities = signal<RecentActivity[]>([]);
  readonly certificates = signal<Certificate[]>([]);
  readonly totalCertificates = signal(0);
  private owner = this.auth.currentUser()?.id;

  constructor() {
    effect(() => {
      const id = this.auth.currentUser()?.id;
      if (id === this.owner) return;
      this.owner = id;
      this.profile.set(this.initialProfile());
      this.currentCourses.set([]); this.completedCourses.set([]); this.recentActivities.set([]);
      this.certificates.set([]); this.totalCertificates.set(0); this.totalCompletedCourses.set(0);
    });
  }

  private initialProfile(): UserProfile {
    const user = this.auth.currentUser();
    return { name: user?.full_name ?? '', email: user?.email ?? '', avatarUrl: user?.avatar ?? '',
      headline: '', location: '', joinedAt: '' };
  }

  getProfileOverview(): Observable<ProfileOverviewData> {
    return defer(() => {
      const token = this.auth.getToken();
      return forkJoin({
        response: this.http.get<{ success: boolean; data: ProfileOverviewData }>(this.apiUrl + '/user/profile/overview'),
        enrolled: this.courses.getMyCourses(),
      }).pipe(map(({ response: res, enrolled }) => {
        if (token !== this.auth.getToken() || !res.success || !res.data) throw new Error('Không tải được hồ sơ.');
        const metadata = new Map([...(res.data.currentCourses ?? []), ...(res.data.completedCourses ?? [])].map(course => [course.id, course]));
        const cards = enrolled.data.map(course => ({
          id: course.id, title: course.title, instructor: course.instructor,
          instructorAvatar: metadata.get(course.id)?.instructorAvatar,
          category: metadata.get(course.id)?.category ?? '', progress: course.progress!,
          nextLesson: course.resumeLesson?.title ?? '', image: course.thumbnailUrl ?? course.image ?? '',
          href: '/main/my-courses/' + encodeURIComponent(course.id),
          completed: course.totalLessons > 0 && course.completedLessons === course.totalLessons,
        }));
        const completed = cards.filter(course => course.completed);
        const data: ProfileOverviewData = { ...res.data,
          currentCourses: cards.filter(course => !course.completed), completedCourses: completed,
          totalCompletedCourses: completed.length,
        };
        this.profile.set({ ...this.profile(), ...data.profile });
        this.currentCourses.set(data.currentCourses); this.completedCourses.set(data.completedCourses ?? []);
        this.totalCompletedCourses.set(data.totalCompletedCourses ?? 0);
        this.recentActivities.set(data.recentActivities); this.certificates.set(data.certificates ?? []);
        this.totalCertificates.set(data.totalCertificates ?? 0);
        return data;
      }));
    });
  }

  private mapProfileDetails(raw: Record<string, unknown>): UserProfile {
    if (typeof raw['full_name'] !== 'string' || typeof raw['email'] !== 'string') throw new Error('Phản hồi hồ sơ không hợp lệ.');
    const result: UserProfile = { ...this.profile(), name: raw['full_name'], email: raw['email'] };
    const fields = { avatarUrl: 'avatar_url', firstName: 'first_name', lastName: 'last_name', birthDate: 'birth_date',
      headline: 'headline', location: 'location', bio: 'bio', phone: 'phone', gender: 'gender', facebook: 'facebook', linkedin: 'linkedin',
      x: 'x', youtube: 'youtube', github: 'github', portfolio: 'portfolio' };
    for (const [key, field] of Object.entries(fields)) {
      const value = raw[field];
      if (value !== null && typeof value !== 'string') throw new Error('Trường hồ sơ không hợp lệ.');
      Object.assign(result, { [key]: value === null ? undefined : value });
    }
    return result;
  }

  getProfileDetails(): Observable<UserProfile> {
    return defer(() => {
      const token = this.auth.getToken();
      return this.http.get<{ success: boolean; data: Record<string, unknown> }>(this.apiUrl + '/user/profile').pipe(map(response => {
        if (token !== this.auth.getToken() || !response.success || !response.data) throw new Error('Không tải được hồ sơ.');
        const profile = this.mapProfileDetails(response.data);
        this.profile.set(profile);
        return profile;
      }));
    });
  }

  updateProfile(updated: Partial<UserProfile>): Observable<UserProfile> {
    return defer(() => {
      const token = this.auth.getToken();
      const current = this.profile();
      for (const key of ['instagram', 'tiktok', 'language'] as const) {
        if (updated[key] && updated[key] !== current[key]) throw new Error('Trường hồ sơ chưa được API hỗ trợ.');
      }
      const next = { ...current, ...updated };
      const body: Record<string, unknown> = { name: [next.lastName, next.firstName].filter(Boolean).join(' ').trim() || next.name };
      for (const key of ['firstName', 'lastName', 'headline', 'bio', 'gender', 'birthDate', 'phone', 'location', 'avatarUrl', 'facebook', 'linkedin', 'x', 'youtube', 'github', 'portfolio'] as const) {
        const value = updated[key];
        // The overview omits private edit fields. Never clear an unknown field just because the form starts empty.
        if (value !== undefined && value !== current[key] && !(current[key] === undefined && value === '')) body[key] = value;
      }
      return this.http.put<{ success: boolean; data: Record<string, unknown> }>(this.apiUrl + '/user/profile', body).pipe(map(res => {
        if (token !== this.auth.getToken() || !res.success || !res.data) throw new Error('Không lưu được hồ sơ.');
        const saved = this.mapProfileDetails(res.data);
        this.profile.set(saved);
        const user = this.auth.currentUser();
        if (user) this.auth.updateUser({ ...user, full_name: saved.name, avatar: saved.avatarUrl, phone: saved.phone });
        return saved;
      }));
    });
  }
}
