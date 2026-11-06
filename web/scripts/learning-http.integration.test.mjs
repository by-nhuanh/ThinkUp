// Existing Express router and handlers, actual FE service/component classes,
// isolated in-memory collections. This never connects to MongoDB or uses real accounts.
import '@angular/compiler';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnvironmentInjector, runInInjectionContext } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { from } from 'rxjs';
import express from '../../server/node_modules/express/index.js';
const {LearningService}=await import('../src/app/features/learning/services/learning.service.ts');
const {AuthService}=await import('../src/app/core/services/auth.service.ts');
const {CourseService}=await import('../src/app/core/services/course.service.ts');
const {QuizWorkspaceComponent}=await import('../src/app/features/learning/components/quiz-workspace/quiz-workspace.component.ts');
const {LabWorkspaceComponent}=await import('../src/app/features/learning/components/lab-workspace/lab-workspace.component.ts');
const {createLessonRouter}=await import('../../server/src/user/lesson/lesson.user.js');
const clone=value=>structuredClone(value);
function matches(row,query) {
  return Object.entries(query).every(([key,value])=>{
    if(key==='$or')return value.some(q=>matches(row,q));
    if(key==='$and')return value.every(q=>matches(row,q));
    if(value && typeof value==='object' && '$in' in value)return value.$in.includes(row[key]);
    return row[key]===value;
  });
}
class Collection {
  constructor(rows=[]){this.rows=clone(rows);}
  find(query={}){
    let rows=this.rows.filter(row=>matches(row,query));
    return {sort(spec){const [key,direction]=Object.entries(spec)[0];rows.sort((a,b)=>(a[key]>b[key]?1:a[key]<b[key]?-1:0)*direction);return this;},limit(n){rows=rows.slice(0,n);return this;},async toArray(){return clone(rows);}};
  }
  async findOne(query){return clone(this.rows.find(row=>matches(row,query)) || null);}
  async countDocuments(query){return this.rows.filter(row=>matches(row,query)).length;}
  async insertOne(row){this.rows.push({...clone(row),_id:row._id || crypto.randomUUID()});return {insertedId:this.rows.at(-1)._id};}
  async updateOne(query,update,options={}){
    let row=this.rows.find(r=>matches(r,query));
    if(!row && options.upsert){row={...clone(query),_id:crypto.randomUUID()};this.rows.push(row);}
    if(!row)return {matchedCount:0,modifiedCount:0};
    for(const [path,value] of Object.entries(update.$set || {})){const keys=path.split('.');let target=row;for(const key of keys.slice(0,-1))target=target[key]??=( {} );target[keys.at(-1)]=clone(value);}
    return {matchedCount:1,modifiedCount:1};
  }
}
const collections=new Map(Object.entries({
  courses:[{course_id:'c1',title:'Fixture course'}],course_sections:[{section_id:'s1',course_id:'c1'}],
  lessons:[{lesson_id:'r1',section_id:'s1',title:'Reading fixture',lesson_type:'article',is_free:'1'},
    {lesson_id:'q1',section_id:'s1',title:'Quiz fixture',lesson_type:'quiz',is_free:'1'},
    {lesson_id:'l1',section_id:'s1',title:'Lab fixture',lesson_type:'lab',is_free:'1'}],
  lesson_articles:[{lesson_id:'r1',content:'<h2>Reading fixture</h2><p>Nội dung từ kho dữ liệu thử.</p>'}],
  lesson_quizzes:[{lesson_id:'q1',lesson_quiz_id:'quiz1',time_limit:'15',pass_score:'70',description:'Fixture quiz'}],
  quiz_questions:[{lesson_quiz_id:'quiz1',quiz_question_id:'question1',question_text:'Hook nào giữ state?',question_type:'single_choice',order_index:'1'}],
  quiz_answer_options:[{question_id:'question1',quiz_answer_option_id:'answer1',option_text:'useState',is_correct:'1',order_index:'1'},
    {question_id:'question1',quiz_answer_option_id:'answer2',option_text:'useEffect',is_correct:'0',order_index:'2'}],
  lesson_labs:[{lesson_id:'l1',lesson_lab_id:'lab1',requirements:'<h3>Lab fixture</h3><p>Hoàn thiện hàm.</p>',sample_code:'function add(a,b) { return a+b; }',expected_output:'3',environment_config:'{"language":"javascript"}'}],
}).map(([key,rows])=>[key,new Collection(rows.map((row,index)=>({...row,_id:key+index})))]));
globalThis.__learningFixtureDb={collection(name){if(!collections.has(name))collections.set(name,new Collection());return collections.get(name);}};
const app=express();app.use(express.json());
app.use('/api/user/lessons',createLessonRouter(express,(req,res,next)=>{
  if(req.headers.authorization!=='Bearer isolated-fixture')return res.status(401).json({code:'AUTH_REQUIRED'});
  req.userId='fixture-user';next();
}));
app.use((error,req,res,next)=>res.status(error.status || 500).json({success:false,code:error.code,message:error.message}));
const server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
const origin='http://127.0.0.1:'+server.address().port;
const requests=[];
const http={request(method,url,{body}={}) {
  const path=new URL(url).pathname;requests.push({method,path,body});
  return from(fetch(origin+path,{method:method.toUpperCase(),headers:{Authorization:'Bearer isolated-fixture','Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})}).then(async response=>{
    const payload=await response.json();if(!response.ok)throw {status:response.status,error:payload};return payload;
  }));
},get(url){return this.request('get',url);},post(url,body){return this.request('post',url,{body});}};
const injector=createEnvironmentInjector([{provide:HttpClient,useValue:http},{provide:AuthService,useValue:{getToken:()=> 'fixture-session'}},{provide:CourseService,useValue:{}},LearningService]);
const service=injector.get(LearningService);
const readObservable=observable=>new Promise((resolve,reject)=>observable.subscribe({next:resolve,error:reject}));
async function until(predicate){for(let i=0;i<100;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,10));}throw Error('Timed out waiting for component state');}
function component(Class,id,type){const instance=runInInjectionContext(injector,()=>new Class());instance.lesson={id,type,title:'Fixture',duration:'15:00',order:1};instance.course={id:'c1',chapters:[{id:'s1',lessons:[instance.lesson]}]};return instance;}

