import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { MOCK_QUIZ_ANSWER_KEYS } from '../../../core/data/mock/quiz-answer-key.mock';
import { QuizResult } from '../models/learning.model';

@Injectable({ providedIn: 'root' })
export class QuizAttemptService {
  submit(quizId: string, answers: Record<string, string>, questionIds: string[], passingScore: number): Observable<QuizResult> {
    // TODO(pre-deploy): Nhớ thay mock grader bằng POST Quiz API; frontend không được nhận khóa đáp án production.
    const key = MOCK_QUIZ_ANSWER_KEYS[quizId] ?? {};
    const correctCount = questionIds.filter(id => answers[id] === key[id]).length;
    const score = questionIds.length ? Math.round(correctCount / questionIds.length * 100) : 0;
    return of({ score, correctCount, incorrectCount: questionIds.length - correctCount, passed: score >= passingScore });
  }
}
