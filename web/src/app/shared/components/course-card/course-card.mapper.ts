import { Course } from '../../../core/models/course.model';
import { CourseCardBadge, CourseCardView } from './course-card.model';

const COVER_GRADIENTS = [
  'linear-gradient(164deg, #0092b8 0%, #005f78 100%)',
  'linear-gradient(164deg, #0a1535 0%, #1a2a5e 100%)',
  'linear-gradient(164deg, #2a1560 0%, #4a2590 100%)',
  'linear-gradient(164deg, #0a1628 0%, #0f2a44 100%)',
  'linear-gradient(159deg, #4c1d95 0%, #6d28d9 100%)',
];

const BADGE_TONES: CourseCardBadge['tone'][] = ['sale', 'new', 'hot'];

export function formatMoney(value: number): string {
  return `${new Intl.NumberFormat('vi-VN').format(value || 0)}đ`;
}

/** Chuyển một `Course` từ API sang dữ liệu hiển thị của thẻ khóa học. */
export function toCourseCardView(course: Course, index: number): CourseCardView {
  const salePrice = course.salePrice ?? 0;
  const originalPrice = course.originalPrice ?? 0;
  const discount = originalPrice > salePrice && salePrice > 0
    ? `-${Math.round(((originalPrice - salePrice) / originalPrice) * 100)}%`
    : '';
  const badgeText = course.badge;

  return {
    id: course.id,
    coverTitle: course.shortLabel || course.displayTitle || course.title,
    coverSubtitle: course.category || '',
    coverSize: index === 0 ? 'lg' : 'md',
    coverGradient: course.bgGradient || COVER_GRADIENTS[index % COVER_GRADIENTS.length],
    badge: badgeText
      ? { text: badgeText, tone: BADGE_TONES[index % BADGE_TONES.length] }
      : null,
    title: course.displayTitle || course.title,
    author: course.instructor,
    level: course.level || 'Cơ bản',
    rating: (course.rating ?? 0).toFixed(1),
    reviews: `(${course.ratingCount ?? 0})`,
    students: course.students || `${new Intl.NumberFormat('vi-VN').format(course.studentsCount ?? 0)} học viên`,
    duration: course.duration || '—',
    tags: (course.tags ?? []).slice(0, 3),
    price: formatMoney(salePrice),
    oldPrice: formatMoney(originalPrice),
    discount,
    course,
  };
}
