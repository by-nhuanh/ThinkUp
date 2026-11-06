import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, catchError, defer, delay, forkJoin, map, of, switchMap, throwError } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../../core/services/auth.service';
import { ApiResult, StudyDto, OverviewDto, CommunityDto, CommunityPageDto, DocumentsDto } from '../models/learning-api.model';
import { Course, CoursePreview } from '../../../core/models/course.model';
import { CourseService } from '../../../core/services/course.service';
import {
  CourseReview,
  CourseReviewSummary,
  LearningCourse,
  LearningLesson,
  LearningResource,
  ReportReason,
  CommunityPost,
  CourseDocument,
} from '../models/learning.model';
import { MOCK_REPORT_REASONS } from '../../../core/data/mock/learning-player.mock';
import { LessonContentDto, QuizOverviewDto, QuizAttemptDto, QuizResultDto, LabAttemptDto, LabRunDto } from '../models/learning-api.model';
import { LabConfig, LabTestCase, LabInstructionBlock } from '../models/learning.model';

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
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly base = `${environment.apiUrl}/user/lessons`;
  private currentCourseId = '';

  private readonly guard = <T>(source: Observable<T>): Observable<T> => defer(() => {
    const token = this.auth.getToken();
    return source.pipe(map(value => {
      if (token !== this.auth.getToken()) throw new Error('Phiên đăng nhập đã thay đổi.');
      return value;
    }));
  });

  getCourse(courseId: string, previewMode = false): Observable<LearningCourse> {
    if (!previewMode) return forkJoin({
      preview: this.courseService.getCoursePreview(courseId),
      study: this.http.get<ApiResult<StudyDto>>(`${this.base}/study/${encodeURIComponent(courseId)}`),
      detail: this.courseService.getCourseDetail(courseId),
    }).pipe(this.guard, map(({ study, detail, preview }) => {
      if (preview.isPurchased !== true) return this.mapCourse(preview, detail);
      if (!study.success || !study.data?.curriculum) throw new Error('Phản hồi dữ liệu học tập không hợp lệ.');
      const dto = study.data;
      this.currentCourseId = dto.course.course_id;
      const progress = dto.learning_progress;
      return {
        id: dto.course.course_id, title: dto.course.course_name,
        instructor: dto.course.instructor.full_name, instructorTitle: dto.course.instructor.title,
        instructorAvatar: dto.course.instructor.avatar_url || detail.instructorProfile?.avatar,
        progress: progress.progress_percentage, description: dto.course.short_description,
        thumbnailUrl: dto.course.thumbnail_url || detail.thumbnailUrl,
        bgGradient: dto.course.bg_gradient || detail.bgGradient,
        coverGradient: dto.course.bg_gradient || detail.bgGradient || 'linear-gradient(163deg, #041348 0%, #01052c 100%)',
        coverLabel: this.buildCoverLabel(dto.course.course_name), rating: dto.course.rating.average,
        ratingCount: dto.course.rating.total_reviews, studentCount: dto.course.total_students,
        isPurchased: detail.isPurchased,
        playerConfig: { allowMarkCompleted: detail.isPurchased === true, allowNotes: detail.isPurchased === true,
          allowQa: detail.isPurchased === true, qaMessage: '', upsell: null },
        chapters: dto.curriculum.sections.map(section => ({ id: section.section_id, title: section.title,
          lessons: section.lessons.map(lesson => ({ id: lesson.lesson_id, order: lesson.lesson_number,
            title: lesson.title, type: lesson.lesson_type === 'article' ? 'reading' as const : lesson.lesson_type,
            duration: `${Math.floor(lesson.duration_seconds / 60)}:${String(lesson.duration_seconds % 60).padStart(2, '0')}`,
            completed: lesson.status === 'completed', questionCount: lesson.question_count,
            status: lesson.status === 'completed' ? 'done' as const : lesson.status === 'in_progress' ? 'in-progress' as const : 'not-started' as const,
            isPreview: lesson.is_free_preview })) })),
        enrollment: { completedLessons: progress.completed_lessons, totalLessons: progress.total_lessons,
          percent: progress.progress_percentage, completed: progress.completed_lessons, remaining: progress.remaining_lessons,
          studyTime: progress.total_time_spent_formatted, nextLessonId: dto.actions.resume_learning.lesson_id || '',
          nextLessonTitle: dto.actions.resume_learning.title, lastUpdated: '' },
      };
    }), catchError(error => {
      if (![401, 403].includes(error?.status)) return throwError(() => error);
      return this.getCourse(courseId, true);
    }));
    return forkJoin({
      preview: this.courseService.getCoursePreview(courseId),
      detail: this.courseService.getCourseDetail(courseId),
    }).pipe(this.guard, map(({ preview, detail }) => this.mapCourse(preview, detail)));
  }

  loadLessonVideo(courseId: string, lessonId: string): Observable<{ lessonId: string; videoUrl: string; playback: import('../../../core/models/course.model').LearningPlayback } | null> {
    return this.courseService.getLessonStream(courseId, lessonId).pipe(
      map(stream => ({ lessonId: stream.lessonId, videoUrl: stream.videoUrl, playback: stream.playback })),
      this.guard
    );
  }

  private mapCourse(preview: CoursePreview, detail: Course | null): LearningCourse {
    let order = 0;
    const chapters = preview.syllabus.map(section => ({
      id: section.id,
      title: section.title,
      lessons: section.lessons.map(lesson => {
        order += 1;
        const completed = false;
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
      instructorAvatar: detail?.instructorProfile?.avatar,
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

  setLessonCompleted(lessonId: string, completed: boolean, courseId = this.currentCourseId): Observable<LearningCourse> {
    return this.http.put<ApiResult<unknown>>(`${this.base}/${encodeURIComponent(lessonId)}/progress`, {
      course_id: courseId, status: completed ? 'completed' : 'in_progress',
    }).pipe(this.guard, switchMap(response => {
      if (!response.success) return throwError(() => new Error('Máy chủ chưa xác nhận tiến độ bài học.'));
      return this.getCourse(courseId);
    }));
  }

  getReviews(courseId: string): Observable<CourseReviewSummary> {
    return this.courseService.getCourseReviews(courseId, { limit: 10 }).pipe(
      map(page => ({
        hasUserReviewed: page.hasUserReviewed === true || page.reviews.some(r => r.isMine === true),
        myReview: page.myReview ? {
          id: page.myReview.id,
          author: page.myReview.author,
          initials: this.buildCoverLabel(page.myReview.author),
          rating: page.myReview.rating,
          date: page.myReview.date,
          comment: page.myReview.comment,
          helpful: 0,
          mine: true,
        } : (page.reviews.find(r => r.isMine === true) ? {
          id: page.reviews.find(r => r.isMine === true)!.id,
          author: page.reviews.find(r => r.isMine === true)!.author,
          initials: this.buildCoverLabel(page.reviews.find(r => r.isMine === true)!.author),
          rating: page.reviews.find(r => r.isMine === true)!.rating,
          date: page.reviews.find(r => r.isMine === true)!.date,
          comment: page.reviews.find(r => r.isMine === true)!.comment,
          helpful: 0,
          mine: true,
        } : null),
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
          mine: review.isMine === true,
        })),
      }))
    );
  }

  getResources(): LearningResource[] {
    return [];
  }

  getReportReasons(): ReportReason[] {
    return MOCK_REPORT_REASONS;
  }

  getEnrollment(course: LearningCourse): LearningEnrollment {
    if (course.enrollment) return course.enrollment;
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
      studyTime: '',
      nextLessonId: nextLesson?.id ?? '',
      nextLessonTitle: nextLesson?.title ?? '',
      lastUpdated: '',
    };
  }

  getOverview(courseId: string): Observable<OverviewDto> {
    return this.http.get<ApiResult<OverviewDto>>(`${this.base}/overview/${encodeURIComponent(courseId)}`).pipe(this.guard,
      map(response => {
        if (!response.success || !response.data?.introduction) throw new Error('Không tải được tổng quan khóa học.');
        return response.data;
      }));
  }

  getCommunity(courseId: string, mode: 'qa' | 'discussion', page = 1): Observable<CommunityPost[]> {
    const path = mode === 'qa' ? 'qna' : 'discussions';
    const params = new HttpParams().set('page', page).set('limit', 50);
    return this.http.get<ApiResult<CommunityPageDto>>(`${this.base}/${path}/${encodeURIComponent(courseId)}`, { params }).pipe(this.guard,
      switchMap(response => {
        if (!response.success || !response.data?.pagination) throw new Error('Không tải được nội dung trao đổi.');
        const rows = mode === 'qa' ? response.data.qna_list : response.data.discussions;
        if (!Array.isArray(rows)) throw new Error('Phản hồi nội dung trao đổi không hợp lệ.');
        const posts = rows.map(row => this.mapCommunity(row));
        return page < response.data.pagination.total_pages
          ? this.getCommunity(courseId, mode, page + 1).pipe(map(next => [...posts, ...next])) : of(posts);
      }));
  }

  createCommunity(courseId: string, mode: 'qa' | 'discussion', content: string, lessonId?: string, parentId?: string): Observable<CommunityPost[]> {
    const path = mode === 'qa' ? 'qna' : 'discussions';
    const url = mode === 'qa' && parentId ? `${this.base}/qna/${encodeURIComponent(parentId)}/reply`
      : `${this.base}/${path}/${encodeURIComponent(courseId)}`;
    const body = mode === 'qa' && parentId ? { content } : { content, lesson_id: lessonId || undefined, parent_id: parentId || undefined };
    return this.http.post<{ success: boolean }>(url, body).pipe(this.guard, switchMap(response => {
      if (!response.success) throw new Error('Máy chủ chưa xác nhận nội dung đã gửi.');
      return this.getCommunity(courseId, mode);
    }));
  }

  updateCommunity(courseId: string, mode: 'qa' | 'discussion', id: string, content: string): Observable<CommunityPost[]> {
    const path = mode === 'qa' ? 'qna' : 'discussions';
    return this.http.put<{ success: boolean }>(`${this.base}/${path}/${encodeURIComponent(id)}`, { content }).pipe(this.guard,
      switchMap(response => {
        if (!response.success) throw new Error('Máy chủ chưa xác nhận nội dung chỉnh sửa.');
        return this.getCommunity(courseId, mode);
      }));
  }

  likeDiscussion(id: string): Observable<{ is_liked: boolean; likes_count: number }> {
    return this.http.post<{ success: boolean; is_liked: boolean; likes_count: number }>(`${this.base}/discussions/${encodeURIComponent(id)}/like`, {}).pipe(this.guard,
      map(response => {
        if (!response.success) throw new Error('Chưa cập nhật được lượt thích.');
        return response;
      }));
  }

  reportDiscussion(id: string, reason: string): Observable<{ success: boolean }> {
    return this.http.post<{ success: boolean }>(`${this.base}/discussions/${encodeURIComponent(id)}/report`, { reason }).pipe(this.guard,
      map(response => { if (!response.success) throw new Error('Chưa gửi được báo cáo.'); return response; }));
  }

  private mapCommunity(dto: CommunityDto): CommunityPost {
    const author = dto.author.full_name;
    return { id: (dto.discussion_id || dto.qna_id)!, author, initials: this.buildCoverLabel(author),
      body: dto.content, createdAt: dto.created_at_formatted, role: dto.author.role === 'instructor' ? 'Giảng viên' : 'Học viên',
      avatarUrl: dto.author.avatar_url, isOwner: dto.is_owner, lessonId: dto.lesson_id || dto.lesson_info?.lesson_id,
      likes: dto.likes_count ?? 0, liked: dto.is_liked, replies: (dto.replies || []).map(reply => this.mapCommunity(reply)) };
  }

  private documents(courseId: string): Observable<DocumentsDto> {
    return this.http.get<ApiResult<DocumentsDto>>(`${this.base}/documents/${encodeURIComponent(courseId)}`).pipe(this.guard,
      map(response => {
        if (!response.success || !Array.isArray(response.data?.categories)) throw new Error('Không tải được tài liệu khóa học.');
        return response.data;
      }));
  }

  loadResources(courseId: string): Observable<LearningResource[]> {
    return this.documents(courseId).pipe(map(data => data.categories.flatMap(category => category.items.map(item => ({
      lessonId: item.lesson_id || null, id: item.document_id, title: item.title, meta: item.file_type, size: item.file_size_formatted,
      canDownload: item.can_download, fileName: item.file_name,
    })))));
  }

  loadDocumentRows(courseId: string): Observable<CourseDocument[]> {
    return this.documents(courseId).pipe(map(data => data.categories.flatMap(category => category.items.map(item => ({
      id: item.document_id, name: item.title,
      subtitle: item.lesson_title ? `Bài học: ${item.lesson_title} · ${item.file_name}` : item.file_name,
      category: category.key === 'lecture_slides' ? 'lecture' as const : category.key === 'source_code' ? 'code' as const : 'exercise' as const,
      kind: item.file_type, size: item.file_size_formatted, updated: item.updated_at_formatted, ext: item.file_type,
      lessonId: item.lesson_id || null,
      lessonTitle: item.lesson_title || item.lesson_name || null,
    })))));
  }

  downloadDocument(id: string): Observable<void> {
    return this.http.get<ApiResult<{ download_url: string; file_name: string }>>(`${this.base}/documents/${encodeURIComponent(id)}/download`).pipe(this.guard,
      switchMap(response => {
        if (!response.success || !response.data?.download_url) throw new Error('Máy chủ chưa cấp đường dẫn tải tài liệu.');
        const fileName = response.data.file_name || 'document';
        const rawUrl = response.data.download_url;
        const targetUrl = rawUrl.startsWith('http') ? rawUrl : new URL(rawUrl, environment.apiUrl).href;

        // Tải dữ liệu nhị phân về dưới dạng Blob để đảm bảo giữ nguyên định dạng tệp (.docx, .pdf, .py, .rar)
        return this.http.get(targetUrl, { responseType: 'blob' }).pipe(
          map(blob => {
            const blobUrl = window.URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = blobUrl;
            anchor.download = fileName;
            anchor.rel = 'noopener';
            document.body.appendChild(anchor);
            anchor.click();
            document.body.removeChild(anchor);
            setTimeout(() => window.URL.revokeObjectURL(blobUrl), 30000);
          })
        );
      }));
  }

  submitReview(payload: SubmitReviewPayload): Observable<{ success: boolean; message: string }> {
    const courseId = payload.courseId || this.currentCourseId;
    if (!courseId) {
      return of({ success: false, message: 'Thiếu mã khóa học.' });
    }
    const body = {
      rating: payload.rating,
      content: payload.comment,
      tags: payload.tags,
      nps_score: payload.nps,
    };
    return this.http.post<ApiResult<any>>(`${environment.apiUrl}/user/courses/${encodeURIComponent(courseId)}/reviews`, body).pipe(
      this.guard,
      map((res: ApiResult<any>) => ({
        success: res.success,
        message: res.message || 'Gửi đánh giá thành công!',
      })),
      catchError((err) => {
        const errorMsg = err?.error?.message || err?.message || 'Không thể gửi đánh giá khóa học.';
        return of({ success: false, message: errorMsg });
      })
    );
  }

  updateMyReview(payload: { rating: number; comment: string }): Observable<{ success: boolean; message: string }> {
    const courseId = this.currentCourseId;
    if (!courseId) {
      return of({ success: false, message: 'Thiếu mã khóa học.' });
    }
    const body = {
      rating: payload.rating,
      content: payload.comment,
    };
    return this.http.post<ApiResult<any>>(`${environment.apiUrl}/user/courses/${encodeURIComponent(courseId)}/reviews`, body).pipe(
      this.guard,
      map((res: ApiResult<any>) => ({
        success: res.success,
        message: res.message || 'Cập nhật đánh giá thành công!',
      })),
      catchError((err) => {
        const errorMsg = err?.error?.message || err?.message || 'Không thể cập nhật đánh giá khóa học.';
        return of({ success: false, message: errorMsg });
      })
    );
  }

  submitReport(reasonIds: string[], detail: string): Observable<{ success: boolean }> {
    return of({ success: reasonIds.length > 0 && detail.trim().length >= 10 }).pipe(delay(350));
  }

  // ─── K.15 API Methods ──────────────────────────────────────────────────────────

  refreshLessonProgress(courseId: string, lessonId: string): Observable<LearningCourse> {
    return this.getCourse(courseId);
  }

  getLessonContent(lessonId: string): Observable<LessonContentDto> {
    return this.http.get<ApiResult<LessonContentDto>>(`${this.base}/content/${encodeURIComponent(lessonId)}`).pipe(
      this.guard,
      map((res) => {
        if (!res.success) throw new Error('Không tải được nội dung chi tiết bài học.');
        return res.data;
      })
    );
  }

  completeLessonManual(lessonId: string, completed = true): Observable<{ lesson_id: string; completed: boolean; status: string }> {
    return this.http.post<ApiResult<any>>(`${this.base}/${encodeURIComponent(lessonId)}/complete`, { completed }).pipe(
      this.guard,
      map((res: ApiResult<any>) => {
        if (!res.success) throw new Error('Không thể đánh dấu hoàn thành bài học.');
        return res.data;
      })
    );
  }

  getQuizOverview(lessonId: string): Observable<QuizOverviewDto> {
    return this.lessonRequest<QuizOverviewDto>('get', `/quiz/${encodeURIComponent(lessonId)}/overview`);
  }

  private lessonRequest<T>(method: string, path: string, body?: unknown): Observable<T> {
    return this.http.request<ApiResult<T>>(method, `${this.base}${path}`, { body }).pipe(
      this.guard,
      map(res => {
        if (!res.success || res.data == null) throw new Error('Phản hồi học tập không hợp lệ.');
        return res.data;
      })
    );
  }

  getQuizAttempt(attemptId: string): Observable<QuizAttemptDto> {
    return this.lessonRequest('get', `/quiz/attempts/${encodeURIComponent(attemptId)}`);
  }

  mapQuizAttempt(dto: QuizAttemptDto): { questions: import('../models/learning.model').QuizQuestion[] } {
    if (!dto.attempt_id || !Number.isInteger(dto.revision) || !Array.isArray(dto.questions) || !dto.questions.length)
      throw new Error('Lượt kiểm tra chưa có câu hỏi hợp lệ.');
    return { questions: dto.questions.map(q => ({ id:q.id, text:q.text, options:q.options.map(o=>({id:o.id,text:o.text})) })) };
  }

  mapLabContent(dto: LessonContentDto): LabConfig {
    if (!dto.lab || typeof dto.lab.sample_code !== 'string' || !dto.lab.environment_config?.language)
      throw new Error('Bài lab chưa có cấu hình hợp lệ.');
    const lab=dto.lab;
    return { language:lab.environment_config.language!, fileName:'', taskTitle:dto.title,
      instructions:[...this.mapLabInstructions(lab.requirements),{heading:'Kết quả mong đợi',paragraphs:[lab.expected_output]}],
      starterCode:lab.sample_code, tests:(lab.test_cases || []).map(test => ({ id:test.id, name:test.name, input:test.input || '', expected:test.expected_output })), solutions:[] };
  }

  mapLabInstructions(content: string): LabInstructionBlock[] {
    // Convert stored HTML to the existing instruction model so the established
    // heading/list/code renderer, spacing and safe text interpolation are preserved.
    const decode=(value:string)=>value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,(_,entity:string)=>{
      const named:Record<string,string>={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
      if(entity[0]!=='#')return named[entity.toLowerCase()];
      const number=entity[1].toLowerCase()==='x'?parseInt(entity.slice(2),16):parseInt(entity.slice(1),10);
      return number>=0 && number<=0x10ffff?String.fromCodePoint(number):'';
    });
    const text=(value:string)=>decode(value.replace(/<br\s*\/?>/gi,'\n').replace(/<[^>]*>/g,'')).trim();
    const safe=content.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'');
    const blocks:LabInstructionBlock[]=[];
    for(const match of safe.matchAll(/<(h[1-6]|p|ul|ol|pre)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
      const [,tag,body]=match;
      if(tag.toLowerCase().startsWith('h'))blocks.push({heading:text(body)});
      else if(tag.toLowerCase()==='pre')blocks.push({code:text(body)});
      else {
        if(!blocks.length)blocks.push({});
        const block=blocks[blocks.length-1];
        if(tag.toLowerCase()==='p') (block.paragraphs??=[]).push(text(body));
        else (block.bullets??=[]).push(...[...body.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map(li=>text(li[1])));
      }
    }
    return blocks.length?blocks:[{paragraphs:text(safe).split(/\n+/).filter(Boolean)}];
  }

  mapLabTests(results: LabRunDto['test_results']): LabTestCase[] {
    return results.map(t=>({id:t.id,name:t.name || t.id,input:t.input || '',expected:t.expected_output,actual:t.actual,passed:t.passed}));
  }

  startQuizAttempt(lessonId: string, retry = false): Observable<QuizAttemptDto> {
    return this.lessonRequest('post', `/quiz/${encodeURIComponent(lessonId)}/attempts`, {retry});
  }

  saveQuizAnswers(attemptId: string, payload: { answers: Record<string, string>; flagged_question_ids: string[]; revision: number }): Observable<any> {
    return this.lessonRequest<{revision:number;saved:boolean}>('put', `/quiz/attempts/${encodeURIComponent(attemptId)}/answers`, payload);
  }

  submitQuizAttempt(attemptId: string): Observable<QuizResultDto> {
    return this.lessonRequest('post', `/quiz/attempts/${encodeURIComponent(attemptId)}/submit`, {});
  }

  getLabActivity(lessonId: string): Observable<{ leaderboard: import('../models/learning.model').LabLeaderboardEntry[]; submissions: import('../models/learning.model').LabSubmission[] }> {
    return this.lessonRequest('get', '/lab/' + encodeURIComponent(lessonId) + '/activity');
  }

  startLabAttempt(lessonId: string): Observable<LabAttemptDto> {
    return this.lessonRequest('post', `/lab/${encodeURIComponent(lessonId)}/attempts`, {});
  }

  saveLabDraft(lessonId: string, attemptId: string, exerciseId: string, payload: { source_code: string; revision: number }): Observable<any> {
    return this.lessonRequest<{revision:number;saved:boolean}>('put', `/lab/${encodeURIComponent(lessonId)}/attempts/${encodeURIComponent(attemptId)}/exercises/${encodeURIComponent(exerciseId)}`, payload);
  }

  runLabExercise(lessonId: string, attemptId: string, exerciseId: string, payload: { source_code: string; revision: number }): Observable<LabRunDto> {
    return this.lessonRequest('post', `/lab/${encodeURIComponent(lessonId)}/attempts/${encodeURIComponent(attemptId)}/exercises/${encodeURIComponent(exerciseId)}/run`, payload);
  }

  resetLabExercise(lessonId: string, attemptId: string, exerciseId: string, revision: number): Observable<any> {
    return this.lessonRequest<{source_code:string;revision:number}>('post', `/lab/${encodeURIComponent(lessonId)}/attempts/${encodeURIComponent(attemptId)}/exercises/${encodeURIComponent(exerciseId)}/reset`, {revision});
  }

  submitLabAttempt(lessonId: string, attemptId: string): Observable<any> {
    return this.lessonRequest<{attempt_id:string;passed:boolean;status:string;submitted_at:string}>('post', `/lab/${encodeURIComponent(lessonId)}/attempts/${encodeURIComponent(attemptId)}/submit`, {});
  }
}
