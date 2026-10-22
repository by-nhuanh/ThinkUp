import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { MOCK_LEARNING_COURSE } from '../../../core/data/mock/learning-player.mock';
import { LearningCourse } from '../models/learning.model';

@Injectable({ providedIn: 'root' })
export class LearningService {
  getCourse(_courseId: string): Observable<LearningCourse> {
    return of(structuredClone(MOCK_LEARNING_COURSE));
  }
}
