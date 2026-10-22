export type LessonType = 'video' | 'reading' | 'quiz';

export interface QuizOption { id: string; text: string; }
export interface QuizQuestion { id: string; text: string; options: QuizOption[]; correctOptionId: string; }
export interface QuizResult { score: number; correctCount: number; incorrectCount: number; passed: boolean; }
export interface LearningLesson {
  id: string;
  title: string;
  type: LessonType;
  duration: string;
  completed?: boolean;
  status?: 'completed' | 'failed' | 'pending';
  completionThreshold?: number;
  videoUrl?: string;
  reading?: { lead: string; sections: { title: string; paragraphs: string[]; bullets?: string[] }[] };
  quiz?: { timeLimit: number; passingScore: number; questions: QuizQuestion[] };
}
export interface LearningChapter { id: string; title: string; lessons: LearningLesson[]; }
export interface LearningCourse { id: string; title: string; instructor: string; progress: number; chapters: LearningChapter[]; }
export interface CommunityReply {
  id: string;
  author: string;
  initials: string;
  body: string;
  createdAt: string;
  likes: number;
  liked?: boolean;
  role?: 'instructor' | 'assistant';
  attachmentDataUrl?: string;
}
export interface CommunityPost extends CommunityReply { replies: CommunityReply[]; resolved?: boolean; }

