import { Component, computed, input, output, signal } from '@angular/core';
import { AdminDialogComponent } from '../../../../shared/components/admin-dialog/admin-dialog.component';
import { Course } from '../../models/course.models';
import {
  COURSE_STATUS_LABELS, COURSE_STATUS_TONE, formatCurrency, formatDate, formatDateTime, formatNumber, LEVEL_TONE
} from '../../course-utils';

type DetailTab = 'overview' | 'content' | 'learners' | 'finance';

@Component({
  selector: 'app-course-detail-dialog',
  standalone: true,
  imports: [AdminDialogComponent],
  templateUrl: './course-detail-dialog.component.html',
  styleUrl: '../../courses-page.css'
})
export class CourseDetailDialogComponent {
  readonly course = input.required<Course>();
  readonly closed = output<void>();

  readonly tab = signal<DetailTab>('overview');
  readonly tabs: Array<{ id: DetailTab; label: string }> = [
    { id: 'overview', label: 'Tổng quan' },
    { id: 'content', label: 'Nội dung học' },
    { id: 'learners', label: 'Học viên' },
    { id: 'finance', label: 'Đối soát tài chính' }
  ];

  readonly statusLabel = computed(() => COURSE_STATUS_LABELS[this.course().status]);
  readonly statusTone = computed(() => COURSE_STATUS_TONE[this.course().status]);
  readonly levelTone = computed(() => LEVEL_TONE[this.course().level]);
  readonly learners = computed(() => this.course().learners);

  setTab(id: DetailTab): void {
    this.tab.set(id);
  }

  close(): void {
    this.closed.emit();
  }

  money = formatCurrency;
  number = formatNumber;
  date = formatDate;
  dateTime = formatDateTime;
}
