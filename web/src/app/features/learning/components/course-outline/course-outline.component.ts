import { Component, EventEmitter, Input, Output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LearningChapter, LearningCourse, LearningLesson } from '../../models/learning.model';

export type CourseOutlineVariant = 'default' | 'lab';

@Component({
  selector: 'app-course-outline',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './course-outline.component.html',
  styleUrls: ['./course-outline.component.css'],
})
export class CourseOutlineComponent {
  @Input({ required: true }) course!: LearningCourse;
  @Input() activeLessonId = '';
  @Input() openChapterIds: string[] = [];
  @Input() variant: CourseOutlineVariant = 'default';
  @Input() previewMode = false;

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

  isLocked(chapter: LearningChapter, index: number): boolean {
    return this.previewMode && index > 0 && !chapter.lessons.some((lesson) => lesson.id === this.activeLessonId);
  }

  toggleChapter(chapter: LearningChapter, index: number): void {
    if (this.isLocked(chapter, index)) return;
    this.chapterToggled.emit(chapter.id);
  }

  lessonStatus(lesson: LearningLesson): 'done' | 'failed' | 'todo' {
    if (lesson.completed) return 'done';
    if (lesson.status === 'failed') return 'failed';
    return 'todo';
  }
}
