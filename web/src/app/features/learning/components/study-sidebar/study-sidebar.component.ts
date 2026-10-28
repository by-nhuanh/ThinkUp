import { Component, EventEmitter, Input, Output } from '@angular/core';
import {
  LucideCheck,
  LucideChevronDown,
  LucideCircle,
  LucideCircleAlert,
  LucideCirclePlay,
  LucideCircleQuestionMark,
  LucideCode2,
  LucideFileText,
  LucidePanelLeft,
} from '@lucide/angular';
import { LearningChapter, LearningCourse, LearningLesson } from '../../models/learning.model';

@Component({
  selector: 'app-study-sidebar',
  standalone: true,
  imports: [
    LucideCheck,
    LucideChevronDown,
    LucideCircle,
    LucideCircleAlert,
    LucideCirclePlay,
    LucideCircleQuestionMark,
    LucideCode2,
    LucideFileText,
    LucidePanelLeft,
  ],
  templateUrl: './study-sidebar.component.html',
})
export class StudySidebarComponent {
  @Input({ required: true }) course!: LearningCourse;
  @Input() activeLessonId = '';
  @Input() open = false;
  @Input() openChapterIds: string[] = [];

  @Output() toggle = new EventEmitter<void>();
  @Output() lessonSelected = new EventEmitter<LearningLesson>();
  @Output() chapterToggled = new EventEmitter<string>();

  get progress(): number {
    const lessons = this.course.chapters.flatMap((chapter) => chapter.lessons);
    const done = lessons.filter((lesson) => lesson.completed).length;
    return lessons.length ? Math.round((done / lessons.length) * 100) : 0;
  }

  isOpen(chapter: LearningChapter): boolean {
    return this.openChapterIds.includes(chapter.id);
  }

  lessonStatus(lesson: LearningLesson): 'done' | 'failed' | 'todo' {
    if (lesson.completed) return 'done';
    if (lesson.status === 'failed') return 'failed';
    return 'todo';
  }
}
