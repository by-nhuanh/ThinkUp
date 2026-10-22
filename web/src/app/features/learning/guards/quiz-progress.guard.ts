import { CanDeactivateFn } from '@angular/router';
import { LessonPlayerComponent } from '../lesson-player/lesson-player.component';

export const quizProgressGuard: CanDeactivateFn<LessonPlayerComponent> = component => component.canDeactivate();