test('HTTP: read real handler content and manual completion persists server state',async()=>{
  const content=await readObservable(service.getLessonContent('r1'));assert.equal(content.type,'reading');assert(content.reading.content_html.includes('Nội dung từ kho dữ liệu thử'));
  const result=await readObservable(service.completeLessonManual('r1'));assert.equal(result.completed,true);
  const stored=await globalThis.__learningFixtureDb.collection('user_lesson_progress').findOne({user_id:'fixture-user',lesson_id:'r1'});assert.equal(stored.is_completed,'1');
});
test('HTTP: quiz UI -> FE adapter -> mounted Express route -> actual handler -> score/progress',async()=>{
  const c=component(QuizWorkspaceComponent,'q1','quiz');c.ngOnChanges({lesson:{}});await until(()=>!c.loading);assert.equal(c.totalQuestions,1);
  await c.start();assert.equal(c.questions[0].text,'Hook nào giữ state?');assert.equal(c.questions[0].correctOptionId,undefined);
  c.selectAnswer('question1','answer1');await c.submit();assert.equal(c.resultPercent,100);assert.equal(c.passed,true);assert.equal(c.correctCount,1);
  const progress=await globalThis.__learningFixtureDb.collection('user_lesson_progress').findOne({user_id:'fixture-user',lesson_id:'q1'});assert.equal(progress.is_completed,'1');c.ngOnDestroy();
});
test('HTTP: lab sample, persisted draft, conflict, run simulation, reset and submit use backend state',async()=>{
  const c=component(LabWorkspaceComponent,'l1','lab');c.ngOnChanges({lesson:{}});await until(()=>!c.loading);assert.equal(c.code(),'function add(a,b) { return a+b; }');
  c.onCodeChange('function add(a,b) { return Number(a)+Number(b); }');c.saveDraft();await c.draftQueue;
  const started=await readObservable(service.startLabAttempt('l1'));assert.equal(started.exercise.revision,1);assert(started.exercise.source_code.includes('Number'));
  await assert.rejects(readObservable(service.saveLabDraft('l1',started.attempt_id,'1',{source_code:'stale',revision:0})),error=>error.status===409 && error.error.code==='STALE_REVISION');
  await c.execute(false);assert.equal(c.tests().length,2);assert(c.executionNotice.includes('mô phỏng'));
  await c.reset();assert.equal(c.code(),'function add(a,b) { return a+b; }');assert.equal(c.tests().length,0);
  await c.execute(true);assert.equal(c.submitted(),true);assert.equal(c.submissions.length,1);assert.equal(c.submissions[0].execTime,'124 ms');c.ngOnDestroy();
});
test('HTTP: protected route rejects absent identity; FE receives actual 404 without fixture fallback',async()=>{
  const unauthorized=await fetch(origin+'/api/user/lessons/content/r1');assert.equal(unauthorized.status,401);
  await assert.rejects(readObservable(service.getLessonContent('not-found')),error=>error.status===404);
  assert(requests.some(r=>r.path.endsWith('/quiz/attempts/'+collections.get('user_quiz_attempts').rows[0].attempt_id+'/submit')));
});
test.after(async()=>{injector.destroy();await new Promise(resolve=>server.close(resolve));delete globalThis.__learningFixtureDb;});
