import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import {
  Course,
  CourseFilters,
  CourseFilterOptions,
  CourseListResponse,
  CoursePreview,
  CoursePreviewLesson,
  CourseReview,
  CourseReviewPage,
  CourseReviewSortOption,
  CourseReviewFilterOption,
  EnrolledCourse,
  LessonStream,
  ReviewBreakdownRow,
} from '../models/course.model';
import { StudentPreferences } from '../models/user.model';
import { MOCK_COURSES, MOCK_CATEGORIES, MOCK_POPULAR_TAGS } from '../data/mock/mock-courses';
import { MOCK_ENROLLED_COURSES } from '../data/mock/mock-enrolled-courses';

interface CourseCardDto {
  id: string;
  course_id?: string;
  slug?: string;
  title: string;
  thumbnail_url?: string;
  badge?: string;
  level?: string;
  duration_formatted?: string;
  instructor?: { name?: string };
  rating?: number | string;
  total_reviews?: number | string;
  total_students?: number | string;
  tag_names?: string[];
  price?: { original?: number | string; sale?: number | string };
}

interface CourseCardsResponse {
  success: boolean;
  data: {
    pagination: { total_items: number };
    courses: CourseCardDto[];
  };
}

interface CourseInstructorDto {
  instructor_id?: string;
  full_name?: string;
  avatar_url?: string;
  title?: string;
  rating?: number | string;
  total_reviews?: number | string;
  total_students?: number | string;
  total_courses?: number | string;
  positive_rating?: number | string;
  bio?: string;
}

interface CourseLessonDetailDto {
  lesson_id: string;
  title: string;
  lesson_type?: string;
  duration_minutes?: number | string;
  duration_formatted?: string;
  is_free_preview?: boolean;
  is_locked?: boolean;
  can_preview_now?: boolean;
}

interface CourseSectionDetailDto {
  section_id: string;
  title: string;
  description?: string;
  duration_formatted?: string;
  lessons?: CourseLessonDetailDto[];
}

interface CourseOutcomeGroupDto {
  title?: string;
  items?: string[];
}

interface CourseDetailDto {
  course_id: string;
  id?: string;
  slug?: string;
  title: string;
  short_description?: string;
  description?: string;
  thumbnail_url?: string;
  preview_video_url?: string;
  badge?: string;
  level?: string;
  language?: string;
  updated_at?: string;
  rating?: number | string;
  total_reviews?: number | string;
  total_students?: number | string;
  total_duration_formatted?: string;
  total_sections_count?: number | string;
  total_lessons_count?: number | string;
  category?: { name?: string } | null;
  tags?: { name?: string }[];
  levels?: string[];
  pricing?: {
    price?: number | string;
    original_price?: number | string;
    sale_ends_at?: string | null;
  };
  course_outcomes?: CourseOutcomeGroupDto[];
  sections?: CourseSectionDetailDto[];
  instructor?: CourseInstructorDto | null;
  reviews_summary?: {
    average_rating?: number | string;
    total_reviews?: number | string;
    breakdown?: Record<string, number | string>;
  };
  user_state?: {
    is_authenticated?: boolean;
    is_in_wishlist?: boolean;
    is_in_cart?: boolean;
    is_purchased?: boolean;
    navigation?: {
      learning_url?: string;
      trial_preview_url?: string;
    };
  };
}

interface CourseReviewDto {
  review_id: string;
  reviewer_name?: string;
  rating?: number | string;
  content?: string;
  created_at_relative?: string;
  created_at?: string;
}

interface CourseReviewsDto {
  pagination: {
    page: number;
    limit: number;
    total_items: number;
    total_pages: number;
    has_next: boolean;
    has_prev: boolean;
  };
  filter_summary: {
    total_reviews: number;
    breakdown: Record<string, number | string>;
    filter_options: CourseReviewFilterOption[];
  };
  sort_options: CourseReviewSortOption[];
  reviews: CourseReviewDto[];
}

interface CoursePreviewLessonDto {
  lesson_id: string;
  title: string;
  lesson_type?: string;
  duration_minutes?: number | string;
  is_free_preview?: boolean;
  is_locked?: boolean;
  video_url?: string;
}

