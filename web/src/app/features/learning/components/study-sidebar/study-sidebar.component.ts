import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CourseOutlineComponent } from '../course-outline/course-outline.component';
import { LearningCourse, LearningLesson } from '../../models/learning.model';

@Component({
  selector: 'app-study-sidebar',
  standalone: true,
  imports: [CourseOutlineComponent],
  templateUrl: './study-sidebar.component.html',
})
export class StudySidebarComponent {
  @Input({ required: true }) course!: LearningCourse;
  @Input() activeLessonId = '';
  @Input() open = false;
  @Input() previewMode = false;
  @Input() openChapterIds: string[] = [];

  @Output() toggle = new EventEmitter<void>();
  @Output() lessonSelected = new EventEmitter<LearningLesson>();
  @Output() chapterToggled = new EventEmitter<string>();
}
