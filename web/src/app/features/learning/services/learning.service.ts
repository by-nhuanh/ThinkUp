import { Injectable, inject } from '@angular/core';
import { Observable, catchError, delay, forkJoin, map, of } from 'rxjs';
import { MOCK_LESSON_RESOURCES } from '../../../core/data/mock/learning-player.mock';
import { Course, CoursePreview } from '../../../core/models/course.model';
import { CourseService } from '../../../core/services/course.service';
import {
  CourseReview,
  CourseReviewSummary,
  LearningCourse,
  LearningLesson,
  LearningResource,
  ReportReason,
} from '../models/learning.model';
import { MOCK_REPORT_REASONS } from '../../../core/data/mock/learning-player.mock';

export interface LearningEnrollment {
  completedLessons: number;
  totalLessons: number;
  percent: number;
  completed: number;
  remaining: number;
  studyTime: string;
  nextLessonId: string;
  nextLessonTitle: string;
  lastUpdated: string;
}

export interface SubmitReviewPayload {
  courseId: string;
  rating: number;
  tags: string[];
  comment: string;
  nps: number;
}

@Injectable({ providedIn: 'root' })
export class LearningService {
  private readonly courseService = inject(CourseService);
  private readonly lessonCompletion = new Map<string, boolean>();
  private readonly reviewOverrides = new Map<string, { rating: number; comment: string }>();

  getCourse(courseId: string): Observable<LearningCourse> {
    return forkJoin({
      preview: this.courseService.getCoursePreview(courseId),
      detail: this.courseService.getCourseDetail(courseId).pipe(catchError(() => of(null))),
    }).pipe(map(({ preview, detail }) => this.mapCourse(preview, detail)));
  }

  loadLessonVideo(courseId: string, lessonId: string): Observable<{ lessonId: string; videoUrl: string } | null> {
    return this.courseService.getLessonStream(courseId, lessonId).pipe(
      map(stream => ({ lessonId: stream.lessonId, videoUrl: stream.videoUrl })),
      catchError(() => of(null))
    );
  }

  private mapCourse(preview: CoursePreview, detail: Course | null): LearningCourse {
    let order = 0;
    const chapters = preview.syllabus.map(section => ({
      id: section.id,
      title: section.title,
      lessons: section.lessons.map(lesson => {
        order += 1;
        const completed = this.lessonCompletion.get(lesson.id) ?? false;
        const mapped: LearningLesson = {
          id: lesson.id,
          order,
          title: lesson.title,
          type: lesson.type === 'article' ? 'reading' : lesson.type,
          duration: this.formatLessonDuration(lesson.durationMinutes),
          completed,
          status: completed ? 'done' : 'not-started',
          isPreview: lesson.isFreePreview,
          isLocked: lesson.isLocked,
          videoUrl: lesson.videoUrl,
        };
        return mapped;
      }),
    }));
    const lessons = chapters.flatMap(chapter => chapter.lessons);

    return {
      id: preview.courseId,
      title: preview.title,
      instructor: detail?.instructor ?? 'Giảng viên ThinkUp',
      instructorTitle: detail?.instructorProfile?.title ?? '',
      progress: lessons.length
        ? Math.round((lessons.filter(lesson => lesson.completed).length / lessons.length) * 100)
        : 0,
      description: detail?.description ?? detail?.shortDescription ?? '',
      coverGradient: 'linear-gradient(163deg, #041348 0%, #01052c 100%)',
      coverLabel: this.buildCoverLabel(preview.title),
      rating: detail?.rating ?? 0,
      ratingCount: Number(detail?.ratingCount) || 0,
      studentCount: detail?.studentsCount ?? 0,
      chapters,
      isPurchased: preview.isPurchased,
      playerConfig: {
        allowMarkCompleted: preview.playerConfig.allowMarkCompleted,
        allowNotes: preview.playerConfig.allowNotes,
        allowQa: preview.playerConfig.allowQa,
        qaMessage: preview.playerConfig.qaMessage,
        upsell: preview.playerConfig.upsell,
      },
    };
  }

  private formatLessonDuration(minutes: number): string {
    if (!minutes) return '00:00';
    return `${String(Math.round(minutes)).padStart(2, '0')}:00`;
  }

  private buildCoverLabel(title: string): string {
    const initials = title
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(word => word.charAt(0).toUpperCase())
      .join('');
    return initials || 'TH';
  }

  setLessonCompleted(lessonId: string, completed: boolean): void {
    this.lessonCompletion.set(lessonId, completed);
  }

  getReviews(courseId: string): Observable<CourseReviewSummary> {
    return this.courseService.getCourseReviews(courseId, { limit: 10 }).pipe(
      map(page => ({
        average: page.summary.average,
        total: page.summary.total,
        distribution: page.summary.breakdown.map(row => ({ stars: row.stars, percent: row.percent })),
        reviews: page.reviews.map<CourseReview>(review => ({
          id: review.id,
          author: review.author,
          initials: this.buildCoverLabel(review.author),
          rating: review.rating,
          date: review.date,
          comment: review.comment,
          helpful: 0,
        })),
      }))
    );
  }

  getResources(): LearningResource[] {
    return MOCK_LESSON_RESOURCES;
  }

  getReportReasons(): ReportReason[] {
    return MOCK_REPORT_REASONS;
  }

  getEnrollment(course: LearningCourse): LearningEnrollment {
    const lessons = course.chapters.flatMap((chapter) => chapter.lessons);
    const completedLessons = lessons.filter((lesson) => lesson.completed).length;
    const totalLessons = lessons.length;
    const percent = totalLessons ? Math.round((completedLessons / totalLessons) * 100) : 0;
    const nextLesson = lessons.find((lesson) => !lesson.completed) ?? lessons[0];

    return {
      completedLessons,
      totalLessons,
      percent,
      completed: completedLessons,
      remaining: totalLessons - completedLessons,
      studyTime: '08h 45m',
      nextLessonId: nextLesson?.id ?? '',
      nextLessonTitle: nextLesson?.title ?? '',
      lastUpdated: 'Hôm nay, 10:30',
    };
  }

  submitReview(payload: SubmitReviewPayload): Observable<{ success: boolean; message: string }> {
    const valid = payload.rating > 0;
    if (valid) {
      this.reviewOverrides.set('rv-mine', {
        rating: payload.rating,
        comment: payload.comment.trim(),
      });
    }
    return of(
      valid
        ? { success: true, message: 'Đánh giá thành công!' }
        : { success: false, message: 'Đánh giá thất bại' }
    ).pipe(delay(450));
  }

  updateMyReview(payload: { rating: number; comment: string }): Observable<{ success: boolean }> {
    if (payload.rating < 1) {
      return of({ success: false }).pipe(delay(250));
    }
    this.reviewOverrides.set('rv-mine', {
      rating: payload.rating,
      comment: payload.comment.trim(),
    });
    return of({ success: true }).pipe(delay(250));
  }

  submitReport(reasonIds: string[], detail: string): Observable<{ success: boolean }> {
    return of({ success: reasonIds.length > 0 && detail.trim().length >= 10 }).pipe(delay(350));
  }
}