interface CoursePreviewDto {
  course: {
    course_id: string;
    title: string;
    slug: string;
    thumbnail_url?: string;
    price?: number | string;
  };
  user_state: { is_purchased?: boolean; mode?: string };
  player_config: {
    allow_mark_completed?: boolean;
    allow_notes?: boolean;
    allow_qa?: boolean;
    qa_lock_message?: string;
    upsell_popup?: { title?: string; message?: string; cta_label?: string; cta_url?: string } | null;
  };
  syllabus: {
    section_id: string;
    title: string;
    is_locked?: boolean;
    lessons?: CoursePreviewLessonDto[];
  }[];
  preview_lessons?: CoursePreviewLessonDto[];
  initial_lesson?: CoursePreviewLessonDto | null;
  resources?: {
    id: string;
    name?: string;
    lesson_name?: string;
    category_label?: string;
    size?: string;
    download_url?: string;
  }[];
}

interface LessonStreamDto {
  lesson_id: string;
  video_url: string;
  duration?: string;
  provider?: string;
  is_free_preview?: boolean;
}

export interface CourseReviewQuery {
  rating?: number | 'all';
  sort?: string;
  page?: number;
  limit?: number;
}

@Injectable({ providedIn: 'root' })
export class CourseService {
  private http = inject(HttpClient);
  private apiUrl = environment.apiUrl;

  getCourses(filters: CourseFilters = {}): Observable<CourseListResponse> {
    let params = new HttpParams();
    if (filters.query) params = params.set('search', filters.query);
    if (filters.categories?.length === 1) params = params.set('category_id', filters.categories[0]);
    if (filters.levels?.length === 1) params = params.set('level', filters.levels[0]);
    if (filters.ratings) params = params.set('min_rating', filters.ratings);
    if (filters.tags?.length === 1) params = params.set('tag_id', filters.tags[0]);
    if (filters.priceType && filters.priceType !== 'all') params = params.set('price_type', filters.priceType);
    if (filters.sort) params = params.set('sort', this.mapSort(filters.sort));
    params = params.set('limit', 'all');

    return this.http.get<CourseCardsResponse>(`${this.apiUrl}/courses`, { params }).pipe(
      map(response => ({
        success: response.success,
        data: response.data.courses.map(course => this.mapCourseCard(course)),
        total: response.data.pagination.total_items,
      }))
    );
  }

  private mapCourseCard(course: CourseCardDto): Course {
    return {
      id: course.course_id || course.id,
      courseId: course.course_id,
      slug: course.slug,
      title: course.title,
      instructor: course.instructor?.name || 'Giảng viên ThinkUp',
      level: course.level,
      rating: this.toNumber(course.rating),
      ratingCount: this.toNumber(course.total_reviews),
      studentsCount: this.toNumber(course.total_students),
      duration: course.duration_formatted,
      originalPrice: this.toNumber(course.price?.original),
      salePrice: this.toNumber(course.price?.sale),
      badge: course.badge,
      tags: course.tag_names || [],
      thumbnailUrl: course.thumbnail_url,
    };
  }

  private mapSort(sort: string): string {
    return ({
      'price-low': 'price_asc',
      'price-high': 'price_desc',
      rating: 'highest_rated',
    } as Record<string, string>)[sort] || sort;
  }

  private toNumber(value: number | string | null | undefined): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  getCourseById(courseId: string): Observable<{ success: boolean; data: Course | null }> {
    return this.http.get<{ success: boolean; data: CourseCardDto }>(`${this.apiUrl}/courses/${encodeURIComponent(courseId)}`).pipe(
      map(response => ({ success: response.success, data: this.mapCourseCard(response.data) }))
    );
  }

  getCourseDetail(courseId: string): Observable<Course> {
    return this.http
      .get<{ success: boolean; data: CourseDetailDto }>(
        `${this.apiUrl}/courses/${encodeURIComponent(courseId)}/detail`
      )
      .pipe(map(response => this.mapCourseDetail(response.data)));
  }

  getCoursePreview(courseId: string): Observable<CoursePreview> {
    return this.http
      .get<{ success: boolean; data: CoursePreviewDto }>(
        `${this.apiUrl}/courses/${encodeURIComponent(courseId)}/preview`
      )
      .pipe(map(response => this.mapCoursePreview(response.data)));
  }

