import { Course } from '../../../core/models/course.model';

export interface CourseCardBadge {
  text: string;
  tone: 'sale' | 'new' | 'hot';
}

/**
 * Dữ liệu hiển thị cho một thẻ khóa học.
 * Dùng chung cho trang chủ khách (`landing`) và trang chủ thành viên (`home`)
 * vì hai màn dùng chung đúng một component thẻ trong Figma.
 */
export interface CourseCardView {
  id: string;
  coverTitle: string;
  coverSubtitle: string;
  coverSize: 'lg' | 'md';
  coverGradient: string;
  badge: CourseCardBadge | null;
  title: string;
  author: string;
  level: string;
  rating: string;
  reviews: string;
  students: string;
  duration: string;
  tags: string[];
  price: string;
  oldPrice: string;
  discount: string;
  /** Bản ghi gốc, dùng cho các thao tác cần API (yêu thích, giỏ hàng). */
  course?: Course;
}
