import { Component, computed, input, output } from '@angular/core';
import { AdminDialogComponent } from '../../../../shared/components/admin-dialog/admin-dialog.component';
import { ContentReview, ReviewLearningProgress } from '../../models/content.models';
import { formatDateTime } from '../../content-utils';

@Component({
  selector: 'app-review-learning-dialog', standalone: true, imports: [AdminDialogComponent],
  templateUrl: './review-learning-dialog.component.html', styleUrl: './review-learning-dialog.component.css'
})
export class ReviewLearningDialogComponent {
  readonly review = input.required<ContentReview>();
  readonly closed = output<void>();
  readonly viewReview = output<void>();
  readonly metrics = computed(() => {
    const progress = this.review().learningProgress;
    const activities = progress?.chapters.flatMap(chapter => chapter.activities) ?? [];
    const quizzes = activities.filter(item => item.kind === 'quiz');
    const labs = activities.filter(item => item.kind === 'lab');
    return { quizzes: quizzes.length, quizzesDone: quizzes.filter(item => item.progress === 100).length,
      labs: labs.length, labsDone: labs.filter(item => item.progress === 100).length };
  });
  chapterProgress(chapter: ReviewLearningProgress['chapters'][number]): number {
    return chapter.activities.length ? Math.round(chapter.activities.reduce((sum, activity) => sum + activity.progress, 0) / chapter.activities.length) : 0;
  }
  readonly dateTime = formatDateTime;
}