  getCourseReviews(courseId: string, query: CourseReviewQuery = {}): Observable<CourseReviewPage> {
    let params = new HttpParams()
      .set('page', String(query.page ?? 1))
      .set('limit', String(query.limit ?? 10))
      .set('sort', query.sort ?? 'newest');
    if (query.rating && query.rating !== 'all') {
      params = params.set('rating', String(query.rating));
    }

    return this.http
      .get<{ success: boolean; data: CourseReviewsDto }>(
        `${this.apiUrl}/courses/${encodeURIComponent(courseId)}/reviews`,
        { params }
      )
      .pipe(map(response => this.mapCourseReviewPage(response.data)));
  }

  getLessonStream(courseId: string, lessonId: string): Observable<LessonStream> {
    return this.http
      .get<{ success: boolean; data: LessonStreamDto }>(
        `${this.apiUrl}/courses/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lessonId)}/stream`
      )
      .pipe(
        map(response => ({
          lessonId: response.data.lesson_id,
          videoUrl: response.data.video_url,
          duration: response.data.duration,
          provider: response.data.provider,
          isFreePreview: response.data.is_free_preview === true,
        }))
      );
  }

  private mapCourseDetail(dto: CourseDetailDto): Course {
    const instructor = dto.instructor;
    const outcomeGroups = (dto.course_outcomes ?? [])
      .map(group => ({
        title: group.title ?? '',
        items: (group.items ?? []).filter((item): item is string => Boolean(item)),
      }))
      .filter(group => group.items.length > 0);
    const pricing = dto.pricing ?? {};
    const rating = this.toNumber(dto.reviews_summary?.average_rating ?? dto.rating);
    const ratingCount = this.toNumber(dto.reviews_summary?.total_reviews ?? dto.total_reviews);
    const studentCount = this.toNumber(dto.total_students);

    return {
      id: dto.course_id,
      courseId: dto.course_id,
      slug: dto.slug,
      title: dto.title,
      shortDescription: dto.short_description,
      description: dto.description,
      instructor: instructor?.full_name || 'Giảng viên ThinkUp',
      instructorId: instructor?.instructor_id,
      instructorInitial: (instructor?.full_name || 'G').charAt(0).toUpperCase(),
      category: dto.category?.name,
      level: dto.levels?.[0] || dto.level,
      rating,
      ratingCount,
      studentsCount: studentCount,
      students: studentCount ? `${new Intl.NumberFormat('vi-VN').format(studentCount)} học viên` : undefined,
      duration: dto.total_duration_formatted,
      lessonsCount: this.toNumber(dto.total_lessons_count),
      sectionsCount: this.toNumber(dto.total_sections_count),
      originalPrice: this.toNumber(pricing.original_price),
      salePrice: this.toNumber(pricing.price),
      badge: dto.badge,
      tags: (dto.tags ?? []).map(tag => tag.name).filter((name): name is string => Boolean(name)),
      thumbnailUrl: dto.thumbnail_url,
      language: dto.language,
      updatedAtLabel: this.formatDate(dto.updated_at),
      previewVideoUrl: dto.preview_video_url,
      saleEndsAt: pricing.sale_ends_at ?? null,
      outcomes: outcomeGroups.flatMap(group => group.items),
      outcomeGroups,
      curriculum: (dto.sections ?? []).map(section => ({
        id: section.section_id,
        title: section.title,
        duration: section.duration_formatted,
        lessons: (section.lessons ?? []).map(lesson => ({
          id: lesson.lesson_id,
          title: lesson.title,
          duration: lesson.duration_formatted || this.formatLessonDuration(lesson.duration_minutes),
          type: this.mapLessonType(lesson.lesson_type),
          isPreview: lesson.can_preview_now === true || lesson.is_free_preview === true,
          isLocked: lesson.is_locked === true,
        })),
      })),
      instructorProfile: instructor
        ? {
            id: instructor.instructor_id,
            name: instructor.full_name || 'Giảng viên ThinkUp',
            title: instructor.title || 'Senior Instructor',
            bio: instructor.bio || '',
            rating: this.toNumber(instructor.rating),
            studentsCount: this.toNumber(instructor.total_students),
            coursesCount: this.toNumber(instructor.total_courses),
            avatar: instructor.avatar_url,
          }
        : undefined,
      ratingBreakdown: this.mapBreakdown(dto.reviews_summary?.breakdown, ratingCount),
      isAuthenticated: dto.user_state?.is_authenticated === true,
      isPurchased: dto.user_state?.is_purchased === true,
      isInWishlist: dto.user_state?.is_in_wishlist === true,
      isInCart: dto.user_state?.is_in_cart === true,
      learningUrl: dto.user_state?.navigation?.learning_url,
      trialPreviewUrl: dto.user_state?.navigation?.trial_preview_url,
    };
  }

