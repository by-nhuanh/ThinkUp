import { Component, input, output, signal } from '@angular/core';
import { LucideCircleCheck, LucideLightbulb } from '@lucide/angular';
import { LearningLesson } from '../../models/learning.model';
import { LessonQuizPlayerComponent } from '../lesson-quiz-player/lesson-quiz-player.component';
import { LessonVideoPlayerComponent } from '../lesson-video-player/lesson-video-player.component';

@Component({
  selector: 'app-lesson-content',
  standalone: true,
  imports: [LessonQuizPlayerComponent, LessonVideoPlayerComponent, LucideCircleCheck, LucideLightbulb],
  templateUrl: './lesson-content.component.html',
  styleUrls: ['./lesson-content.component.css', './lesson-content-figma.component.css']
})
export class LessonContentComponent {
  readonly lesson = input.required<LearningLesson>();
  readonly completed = output<void>();
  readonly nextRequested = output<void>();
  readonly quizActiveChange = output<boolean>();
  readonly readingDone = signal(false);

  finishReading(): void {
    this.readingDone.set(true);
    this.completed.emit();
  }
}
