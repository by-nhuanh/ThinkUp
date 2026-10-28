import { Component, OnDestroy, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  LucideBookOpen,
  LucideCheck,
  LucideCircleAlert,
  LucideGlobe,
  LucideInfo,
  LucideLightbulb,
  LucideStar,
  LucideX,
} from '@lucide/angular';
import { Subscription } from 'rxjs';
import { LearningCourse } from '../../learning/models/learning.model';
import { LearningService } from '../../learning/services/learning.service';

type SubmitState = 'idle' | 'submitting' | 'success' | 'error';

@Component({
  selector: 'app-review-form',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    LucideBookOpen,
    LucideCheck,
    LucideCircleAlert,
    LucideGlobe,
    LucideInfo,
    LucideLightbulb,
    LucideStar,
    LucideX,
  ],
  templateUrl: './review-form.component.html',
})
export class ReviewFormComponent implements OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly learningService = inject(LearningService);

  readonly course = signal<LearningCourse | null>(null);
  readonly submitState = signal<SubmitState>('idle');
  readonly errorMessage = signal('');

  rating = 0;
  hoverRating = 0;
  comment = '';
  nps = 9;
  selectedTags = new Set<string>();
  formError = '';
  private forceFailure = false;

  readonly tags = [
    { id: 'content', label: 'Nội dung dễ hiểu, thực tế' },
    { id: 'instructor', label: 'Giảng viên nhiệt tình, dễ hiểu' },
    { id: 'exercise', label: 'Bài tập thực hành hữu ích' },
    { id: 'materials', label: 'Tài liệu học tập chất lượng' },
    { id: 'support', label: 'Hỗ trợ học viên nhanh chóng' },
    { id: 'other', label: 'Khác' },
  ];

  readonly ratingLabels: Record<number, string> = {
    1: 'Rất tệ',
    2: 'Tệ',
    3: 'Bình thường',
    4: 'Tốt',
    5: 'Rất tốt',
  };

  private readonly subscriptions = new Subscription();

  constructor() {
    this.subscriptions.add(
      this.route.paramMap.subscribe((params) => {
        const courseId = params.get('courseId') ?? 'python-co-ban';
        this.subscriptions.add(
          this.learningService.getCourse(courseId).subscribe((course) => this.course.set(course))
        );
      })
    );
    this.subscriptions.add(
      this.route.queryParamMap.subscribe((params) => {
        this.forceFailure = params.get('simulate') === 'fail';
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  get ratingLabel(): string {
    return this.ratingLabels[this.hoverRating || this.rating] ?? 'Chọn số sao';
  }

  get progress(): number {
    const lessons = this.course()?.chapters.flatMap((chapter) => chapter.lessons) ?? [];
    const done = lessons.filter((lesson) => lesson.completed).length;
    return lessons.length ? Math.round((done / lessons.length) * 100) : 0;
  }

  setRating(value: number): void {
    this.rating = value;
    this.formError = '';
  }

  toggleTag(id: string): void {
    if (this.selectedTags.has(id)) this.selectedTags.delete(id);
    else this.selectedTags.add(id);
  }

  isTagSelected(id: string): boolean {
    return this.selectedTags.has(id);
  }

  submit(): void {
    if (this.rating === 0) {
      this.formError = 'Vui lòng chọn số sao đánh giá.';
      return;
    }
    this.formError = '';
    this.submitState.set('submitting');

    this.learningService
      .submitReview({
        courseId: this.course()?.id ?? '',
        rating: this.rating,
        tags: [...this.selectedTags],
        comment: this.comment.trim(),
        nps: this.nps,
      })
      .subscribe((result) => {
        if (this.forceFailure || !result.success) {
          this.submitState.set('error');
          this.errorMessage.set(
            this.forceFailure
              ? 'Không thể gửi đánh giá. Vui lòng kiểm tra kết nối và thử lại sau.'
              : result.message || 'Đã xảy ra lỗi trong quá trình gửi đánh giá.'
          );
        } else {
          this.submitState.set('success');
        }
      });
  }

  closeError(): void {
    this.submitState.set('idle');
  }

  retry(): void {
    this.submitState.set('idle');
    this.submit();
  }

  goToDashboard(): void {
    const courseId = this.course()?.id ?? 'python-co-ban';
    void this.router.navigate(['/main/my-courses', courseId]);
  }
}