  private mapCoursePreview(dto: CoursePreviewDto): CoursePreview {
    const playerConfig = dto.player_config ?? {};
    const upsell = playerConfig.upsell_popup;
    return {
      courseId: dto.course.course_id,
      title: dto.course.title,
      slug: dto.course.slug,
      thumbnailUrl: dto.course.thumbnail_url,
      price: this.toNumber(dto.course.price),
      isPurchased: dto.user_state?.is_purchased === true,
      mode: dto.user_state?.mode ?? 'free_trial',
      playerConfig: {
        allowMarkCompleted: playerConfig.allow_mark_completed !== false,
        allowNotes: playerConfig.allow_notes !== false,
        allowQa: playerConfig.allow_qa !== false,
        qaMessage: playerConfig.qa_lock_message ?? '',
        upsell: upsell
          ? {
              title: upsell.title ?? '',
              message: upsell.message ?? '',
              ctaLabel: upsell.cta_label ?? 'Mua khóa học',
              ctaUrl: upsell.cta_url ?? '',
            }
          : null,
      },
      syllabus: (dto.syllabus ?? []).map(section => ({
        id: section.section_id,
        title: section.title,
        isLocked: section.is_locked === true,
        lessons: (section.lessons ?? []).map(lesson => this.mapPreviewLesson(lesson)),
      })),
      previewLessons: (dto.preview_lessons ?? []).map(lesson => this.mapPreviewLesson(lesson)),
      initialLesson: dto.initial_lesson ? this.mapPreviewLesson(dto.initial_lesson) : null,
      resources: (dto.resources ?? []).map(resource => ({
        id: resource.id,
        name: resource.name ?? 'Tài liệu bài học',
        lessonName: resource.lesson_name ?? '',
        categoryLabel: resource.category_label ?? '',
        size: resource.size ?? '',
        downloadUrl: resource.download_url ?? '',
      })),
    };
  }

  private mapPreviewLesson(dto: CoursePreviewLessonDto): CoursePreviewLesson {
    return {
      id: dto.lesson_id,
      title: dto.title,
      type: this.mapPreviewLessonType(dto.lesson_type),
      durationMinutes: this.toNumber(dto.duration_minutes),
      isFreePreview: dto.is_free_preview === true,
      isLocked: dto.is_locked === true,
      videoUrl: dto.video_url,
    };
  }

  private mapCourseReviewPage(dto: CourseReviewsDto): CourseReviewPage {
    const total = this.toNumber(dto.filter_summary?.total_reviews);
    return {
      reviews: (dto.reviews ?? []).map(review => this.mapCourseReview(review)),
      pagination: {
        page: dto.pagination?.page ?? 1,
        limit: dto.pagination?.limit ?? 10,
        totalItems: dto.pagination?.total_items ?? 0,
        totalPages: dto.pagination?.total_pages ?? 0,
        hasNext: dto.pagination?.has_next === true,
        hasPrev: dto.pagination?.has_prev === true,
      },
      summary: {
        average: this.averageFromBreakdown(dto.filter_summary?.breakdown),
        total,
        breakdown: this.mapBreakdown(dto.filter_summary?.breakdown, total),
      },
      filterOptions: (dto.filter_summary?.filter_options ?? []).map(option => ({
        label: option.label,
        value: option.value,
        count: this.toNumber(option.count),
      })),
      sortOptions: (dto.sort_options ?? []).map(option => ({
        label: option.label,
        value: option.value,
        active: option.active === true,
      })),
    };
  }

  private mapCourseReview(dto: CourseReviewDto): CourseReview {
    return {
      id: dto.review_id,
      author: dto.reviewer_name || 'Học viên ThinkUp',
      rating: this.toNumber(dto.rating),
      date: dto.created_at_relative || this.formatDate(dto.created_at) || '',
      comment: dto.content || '',
    };
  }

  private mapBreakdown(
    breakdown: Record<string, number | string> | undefined,
    total: number
  ): ReviewBreakdownRow[] {
    const source = breakdown ?? {};
    return [5, 4, 3, 2, 1].map(stars => {
      const count = this.toNumber(source[String(stars)]);
      return {
        stars,
        count,
        percent: total > 0 ? Math.round((count / total) * 100) : 0,
      };
    });
  }

