/**
 * Roadmap domain models.
 *
 * Trạng thái kỹ năng bám theo bảng quy định trạng thái Node trong đặc tả:
 * - `not-started`: Ô xám – chưa học.
 * - `in-progress`: Ô xanh – đang học.
 * - `review`: Ô cam – phát hiện lỗ hổng, cần ôn tập Flashcard / làm lại bài củng cố.
 * - `completed`: Ô xanh tick – đã đạt chuẩn (mastery >= 70%).
 */
export type RoadmapSkillStatus = 'not-started' | 'in-progress' | 'review' | 'completed';

export type RoadmapDifficulty = 'Cơ bản' | 'Trung cấp' | 'Nâng cao';

export type RoadmapStageIcon = 'foundation' | 'code' | 'framework' | 'shield' | 'sparkles' | 'people';

export interface RoadmapSkillLink {
  name: string;
  description: string;
}

export interface RoadmapSkill {
  id: string;
  title: string;
  /** Mô tả ngắn dùng cho danh sách / tìm kiếm. */
  desc: string;
  /** Mô tả đầy đủ hiển thị ở trang chi tiết kỹ năng. */
  summary: string;
  status: RoadmapSkillStatus;
  /** Điểm năng lực thực tế theo EWMA (0 - 100). */
  mastery: number;
  difficulty: RoadmapDifficulty;
  /** Loại kỹ năng: Ngôn ngữ, Framework, Công cụ, Kỹ năng mềm... */
  type: string;
  outcomes: string[];
  prerequisites: string[];
  nextSkill: RoadmapSkillLink | null;
  /** Khoá học trong kho ThinkUp gắn với kỹ năng này. */
  courseIds: string[];
  stageId: string;
}

export interface RoadmapStage {
  id: string;
  number: number;
  name: string;
  desc: string;
  icon: RoadmapStageIcon;
  /** Màu nền ô icon. */
  tint: string;
  /** Màu icon / điểm nhấn của giai đoạn. */
  accent: string;
  skills: RoadmapSkill[];
}

export interface RoadmapDetail {
  id: string;
  title: string;
  desc: string;
  stages: RoadmapStage[];
}

export interface RoadmapMetaItem {
  id: string;
  title: string;
  /** Tiêu đề hiển thị trên thẻ ở trang danh sách (theo thiết kế: Front-end Developer). */
  cardTitle: string;
  shortCode: string;
  color: string;
  bgColor: string;
  desc: string;
  stagesCount: number;
  skillsCount: number;
}

export interface RoadmapProgress {
  completed: number;
  total: number;
  percent: number;
}

export interface RoadmapStageProgress {
  completed: number;
  total: number;
  percent: number;
}

export interface RoadmapTestOption {
  id: string;
  label: string;
}

export interface RoadmapTestQuestion {
  id: string;
  prompt: string;
  code?: string;
  /** Ngôn ngữ của khối code (dùng cho nhãn / tô màu cú pháp đơn giản). */
  language?: string;
  options: RoadmapTestOption[];
  correctOptionId: string;
  skillId: string;
  tag: string;
}

export interface RoadmapTest {
  id: string;
  roadmapId: string;
  stageId: string;
  title: string;
  subtitle: string;
  durationMinutes: number;
  questions: RoadmapTestQuestion[];
}

export interface RoadmapTestResult {
  score: number;
  passed: boolean;
  correctCount: number;
  total: number;
  /** Các kỹ năng đạt chuẩn sau bài test. */
  masteredSkillIds: string[];
}
