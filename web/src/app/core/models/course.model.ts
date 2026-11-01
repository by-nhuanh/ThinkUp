export interface Course {
  id: string;
  slug?: string;
  courseId?: string;
  title: string;
  displayTitle?: string;
  description?: string;
  instructor: string;
  instructorInitial?: string;
  category?: string;
  level?: string;
  rating: number;
  ratingCount: number | string;
  studentsCount?: number;
  students?: string;
  duration?: string;
  lessonsCount?: number;
  originalPrice: number;
  salePrice: number;
  badge?: string;
  tags?: string[];
  thumbnailUrl?: string;
  bgGradient?: string;
  thumbnail?: string;
  theme?: string;
  shortLabel?: string;
  icon?: string;
  shortDescription?: string;
  language?: string;
  updatedAtLabel?: string;
  outcomes?: string[];
  outcomeGroups?: CourseOutcomeGroup[];
  curriculum?: CourseChapter[];
  reviews?: CourseReview[];
  instructorProfile?: InstructorProfile;
  countdown?: string;
  sectionsCount?: number;
  previewVideoUrl?: string;
  saleEndsAt?: string | null;
  ratingBreakdown?: ReviewBreakdownRow[];
  isAuthenticated?: boolean;
  isPurchased?: boolean;
  isInWishlist?: boolean;
  isInCart?: boolean;
  learningUrl?: string;
  trialPreviewUrl?: string;
}

export interface CourseOutcomeGroup {
  title: string;
  items: string[];
}

export interface ReviewBreakdownRow {
  stars: number;
  count: number;
  percent: number;
}

export interface CourseReviewFilterOption {
  label: string;
  value: string | number;
  count: number;
}

export interface CourseReviewSortOption {
  label: string;
  value: string;
  active: boolean;
}

export interface CourseReviewPage {
  reviews: CourseReview[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
  summary: {
    average: number;
    total: number;
    breakdown: ReviewBreakdownRow[];
  };
  filterOptions: CourseReviewFilterOption[];
  sortOptions: CourseReviewSortOption[];
}

export interface CoursePreviewLesson {
  id: string;
  title: string;
  type: 'video' | 'quiz' | 'lab' | 'article';
  durationMinutes: number;
  isFreePreview: boolean;
  isLocked: boolean;
  videoUrl?: string;
}

export interface CoursePreviewSection {
  id: string;
  title: string;
  isLocked: boolean;
  lessons: CoursePreviewLesson[];
}

export interface CourseUpsell {
  title: string;
  message: string;
  ctaLabel: string;
  ctaUrl: string;
}

export interface CoursePlayerConfig {
  allowMarkCompleted: boolean;
  allowNotes: boolean;
  allowQa: boolean;
  qaMessage: string;
  upsell: CourseUpsell | null;
}

export interface CoursePreviewResource {
  id: string;
  name: string;
  lessonName: string;
  categoryLabel: string;
  size: string;
  downloadUrl: string;
}

export interface CoursePreview {
  courseId: string;
  title: string;
  slug: string;
  thumbnailUrl?: string;
  price: number;
  isPurchased: boolean;
  mode: string;
  playerConfig: CoursePlayerConfig;
  syllabus: CoursePreviewSection[];
  previewLessons: CoursePreviewLesson[];
  initialLesson: CoursePreviewLesson | null;
  resources: CoursePreviewResource[];
}

export interface LessonStream {
  lessonId: string;
  videoUrl: string;
  duration?: string;
  provider?: string;
  isFreePreview: boolean;
}

export interface CourseLesson {
  id: string;
  title: string;
  duration: string;
  type: 'Video' | 'Lab' | 'Quiz' | 'Reading';
  isPreview?: boolean;
  isLocked?: boolean;
}

export interface CourseChapter {
  id: string;
  title: string;
  duration?: string;
  lessons: CourseLesson[];
}

export interface CourseReview {
  id: string;
  author: string;
  avatar?: string;
  rating: number;
  date: string;
  comment: string;
}

export interface InstructorProfile {
  name: string;
  title: string;
  bio: string;
  rating: number;
  studentsCount: number | string;
  coursesCount: number;
  avatar?: string;
}

export interface CourseFilters {
  query?: string;
  searchMode?: string;
  categories?: string[];
  levels?: string[];
  ratings?: string;
  tags?: string[];
  maxDuration?: number;
  priceType?: string;
  sort?: string;
}

export interface CourseFilterOptions {
  categories: string[];
  popularTags: string[];
}

export interface CourseListResponse {
  success: boolean;
  data: Course[];
  total: number;
}

export interface EnrolledCourse {
  id: string;
  title: string;
  instructor: string;
  totalLessons: number;
  completedLessons: number;
  image?: string;
  thumbnailUrl?: string;
  cover?: string;
  coverTitle?: string;
  coverSubtitle?: string;
  badge?: string;
  lastStudiedAt?: string;
}

