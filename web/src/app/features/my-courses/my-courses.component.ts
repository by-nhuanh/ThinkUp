import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CourseService } from '../../core/services/course.service';
import { EnrolledCourse } from '../../core/models/course.model';
import { InstructorTriggerDirective } from '../../shared/directives/instructor-trigger.directive';

interface FilterTab {
  value: 'all' | 'learning' | 'completed';
  label: string;
}

@Component({
  selector: 'app-my-courses',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, InstructorTriggerDirective],
  templateUrl: './my-courses.component.html',
  styleUrl: './my-courses.component.css'
})
export class MyCoursesComponent implements OnInit {
  private readonly courseService = inject(CourseService);

  readonly courses = signal<EnrolledCourse[]>([]);
  readonly currentFilter = signal<'all' | 'learning' | 'completed'>('all');
  readonly searchQuery = signal<string>('');
  readonly status = signal<'loading' | 'success' | 'error'>('loading');

  searchInput = '';

  readonly filterTabs: FilterTab[] = [
    { value: 'all', label: 'Tất cả' },
    { value: 'learning', label: 'Đang học' },
    { value: 'completed', label: 'Đã hoàn thành' }
  ];

  readonly visibleCourses = computed(() => {
    const all = this.courses();
    const filter = this.currentFilter();
    const query = this.searchQuery().trim().toLowerCase();

    return all.filter((course) => {
      const progress = course.totalLessons > 0 ? course.completedLessons / course.totalLessons : 0;
      const matchesStatus =
        filter === 'all' ||
        (filter === 'completed' ? progress === 1 : progress > 0 && progress < 1);

      const matchesQuery =
        !query ||
        course.title.toLowerCase().includes(query) ||
        course.instructor.toLowerCase().includes(query);

      return matchesStatus && matchesQuery;
    });
  });

  readonly stats = computed(() => {
    const list = this.courses();
    let inProgress = 0;
    let completedLessons = 0;
    let totalLessons = 0;

    for (const c of list) {
      if (c.completedLessons > 0 && c.completedLessons < c.totalLessons) {
        inProgress++;
      }
      completedLessons += c.completedLessons || 0;
      totalLessons += c.totalLessons || 0;
    }

    const progress = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;
    return { inProgress, completedLessons, totalLessons, progress };
  });

  ngOnInit(): void {
    this.fetchCourses();
  }

  fetchCourses(): void {
    this.status.set('loading');
    this.courseService.getMyCourses().subscribe({
      next: (res) => {
        this.courses.set(res.data || []);
        this.status.set('success');
      },
      error: () => {
        this.status.set('error');
      }
    });
  }

  setFilter(filter: 'all' | 'learning' | 'completed'): void {
    this.currentFilter.set(filter);
  }

  applySearch(): void {
    this.searchQuery.set(this.searchInput);
  }

  resetFilterAndSearch(): void {
    this.searchInput = '';
    this.searchQuery.set('');
    this.currentFilter.set('all');
  }

  getCoursePercent(course: EnrolledCourse): number {
    if (!course.totalLessons) return 0;
    return Math.round((course.completedLessons / course.totalLessons) * 100);
  }
}