  private averageFromBreakdown(breakdown: Record<string, number | string> | undefined): number {
    const source = breakdown ?? {};
    let weighted = 0;
    let total = 0;
    for (let stars = 1; stars <= 5; stars += 1) {
      const count = this.toNumber(source[String(stars)]);
      weighted += stars * count;
      total += count;
    }
    return total > 0 ? Math.round((weighted / total) * 10) / 10 : 0;
  }

  private mapLessonType(type?: string): 'Video' | 'Lab' | 'Quiz' | 'Reading' {
    switch ((type ?? 'video').toLowerCase()) {
      case 'quiz':
        return 'Quiz';
      case 'lab':
        return 'Lab';
      case 'article':
      case 'reading':
        return 'Reading';
      default:
        return 'Video';
    }
  }

  private mapPreviewLessonType(type?: string): CoursePreviewLesson['type'] {
    switch ((type ?? 'video').toLowerCase()) {
      case 'quiz':
        return 'quiz';
      case 'lab':
        return 'lab';
      case 'article':
      case 'reading':
        return 'article';
      default:
        return 'video';
    }
  }

  private formatLessonDuration(minutes?: number | string): string {
    const value = this.toNumber(minutes);
    if (!value) return '';
    const hours = Math.floor(value / 60);
    const remainder = Math.round(value % 60);
    return hours > 0 ? `${hours}h ${remainder}m` : `${remainder} phút`;
  }

  private formatDate(value?: string): string | undefined {
    if (!value) return undefined;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return undefined;
    return date.toLocaleDateString('vi-VN');
  }

  getFilterOptions(): Observable<{ success: boolean; data: CourseFilterOptions }> {
    return this.http.get<{ success: boolean; data: CourseFilterOptions }>(`${this.apiUrl}/courses/filters`).pipe(
      catchError(() => of({
        success: true,
        data: { categories: MOCK_CATEGORIES, popularTags: MOCK_POPULAR_TAGS }
      }))
    );
  }

  getRecommendedCourses(interests: string[] = [], excludeIds: string[] = []): Observable<{ success: boolean; data: Course[] }> {
    let params = new HttpParams();
    if (interests.length) params = params.set('interests', interests.join(','));
    if (excludeIds.length) params = params.set('excludeIds', excludeIds.join(','));

    return this.http.get<{ success: boolean; data: Course[] }>(`${this.apiUrl}/courses/recommendations`, { params }).pipe(
      catchError(() => of({ success: true, data: MOCK_COURSES.slice(0, 4) }))
    );
  }

  getMyCourses(): Observable<{ success: boolean; data: EnrolledCourse[] }> {
    return this.http.get<{ success: boolean; data: EnrolledCourse[] }>(`${this.apiUrl}/user/dashboard`, { withCredentials: true }).pipe(
      catchError(() => of({ success: true, data: MOCK_ENROLLED_COURSES }))
    );
  }

