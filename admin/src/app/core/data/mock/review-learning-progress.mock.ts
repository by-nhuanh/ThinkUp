import { ReviewLearningProgress } from '../../../features/content/models/content.models';

// TODO(pre-deploy): Nhớ xóa dữ liệu tiến độ minh họa và thay bằng adapter tiến độ học tập đã xác minh từ API.
export function mockReviewLearningProgress(completion: number, course: string): ReviewLearningProgress {
  const titles = course.includes('Python')
    ? ['Biến, kiểu dữ liệu và toán tử cơ bản', 'Cấu trúc điều khiển và vòng lặp', 'Hàm và lập trình hướng đối tượng']
    : ['Tổng quan và kiến thức nền tảng', 'Kiến thức chuyên môn', 'Thực hành và tổng kết'];
  const chapters: ReviewLearningProgress['chapters'] = titles.map((title, index) => ({
    id: `chapter-${index + 1}`, title,
    activities: [
      ...Array.from({ length: 3 }, (_, lesson) => ({ id: `${index}-lesson-${lesson}`, title: ['Giới thiệu nội dung', 'Kiến thức và ví dụ', 'Ứng dụng thực tế'][lesson], kind: 'lesson' as const, progress: 0 })),
      { id: `${index}-quiz`, title: `Quiz ${index + 1}: Kiểm tra kiến thức`, kind: 'quiz' as const, progress: 0 },
      { id: `${index}-lab`, title: `Lab ${index + 1}: Thực hành`, kind: 'lab' as const, progress: 0 },
      ...(index === 2 ? [{ id: 'final-lab', title: 'Lab 4: Bài tập tổng hợp', kind: 'lab' as const, progress: 0 }] : [])
    ]
  }));
  const activities = chapters.flatMap(chapter => chapter.activities);
  const budget = completion / 100 * activities.length;
  activities.forEach((activity, index) => {
    activity.progress = Math.round(Math.min(1, Math.max(0, budget - index)) * 100);
    if (activity.kind === 'quiz' && activity.progress === 100) activity.score = 82 + index % 3 * 4;
  });
  const scores = activities.flatMap(activity => activity.score === undefined ? [] : [activity.score]);
  return { studiedHours: Math.round(22 * completion / 100 * 10) / 10, totalHours: 22,
    quizAverage: scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : null, chapters };
}
