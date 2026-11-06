export interface ApiResult<T> { success: boolean; data: T; message?: string; }
export interface StudyDto {
  course: { course_id: string; course_name: string; short_description: string; thumbnail_url?: string; bg_gradient?: string;
    instructor: { full_name: string; title: string; avatar_url?: string }; rating: { average: number; total_reviews: number }; total_students: number };
  curriculum: { sections: { section_id: string; title: string; lessons: StudyLessonDto[] }[] };
  learning_progress: { progress_percentage: number; completed_lessons: number; total_lessons: number;
    remaining_lessons: number; total_time_spent_formatted: string };
  actions: { resume_learning: { lesson_id: string | null; title: string } };
}
export interface StudyLessonDto {
  lesson_id: string; lesson_number: number; title: string; lesson_type: 'article' | 'video' | 'quiz' | 'lab';
  status: 'completed' | 'in_progress' | 'not_started'; duration_seconds: number; is_free_preview: boolean;
  question_count?: number;
}
export interface OverviewDto {
  introduction: { description: string; highlights: { key: string; value: string }[] };
  what_you_will_learn: string[]; requirements: string[];
}
export interface CommunityDto {
  discussion_id?: string; qna_id?: string; lesson_id?: string; lesson_info?: { lesson_id: string; title: string } | null;
  author: { full_name: string; role: string; avatar_url?: string };
  content: string; created_at: string; created_at_formatted: string;
  likes_count?: number; is_liked?: boolean; is_owner: boolean; replies?: CommunityDto[];
}
export interface CommunityPageDto {
  pagination: { page: number; total_pages: number };
  discussions?: CommunityDto[]; qna_list?: CommunityDto[];
}
export interface DocumentsDto {
  categories: { key: string; items: { document_id: string; title: string; file_name: string;
    file_type: string; file_size_formatted: string; updated_at_formatted: string; can_download: boolean;
    lesson_id?: string | null; lesson_title?: string | null; lesson_name?: string | null; is_attached_to_lesson?: boolean }[] }[];
}
// K.15: actual lesson.user.js response contracts. IDs stay strings end to end.
export interface LessonContentDto {
  status?: 'done' | 'in-progress' | 'not-started';
  id: string; title: string; type: 'reading' | 'video' | 'quiz' | 'lab';
  reading?: { content_html: string; references?: { title: string; url: string }[] };
  lab?: { test_cases?: { id: string; name: string; input?: string; expected_output: string }[]; requirements: string; sample_code: string; expected_output: string;
    environment_config: { language?: string; setup?: string; execution_mode?: string } };
}
export interface QuizOverviewDto {
  lesson_quiz_id: string; title: string; description: string; total_questions: number;
  time_limit_minutes: number; pass_score_percent: number; total_attempts: number;
  best_score_percent: number; running_attempt: { attempt_id: string; expires_at: string } | null;
}
export interface QuizAttemptDto {
  attempt_id: string; lesson_id: string; status: string; answers: Record<string, string>;
  flagged_question_ids: string[]; revision: number; remaining_seconds: number; expires_at: string;
  questions: { id: string; text: string; type: string; options: { id: string; text: string }[] }[];
}
export interface QuizResultDto {
  attempt_id: string; status: string; score_percent: number; correct_count: number;
  wrong_count: number; unanswered_count: number; passed: boolean; submitted_at: string;
}
export interface LabAttemptDto {
  attempt_id: string; lesson_id: string; requirements: string; expected_output: string;
  environment_config: { language?: string; setup?: string; execution_mode?: string };
  exercise: { source_code: string; revision: number; status?: string; execution_ms?: number;
    test_results?: LabRunDto['test_results'] };
}
export interface LabRunDto {
  run_id: string; revision: number; passed: boolean; execution_ms: number;
  execution_mode: string; is_simulated: boolean;
  test_results: { id: string; name?: string; input?: string; passed: boolean; actual?: string;
    expected_output: string; status?: string; error?: string }[];
}
