import { Component, Input, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { CurrentCourse } from '../../../../../core/models/profile.model';
import { InstructorTriggerDirective } from '../../../../../shared/directives/instructor-trigger.directive';

type CourseTab = 'active' | 'completed';

@Component({
  selector: 'app-current-courses-card',
  standalone: true,
  imports: [CommonModule, RouterLink, InstructorTriggerDirective],
  templateUrl: './current-courses-card.component.html',
  styleUrl: './current-courses-card.component.css'
})
export class CurrentCoursesCardComponent {
  @Input() courses: CurrentCourse[] = [];
  @Input() completedCourses: CurrentCourse[] = [];
  @Input() totalCompleted = 0;

  readonly activeTab = signal<CourseTab>('active');

  readonly visibleCourses = computed(() =>
    this.activeTab() === 'active' ? this.courses : this.completedCourses
  );

  selectTab(tab: CourseTab): void {
    this.activeTab.set(tab);
  }
}
