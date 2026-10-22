import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { LucideBookOpen, LucideBookOpenText, LucideBookmark, LucideChevronDown, LucideChevronLeft, LucideChevronRight, LucideCircle, LucideCircleCheck, LucideCirclePlay, LucideCircleQuestionMark, LucidePanelLeftClose, LucidePanelLeftOpen } from '@lucide/angular';
import { combineLatest } from 'rxjs';
import { MOCK_DISCUSSION_POSTS, MOCK_QA_POSTS } from '../../../core/data/mock/learning-player.mock';
import { CommunityPanelComponent } from '../components/community-panel/community-panel.component';
import { LessonContentComponent } from '../components/lesson-content/lesson-content.component';
import { LearningCourse, LearningLesson } from '../models/learning.model';
import { LearningService } from '../services/learning.service';

type InfoTab='overview'|'resources'|'qa'|'discussion';
@Component({ selector:'app-lesson-player', standalone:true, imports:[LessonContentComponent,CommunityPanelComponent,LucideBookOpen,LucideBookOpenText,LucideBookmark,LucideChevronDown,LucideChevronLeft,LucideChevronRight,LucideCircle,LucideCircleCheck,LucideCirclePlay,LucideCircleQuestionMark,LucidePanelLeftClose,LucidePanelLeftOpen], templateUrl:'./lesson-player.component.html', styleUrls:['./lesson-player.component.css','./lesson-sidebar.component.css'] })
export class LessonPlayerComponent {
  private readonly route=inject(ActivatedRoute); private readonly router=inject(Router); private readonly service=inject(LearningService);
  readonly course=signal<LearningCourse|null>(null); readonly selectedId=signal(''); readonly sidebarOpen=signal(true); readonly openChapters=signal<Set<string>>(new Set()); readonly activeTab=signal<InfoTab>('overview'); readonly bookmarked=signal(false); readonly completedIds=signal<Set<string>>(new Set()); readonly status=signal<'loading'|'success'|'error'>('loading');
  readonly quizActive=signal(false);
  readonly qaPosts=MOCK_QA_POSTS; readonly discussionPosts=MOCK_DISCUSSION_POSTS;
  readonly lessons=computed(()=>this.course()?.chapters.flatMap(chapter=>chapter.lessons)??[]);
  readonly lesson=computed(()=>this.lessons().find(item=>item.id===this.selectedId())??this.lessons()[0]??null);
  readonly currentIndex=computed(()=>this.lessons().findIndex(item=>item.id===this.lesson()?.id));
  readonly previous=computed(()=>this.lessons()[this.currentIndex()-1]??null); readonly next=computed(()=>this.lessons()[this.currentIndex()+1]??null);
  readonly completedCount=computed(()=>this.completedIds().size); readonly progress=computed(()=>this.lessons().length?Math.round(this.completedCount()/this.lessons().length*100):0);
  constructor(){combineLatest([this.route.paramMap,this.route.queryParamMap]).subscribe(([params,query])=>{const id=params.get('courseId')??'responsive-web-design';this.selectedId.set(query.get('lesson')??'');this.service.getCourse(id).subscribe({next:course=>{this.course.set(course);this.openChapters.set(new Set(course.chapters.map(c=>c.id)));this.completedIds.set(new Set(course.chapters.flatMap(c=>c.lessons).filter(l=>l.completed).map(l=>l.id)));this.status.set('success');},error:()=>this.status.set('error')});});}
  chooseLesson(lesson:LearningLesson):void{this.router.navigate([],{relativeTo:this.route,queryParams:{lesson:lesson.id},queryParamsHandling:'merge'});this.activeTab.set('overview');window.scrollTo({top:0,behavior:'smooth'});}
  toggleChapter(id:string):void{this.openChapters.update(current=>{const next=new Set(current);next.has(id)?next.delete(id):next.add(id);return next;});}
  markComplete():void{const id=this.lesson()?.id;if(id)this.completedIds.update(current=>new Set(current).add(id));}
  goTo(target:LearningLesson|null):void{if(target)this.chooseLesson(target);}
  typeLabel(type:string):string{return ({video:'Video',reading:'Bài đọc',quiz:'Quiz'}[type]??type);}
  canDeactivate():boolean{return !this.quizActive()||window.confirm('Bài quiz đang làm chưa được nộp. Bạn có chắc muốn rời trang?');}
}

