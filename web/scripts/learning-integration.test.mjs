import '@angular/compiler';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnvironmentInjector, runInInjectionContext } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { of, Subject, throwError } from 'rxjs';
const {LearningService}=await import('../src/app/features/learning/services/learning.service.ts');
const {AuthService}=await import('../src/app/core/services/auth.service.ts');
const {CourseService}=await import('../src/app/core/services/course.service.ts');
const {QuizWorkspaceComponent}=await import('../src/app/features/learning/components/quiz-workspace/quiz-workspace.component.ts');
const {LabWorkspaceComponent}=await import('../src/app/features/learning/components/lab-workspace/lab-workspace.component.ts');
const {ReadingViewComponent}=await import('../src/app/features/learning/components/reading-view/reading-view.component.ts');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const lesson={id:'1792',title:'Hooks',type:'quiz',duration:'15:00',order:1};
const attempt={attempt_id:'attempt-1',lesson_id:'1792',status:'in_progress',revision:0,remaining_seconds:900,expires_at:new Date(Date.now()+900000).toISOString(),answers:{},flagged_question_ids:[],questions:[{id:'q1',text:'Hook?',type:'single_choice',options:[{id:'o1',text:'useState'},{id:'o2',text:'useEffect'}]}]};
const overview={lesson_quiz_id:'183',title:'Hooks',description:'Kiểm tra Hooks',total_questions:1,time_limit_minutes:15,pass_score_percent:70,total_attempts:0,best_score_percent:0,running_attempt:null};
function component(Class, service) {
  const injector=createEnvironmentInjector([{provide:LearningService,useValue:service}]);
  const instance=runInInjectionContext(injector,()=>new Class());
  instance.lesson={...lesson};instance.course={id:'89',chapters:[{id:'s',lessons:[instance.lesson]}]};instance.chapter=instance.course.chapters[0];
  return instance;
}
const quizBase={getQuizOverview:()=>of(overview),startQuizAttempt:()=>of(attempt),mapQuizAttempt:LearningService.prototype.mapQuizAttempt};
const labContent={id:'14',title:'Router',type:'lab',lab:{sample_code:'const sample = 1;',requirements:'<p>Thực hành</p>',expected_output:'Kết quả',environment_config:{language:'javascript'}}};
const labAttempt={attempt_id:'lab-1',lesson_id:'14',exercise:{source_code:'const draft = 2;',revision:3,test_results:[]}};
const labRun={run_id:'run-1',revision:5,passed:true,execution_ms:124,execution_mode:'simulation',is_simulated:true,test_results:[{id:'t1',name:'Ví dụ',actual:'ok',expected_output:'ok',passed:true}]};
const labBase={getLessonContent:()=>of(labContent),startLabAttempt:()=>of(labAttempt),mapLabContent:LearningService.prototype.mapLabContent,mapLabInstructions:LearningService.prototype.mapLabInstructions,mapLabTests:LearningService.prototype.mapLabTests};

test('progress refresh uses lesson content status without inventing course aggregate',()=>{
  const course={chapters:[{lessons:[{id:'14',completed:false,status:'not-started'},{id:'15',completed:false}]}],progress:{percent:0}};
  const service={getCourse:()=>of(course),getLessonContent:()=>of({status:'done'})};
  LearningService.prototype.refreshLessonProgress.call(service,'c','14').subscribe(updated=>{
    assert.equal(updated.chapters[0].lessons[0].completed,true);
    assert.equal(updated.chapters[0].lessons[1].completed,false);
    assert.equal(updated.progress.percent,0);
    assert.equal(course.chapters[0].lessons[0].completed,false);
  });
});

test('API adapter sends mounted paths, exact payload, propagates failed envelope and changed session',async()=>{
  let token='a';const calls=[];let response=of({success:true,data:{revision:1,saved:true}});
  const http={request:(method,url,options)=>{calls.push({method,url,...options});return response;}};
  const injector=createEnvironmentInjector([{provide:HttpClient,useValue:http},{provide:AuthService,useValue:{getToken:()=>token}},{provide:CourseService,useValue:{}},LearningService]);
  const service=injector.get(LearningService);
  await new Promise((resolve,reject)=>service.saveQuizAnswers('a/b',{answers:{q1:'o1'},flagged_question_ids:[],revision:0}).subscribe({next:resolve,error:reject}));
  assert.equal(calls[0].method,'put');assert.equal(calls[0].url,'http://localhost:5000/api/user/lessons/quiz/attempts/a%2Fb/answers');
  assert.deepEqual(calls[0].body,{answers:{q1:'o1'},flagged_question_ids:[],revision:0});
  response=of({success:false});let failed=false;service.startLabAttempt('14').subscribe({error:()=>failed=true});assert.equal(failed,true);
  const pending=new Subject();response=pending;failed=false;service.startQuizAttempt('1792').subscribe({error:()=>failed=true});token='b';pending.next({success:true,data:attempt});assert.equal(failed,true);
  injector.destroy();
});

test('quiz loads overview, resumes saved answers and does not expose correct options',async()=>{
  const c=component(QuizWorkspaceComponent,{...quizBase,startQuizAttempt:()=>of({...attempt,answers:{q1:'o2'},flagged_question_ids:['q1'],revision:4,remaining_seconds:25})});
  c.ngOnChanges({lesson:{}});await tick();assert.equal(c.totalQuestions,1);assert.equal(c.quiz.timeLimit,15);
  await c.start();assert.equal(c.phase,'running');assert.equal(c.answers.q1,'o2');assert.equal(c.secondsLeft,25);assert(c.flagged.has('q1'));assert.equal(c.questions[0].correctOptionId,undefined);c.ngOnDestroy();
});

