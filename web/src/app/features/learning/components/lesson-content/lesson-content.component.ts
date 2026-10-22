import { Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideCircleCheck, LucideLightbulb } from '@lucide/angular';
import { LearningLesson } from '../../models/learning.model';

@Component({ selector:'app-lesson-content', standalone:true, imports:[FormsModule,LucideCircleCheck,LucideLightbulb], templateUrl:'./lesson-content.component.html', styleUrls:['./lesson-content.component.css','./lesson-content-figma.component.css'] })
export class LessonContentComponent {
  readonly lesson=input.required<LearningLesson>();
  readonly completed=output<void>();
  readonly readingDone=signal(false); readonly quizStarted=signal(false); readonly quizSubmitted=signal(false);
  readonly marked=signal<Set<string>>(new Set()); readonly answers=signal<Record<string,string>>({});
  readonly answeredCount=computed(()=>Object.keys(this.answers()).length);
  readonly score=computed(()=>{const quiz=this.lesson().quiz;if(!quiz)return 0;const correct=quiz.questions.filter(q=>this.answers()[q.id]===q.correctOptionId).length;return Math.round(correct/quiz.questions.length*100)});
  readonly passed=computed(()=>this.score()>=(this.lesson().quiz?.passingScore??0));
  setAnswer(questionId:string,optionId:string):void{this.answers.update(a=>({...a,[questionId]:optionId}));}
  toggleMark(id:string):void{this.marked.update(current=>{const next=new Set(current);next.has(id)?next.delete(id):next.add(id);return next;});}
  finishReading():void{this.readingDone.set(true);this.completed.emit();}
  submitQuiz():void{this.quizSubmitted.set(true);if(this.passed())this.completed.emit();}
  resetQuiz():void{this.answers.set({});this.marked.set(new Set());this.quizSubmitted.set(false);this.quizStarted.set(true);}
}

