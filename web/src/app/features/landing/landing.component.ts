import { Component, ElementRef, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CourseService } from '../../core/services/course.service';
import { Course } from '../../core/models/course.model';
import {
  classroomFeatures,
  faqItems,
  instructors,
  skillTracks,
  stats,
  testimonials,
} from '../../core/data/mock/mock-landing-data';
import { FEATURED_COURSES, FeaturedCourseSeed } from '../../core/data/mock/mock-home';
import { CourseCardComponent } from '../../shared/components/course-card/course-card.component';
import { CourseCardView } from '../../shared/components/course-card/course-card.model';
import { formatMoney, toCourseCardView } from '../../shared/components/course-card/course-card.mapper';
import { IconComponent, IconName } from '../../shared/components/icon/icon.component';

interface LandingTool {
  label: string;
  title: string;
  desc: string;
  icon: IconName;
  tone: 'blue' | 'purple' | 'green' | 'amber' | 'teal';
  wide?: boolean;
}

const TOOL_CARDS: LandingTool[] = [
  {
    label: 'Video bài giảng',
    title: 'Video Bài Giảng',
    desc: 'Học trực quan, chia nhỏ bài',
    icon: 'play',
    tone: 'blue',
  },
  {
    label: 'Ebook & tài liệu',
    title: 'Ebook & Tài Liệu',
    desc: 'Tài liệu học tập, đọc mọi lúc',
    icon: 'book-open',
    tone: 'purple',
  },
  {
    label: 'Lab thực hành',
    title: 'Lab Thực Hành',
    desc: 'Code trực tiếp trên web, không cần cài đặt',
    icon: 'code',
    tone: 'green',
    wide: true,
  },
  {
    label: 'Trắc nghiệm',
    title: 'Trắc Nghiệm & Quiz',
    desc: 'Làm bài tập, đánh giá nắm vững',
    icon: 'file-text',
    tone: 'amber',
  },
  {
    label: 'Hỏi đáp giảng viên',
    title: 'Hỏi Đáp Với Giảng Viên',
    desc: 'Hỏi đáp, góp ý trực tiếp cùng Mentor',
    icon: 'message-circle',
    tone: 'teal',
  },
];

const TOOL_CHECKS = [
  'Học lý thuyết qua Video & Ebook.',
  'Luyện tập trực tiếp với Lab & Quiz đánh giá.',
  'Kết nối, hỏi đáp trực tiếp với Giảng Viên & Mentor.',
];

/** Chuyển dữ liệu seed (khi API không trả về khóa học) sang dữ liệu thẻ khóa học. */
function seedToCard(seed: FeaturedCourseSeed, index: number): CourseCardView {
  return {
    id: seed.id,
    coverTitle: seed.coverTitle,
    coverSubtitle: seed.coverSubtitle,
    coverSize: seed.coverSize ?? (index === 0 ? 'lg' : 'md'),
    coverGradient: seed.coverGradient,
    badge: seed.badge ?? null,
    title: seed.title,
    author: seed.author,
    level: seed.level,
    rating: seed.rating,
    reviews: seed.reviews,
    students: seed.students,
    duration: seed.duration,
    tags: seed.tags,
    price: formatMoney(seed.salePrice),
    oldPrice: formatMoney(seed.originalPrice),
    discount: seed.discount ?? '',
  };
}

@Component({
  selector: 'app-landing-view',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, CourseCardComponent, IconComponent],
  templateUrl: './landing.component.html',
  styleUrls: ['./styles/landing-ui.css', './landing.component.css'],
})
export class LandingComponent implements OnInit {
  private readonly courseService = inject(CourseService);
  private readonly router = inject(Router);

  readonly skillTracks = skillTracks;
  readonly stats = stats;
  readonly classroomFeatures = classroomFeatures;
  readonly instructors = instructors;
  readonly testimonials = testimonials;
  readonly faqItems = faqItems;
  readonly toolCards = TOOL_CARDS;
  readonly toolChecks = TOOL_CHECKS;

  readonly popularCourses = signal<Course[]>([]);
  readonly openFaq = signal<number | null>(null);

  // TODO(pre-deploy): bỏ FEATURED_COURSES khi API khóa học luôn trả đủ 4 khóa cho trang chủ khách.
  readonly popularCards = computed<CourseCardView[]>(() => {
    const courses = this.popularCourses();
    if (courses.length > 0) {
      return courses.slice(0, 4).map((course, index) => toCourseCardView(course, index));
    }
    return FEATURED_COURSES.slice(0, 4).map((seed, index) => seedToCard(seed, index));
  });

  private readonly courseTrack = viewChild<ElementRef<HTMLElement>>('courseTrack');

  ngOnInit(): void {
    this.courseService.getCourses({ sort: 'popular' }).subscribe({
      next: (res) => {
        this.popularCourses.set((res.data || []).slice(0, 4));
      },
    });
  }

  toggleFaq(index: number): void {
    this.openFaq.set(this.openFaq() === index ? null : index);
  }

  scrollCourses(direction: 1 | -1): void {
    const track = this.courseTrack()?.nativeElement;
    if (!track) return;
    track.scrollBy({ left: direction * Math.round(track.clientWidth * 0.8), behavior: 'smooth' });
  }

  /** Trang chủ khách chỉ dành cho khách nên các thao tác cần tài khoản sẽ mở trang đăng nhập. */
  requireAccount(): void {
    void this.router.navigate(['/auth/login']);
  }
}