test('quiz serializes revisions, waits for saves, takes score and completion only from server',async()=>{
  const calls=[];const first=new Subject();let saves=0;
  const c=component(QuizWorkspaceComponent,{...quizBase,saveQuizAnswers:(id,payload)=>{calls.push(payload);return ++saves===1?first:of({revision:2,saved:true});},submitQuizAttempt:()=>{calls.push('submit');return of({score_percent:0,correct_count:0,wrong_count:1,unanswered_count:0,passed:false});}});
  let completed=0;c.completed.subscribe(()=>completed++);c.ngOnChanges({lesson:{}});await tick();await c.start();
  c.selectAnswer('q1','o1');c.selectAnswer('q1','o2');const submission=c.submit();await tick();assert.equal(calls.length,1);assert.equal(calls[0].revision,0);
  first.next({revision:1,saved:true});first.complete();await submission;
  assert.equal(calls[1].revision,1);assert.equal(calls[1].answers.q1,'o2');assert.equal(calls[2],'submit');assert.equal(c.resultPercent,0);assert.equal(c.passed,false);assert.equal(completed,0);c.ngOnDestroy();
});

test('quiz failed save cannot become fake successful submission',async()=>{
  let submissions=0;const c=component(QuizWorkspaceComponent,{...quizBase,saveQuizAnswers:()=>throwError(()=>({status:500})),submitQuizAttempt:()=>{submissions++;return of({passed:true});}});
  c.ngOnChanges({lesson:{}});await tick();await c.start();c.selectAnswer('q1','o1');await c.submit();assert.equal(submissions,0);assert.equal(c.phase,'running');assert(c.errorMessage);c.ngOnDestroy();
});

test('reading cancels previous request and clears old content on lesson switch and error',()=>{
  const old=new Subject(),next=new Subject();const c=component(ReadingViewComponent,{getLessonContent:id=>id==='1792'?old:next});
  c.ngOnInit();c.contentHtml.set('old');c.lesson={...lesson,id:'26'};c.ngOnChanges({lesson:{firstChange:false}});assert.equal(c.contentHtml(),'');
  old.next({reading:{content_html:'stale'}});assert.equal(c.contentHtml(),'');next.error({status:403});assert(c.loadError());assert.equal(c.loading(),false);c.ngOnDestroy();
});

test('lab maps real sample, restores server draft and reset uses current revision',async()=>{
  let payload;const c=component(LabWorkspaceComponent,{...labBase,resetLabExercise:(lesson,id,exercise,revision)=>{payload={lesson,id,exercise,revision};return of({source_code:'const sample = 1;',revision:4});}});
  c.ngOnChanges({lesson:{}});await tick();assert.equal(c.code(),'const draft = 2;');assert.equal(c.lab.starterCode,'const sample = 1;');assert.deepEqual(c.lab.instructions[0].paragraphs,['Thực hành']);
  await c.reset();assert.deepEqual(payload,{lesson:'1792',id:'lab-1',exercise:'1',revision:3});assert.equal(c.code(),'const sample = 1;');assert.equal(c.tests().length,0);c.ngOnDestroy();
});

test('lab saves draft then runs with updated revision; simulation and actual server duration remain visible',async()=>{
  const calls=[];const c=component(LabWorkspaceComponent,{...labBase,saveLabDraft:(lesson,id,exercise,payload)=>{calls.push(['save',payload]);return of({revision:4,saved:true});},runLabExercise:(lesson,id,exercise,payload)=>{calls.push(['run',payload]);return of(labRun);},submitLabAttempt:()=>of({passed:true,status:'submitted',submitted_at:'2026-11-04T00:00:00Z'})});
  c.ngOnChanges({lesson:{}});await tick();c.onCodeChange('const answer = 3;');c.saveDraft();await c.execute(true);
  assert.equal(calls[0][1].revision,3);assert.equal(calls[1][1].revision,4);assert.equal(calls[1][1].source_code,'const answer = 3;');assert(c.executionNotice.includes('mô phỏng'));assert.equal(c.submitted(),true);assert.equal(c.submissions[0].execTime,'124 ms');assert.equal(c.tests()[0].actual,'ok');c.ngOnDestroy();
});

test('lab failed request preserves code and does not emit completion or fake tests',async()=>{
  const c=component(LabWorkspaceComponent,{...labBase,runLabExercise:()=>throwError(()=>({status:503}))});let completed=0;c.completed.subscribe(()=>completed++);
  c.ngOnChanges({lesson:{}});await tick();await c.execute(true);assert.equal(completed,0);assert.equal(c.tests().length,0);assert.equal(c.code(),'const draft = 2;');assert(c.errorMessage);c.ngOnDestroy();
});

test('late quiz/lab responses cannot overwrite a newly selected lesson',async()=>{
  const late=new Subject();const c=component(QuizWorkspaceComponent,{...quizBase,getQuizOverview:id=>id==='1792'?late:of({...overview,title:'New',total_questions:2})});
  c.ngOnChanges({lesson:{}});c.lesson={...lesson,id:'1845'};c.ngOnChanges({lesson:{}});await tick();late.next(overview);late.complete();await tick();assert.equal(c.totalQuestions,2);c.ngOnDestroy();
});