  /**
   * BỘ LỌC KHÓA HỌC GỢI Ý (LOGIC-ONB-REC-01)
   * 1. Hard Filter: Loại bỏ khóa học không liên quan đến nghề hoặc kỹ năng học viên đã chọn.
   * 2. Sorting Priority:
   *    - Ưu tiên 1: Khóa học có level trùng khớp với currentLevel của học viên.
   *    - Ưu tiên 2: Khóa học chứa nhiều kỹ năng trùng khớp nhất với selectedSkills.
   *    - Ưu tiên 3: Rating cao hơn và số lượng học viên đông hơn.
   */
  filterByPreferences(courses: Course[], preferences: StudentPreferences | null): Course[] {
    if (!preferences || !preferences.targetRole) {
      // Bỏ qua khảo sát hoặc không có sở thích: Sắp xếp theo số học viên đông nhất (ORDER BY total_students DESC)
      return [...courses].sort((a, b) => (b.studentsCount || 0) - (a.studentsCount || 0));
    }

    const targetRole = preferences.targetRole.toLowerCase();
    const selectedSkills = (preferences.selectedSkills || []).map(s => s.toLowerCase());
    const currentLevel = (preferences.currentLevel || '').toLowerCase();

    // Mapping role ID sang các từ khóa danh mục / tags
    const roleKeywordMap: Record<string, string[]> = {
      'frontend': ['frontend', 'reactjs', 'angular', 'vue', 'html', 'css', 'javascript', 'typescript', 'tailwind'],
      'backend': ['backend', 'nodejs', 'express', 'python', 'java', 'database', 'sql', 'mongodb', 'api'],
      'fullstack': ['fullstack', 'frontend', 'backend', 'reactjs', 'nodejs', 'nextjs', 'javascript'],
      'mobile': ['mobile', 'flutter', 'react native', 'ios', 'android', 'swift', 'kotlin'],
      'data-ai': ['data', 'ai', 'python', 'machine learning', 'deep learning', 'data science', 'sql'],
      'devops-cloud': ['devops', 'cloud', 'docker', 'kubernetes', 'aws', 'linux', 'ci/cd'],
      'explore': [],
      'ui-ux': ['ui/ux', 'design', 'thiết kế', 'figma']
    };

    const targetKeywords = roleKeywordMap[targetRole] || [targetRole];

    // Helper: Map level string
    const mapLevel = (levelStr: string = ''): string => {
      const l = levelStr.toLowerCase();
      if (l.includes('cơ bản') || l.includes('người mới') || l.includes('beginner')) return 'beginner';
      if (l.includes('trung cấp') || l.includes('nền tảng') || l.includes('intermediate')) return 'intermediate';
      if (l.includes('nâng cao') || l.includes('chuyên sâu') || l.includes('advanced')) return 'advanced';
      return 'beginner';
    };

    const normalizedTargetLevel = mapLevel(currentLevel);

    // 1. HARD FILTER: Khóa học phải thuộc nghề hoặc có ít nhất 1 kỹ năng trùng
    const filtered = courses.filter(c => {
      const courseTags = (c.tags || []).map(t => t.toLowerCase());
      const courseTitle = (c.title || '').toLowerCase();
      const courseCategory = (c.category || '').toLowerCase();

      // Điều kiện 1: Khóa học thuộc danh mục nghề học viên đã chọn
      const matchesRole = targetKeywords.some(kw =>
        courseCategory.includes(kw) || courseTitle.includes(kw) || courseTags.some(t => t.includes(kw))
      );

      // Điều kiện 2: Khóa học chứa ít nhất 1 kỹ năng trong danh sách học viên chọn
      const matchesSkill = selectedSkills.some(skill => {
        const cleanSkill = skill.replace(/[-_]/g, ' ');
        return courseTags.some(t => t.includes(cleanSkill) || cleanSkill.includes(t)) ||
               courseTitle.includes(cleanSkill);
      });

      return matchesRole || matchesSkill;
    });

    // 2. SORTING PRIORITY:
    filtered.sort((a, b) => {
      const aLevel = mapLevel(a.level);
      const bLevel = mapLevel(b.level);

      const aLevelMatch = aLevel === normalizedTargetLevel ? 1 : 0;
      const bLevelMatch = bLevel === normalizedTargetLevel ? 1 : 0;

      // Ưu tiên 1: Trình độ trùng khớp
      if (aLevelMatch !== bLevelMatch) {
        return bLevelMatch - aLevelMatch;
      }

      // Ưu tiên 2: Số kỹ năng trùng khớp nhiều nhất
      const countMatchingSkills = (course: Course): number => {
        const tags = (course.tags || []).map(t => t.toLowerCase());
        const title = (course.title || '').toLowerCase();
        let count = 0;
        selectedSkills.forEach(skill => {
          const cleanSkill = skill.replace(/[-_]/g, ' ');
          if (tags.some(t => t.includes(cleanSkill) || cleanSkill.includes(t)) || title.includes(cleanSkill)) {
            count++;
          }
        });
        return count;
      };

      const aSkillCount = countMatchingSkills(a);
      const bSkillCount = countMatchingSkills(b);
      if (aSkillCount !== bSkillCount) {
        return bSkillCount - aSkillCount;
      }

      // Ưu tiên 3: Rating cao hơn & số học viên đông hơn
      if ((b.rating || 0) !== (a.rating || 0)) {
        return (b.rating || 0) - (a.rating || 0);
      }
      return (b.studentsCount || 0) - (a.studentsCount || 0);
    });

    return filtered;
  }

  private parseDurationHours(duration?: string): number {
    if (!duration) return 0;

    const hours = Number(duration.match(/(\d+)\s*giờ/i)?.[1] || 0);
    const minutes = Number(duration.match(/(\d+)\s*phút/i)?.[1] || 0);
    return hours + minutes / 60;
  }
}

