export type LessonType = 'video' | 'reading' | 'quiz' | 'lab';
export type LessonStatus = 'done' | 'not-started' | 'failed';
export type UtilityTab = 'overview' | 'resources' | 'qa' | 'discussion';

export interface QuizOption {
  id: string;
  text: string;
}

export interface QuizQuestion {
  id: string;
  text: string;
  options: QuizOption[];
  correctOptionId: string;
}

export interface QuizConfig {
  timeLimit: number;
  passingScore: number;
  questions: QuizQuestion[];
}

export interface ReadingSection {
  title: string;
  paragraphs: string[];
  bullets?: string[];
  code?: string;
  callout?: string;
}

export interface ReadingConfig {
  lead: string;
  sections: ReadingSection[];
}

export interface LabTestCase {
  id: string;
  name: string;
  input: string;
  expected: string;
  actual?: string;
  passed?: boolean;
}

export interface LabSolution {
  id: string;
  label: string;
  description: string;
  code: string;
  pros: string[];
  cons: string[];
}

export interface LabInstructionBlock {
  heading?: string;
  paragraphs?: string[];
  bullets?: string[];
  code?: string;
  note?: string;
}

export interface LabLeaderboardEntry {
  id: string;
  rank: number;
  name: string;
  initials: string;
  color: string;
  score: number;
  attempts: number;
  execTime: string;
  submittedAt: string;
  medal?: 'gold' | 'silver' | 'bronze';
}

export interface LabSubmission {
  id: string;
  submittedAt: string;
  testsPassed: number;
  testsTotal: number;
  status: 'pass' | 'fail';
  execTime: string;
}

export interface LabExercise {
  id: string;
  order: number;
  title: string;
  language: string;
  knowledge: LabInstructionBlock[];
  task: LabInstructionBlock[];
  starterCode: string;
  tests: LabTestCase[];
  solutions: LabSolution[];
  leaderboard: LabLeaderboardEntry[];
  submissions: LabSubmission[];
}

export interface LabConfig {
  language: string;
  fileName: string;
  taskTitle: string;
  instructions: LabInstructionBlock[];
  starterCode: string;
  tests: LabTestCase[];
  solutions: LabSolution[];
  exercises?: LabExercise[];
}

export interface LearningLesson {
  id: string;
  order: number;
  title: string;
  type: LessonType;
  duration: string;
  completed?: boolean;
  status?: LessonStatus;
  isPreview?: boolean;
  isLocked?: boolean;
  summary?: string;
  videoUrl?: string;
  reading?: ReadingConfig;
  quiz?: QuizConfig;
  lab?: LabConfig;
}

export interface LearningChapter {
  id: string;
  title: string;
  lessons: LearningLesson[];
}

export interface LearningUpsell {
  title: string;
  message: string;
  ctaLabel: string;
  ctaUrl: string;
}

export interface LearningPlayerConfig {
  allowMarkCompleted: boolean;
  allowNotes: boolean;
  allowQa: boolean;
  qaMessage: string;
  upsell: LearningUpsell | null;
}

export interface LearningCourse {
  id: string;
  title: string;
  instructor: string;
  instructorTitle: string;
  progress: number;
  description: string;
  coverGradient: string;
  coverLabel: string;
  rating: number;
  ratingCount: number;
  studentCount: number;
  chapters: LearningChapter[];
  isPurchased?: boolean;
  playerConfig?: LearningPlayerConfig;
}

export interface CommunityReply {
  id: string;
  author: string;
  initials: string;
  role?: string;
  body: string;
  createdAt: string;
  likes: number;
  liked?: boolean;
}

export interface CommunityPost extends CommunityReply {
  replies: CommunityReply[];
  resolved?: boolean;
  pinned?: boolean;
}

export interface CourseReview {
  id: string;
  author: string;
  initials: string;
  rating: number;
  date: string;
  comment: string;
  helpful: number;
  mine?: boolean;
  editing?: boolean;
}

export interface CourseReviewSummary {
  average: number;
  total: number;
  distribution: { stars: number; percent: number }[];
  reviews: CourseReview[];
}

export interface LearningResource {
  id: string;
  title: string;
  meta: string;
  size: string;
}

export interface ReportReason {
  id: string;
  label: string;
  description: string;
  tone: 'danger' | 'spam' | 'warning' | 'copyright' | 'harassment' | 'neutral';
}

export interface LessonInfoContent {
  overview: string[];
  goals: string[];
  resources: LearningResource[];
}

export interface CourseDocument {
  id: string;
  name: string;
  subtitle: string;
  category: 'lecture' | 'code' | 'exercise';
  kind: string;
  size: string;
  updated: string;
  ext: 'pdf' | 'zip' | 'docx' | 'pptx';
}

export interface DashboardReply {
  author: string;
  initials: string;
  role: string;
  date: string;
  body: string;
  relatedLessonTitle?: string;
}

export interface DashboardQuestion {
  id: string;
  author: string;
  initials: string;
  role: string;
  date: string;
  body: string;
  relatedLessonTitle: string;
  replies: DashboardReply[];
}
