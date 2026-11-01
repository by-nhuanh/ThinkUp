import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { ObjectId } from 'mongodb';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import {
  registerUser, resendVerificationLink, verifyEmailVerificationToken, validatePassword,
  registerWithGoogle, registerWithFacebook, verifyGoogleIdentity, verifyFacebookIdentity,
  credentialVersion, limitAuthRequests, deliverAuthEmail,
} from '../signup.user.js';
import { sendForgotPasswordOtp, verifyForgotPasswordOtp, resetPasswordWithToken, generateOtp } from '../forgot-password.user.js';
import { loginWithCredentials, loginWithGoogle, verifyAuthSession } from '../signin.user.js';
import { verifyJwt, signJwt } from '../../db.js';

// Implements only the MongoDB operations used by this feature. Every mutation is atomic before resolving.
// Results are detached snapshots, so concurrent tests cannot accidentally rely on shared object references.
function memoryDb() {
  const tables = new Map();
  const copy = value => {
    if (value instanceof ObjectId) return new ObjectId(value.toString());
    if (value instanceof Date) return new Date(value);
    if (Array.isArray(value)) return value.map(copy);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) => [k,copy(v)]));
    return value;
  };
  const eq = (a,b) => a instanceof ObjectId || b instanceof ObjectId ? String(a) === String(b)
    : a instanceof Date || b instanceof Date ? new Date(a).getTime() === new Date(b).getTime() : a === b;
  const match = (row, filter) => Object.entries(filter).every(([key,value]) => {
    if (key === '$or') return value.some(f => match(row,f));
    if (value && typeof value === 'object' && !(value instanceof Date) && !(value instanceof ObjectId)) {
      return Object.entries(value).every(([op,wanted]) => {
        const current = row[key];
        if (op === '$lt') return current < wanted;
        if (op === '$lte') return current <= wanted;
        if (op === '$gt') return current > wanted;
        if (op === '$ne') return !eq(current,wanted);
        if (op === '$exists') return (current !== undefined) === wanted;
        throw new Error(`Unsupported filter ${op}`);
      });
    }
    return eq(row[key],value);
  });
  const apply = (row, update, inserted) => {
    if (inserted) Object.assign(row,copy(update.$setOnInsert || {}));
    Object.assign(row,copy(update.$set || {}));
    for(const [key,value] of Object.entries(update.$inc || {})) row[key]=(row[key] || 0)+value;
  };
  const db = { tables, fail: null, collection(name) {
    if(!tables.has(name)) tables.set(name,[]);
    const rows=tables.get(name);
    const check=(op,filter)=>{if(db.fail)db.fail(name,op,filter)};
    const insert=(record)=>{
      if(rows.some(row=>eq(row._id,record._id) || (name==='users' &&
        (row.email===record.email || (record.phone && row.phone===record.phone))))) {
        throw Object.assign(new Error('Duplicate'),{code:11000});
      }
      rows.push(record);
    };
    return {
      async findOne(filter){check('findOne',filter);return copy(rows.find(row=>match(row,filter)) || null)},
      async insertOne(data){check('insertOne',data);const row=copy(data);row._id??=new ObjectId();insert(row);return {insertedId:row._id}},
      async findOneAndUpdate(filter,update,options={}){
        check('findOneAndUpdate',filter);
        let row=rows.find(row=>match(row,filter));
        if(!row && options.upsert){row=copy(filter);apply(row,update,true);insert(row);return copy(row)}
        if(!row)return null;
        apply(row,update,false);return copy(row);
      },
      async updateOne(filter,update,options={}){
        check('updateOne',filter);let row=rows.find(row=>match(row,filter));
        if(!row&&options.upsert){row=copy(filter);apply(row,update,true);insert(row);return {matchedCount:0,upsertedId:row._id}}
        if(!row)return {matchedCount:0};apply(row,update,false);return {matchedCount:1};
      },
    };
  } };
  return db;
}
const input = { fullName:'Nguyen Van An', phone:'0912345678', email:'student@example.test',
  password:'StrongPass123!', confirmPassword:'StrongPass123!', termsAccepted:true };
function mailOptions(db) {
  const mails=[];
  return {db,mails,sendEmail:async mail=>{mails.push(mail);return {accepted:[mail.to]}}};
}
function emailToken(mail) {
  const link = mail.text.match(/https?:\/\/\S+/)[0];
  return new URL(link).searchParams.get('token');
}
async function activeUser(db, email=input.email) {
  const user={ _id:new ObjectId(), email, full_name:input.fullName, role:'student', status:'active',
    email_verified:true,is_active:true, password_hash:await bcrypt.hash('OldPassword123!',4), onboarding_completed:true };
  await db.collection('users').insertOne(user);return user;
}
async function resetFlow(db,options) {
  await sendForgotPasswordOtp({email:input.email},options);
  const otp=options.mails.at(-1).text.match(/\b\d{6}\b/)[0];
  const result=await verifyForgotPasswordOtp({email:input.email,otp},options);
  return {otp,token:result.resetToken};
}

// RSA signatures are verified by the production Google verifier, with a mocked public-key transport only.
const { privateKey,publicKey }=generateKeyPairSync('rsa',{modulusLength:2048});
const jwk={...publicKey.export({format:'jwk'}),kid:'test-key',use:'sig',alg:'RS256'};
const attackerPrivateKey=generateKeyPairSync('rsa',{modulusLength:2048}).privateKey;
function googleToken(extra={}) {
  return jwt.sign({sub:'google-user',email:'google@example.test',email_verified:true,...extra},privateKey,
    {algorithm:'RS256',keyid:'test-key',audience:'test-client',issuer:'https://accounts.google.com',expiresIn:'1h'});
}
function googleOptions(db) {return {db,fetch:async()=>({ok:true,json:async()=>({keys:[jwk]})})};}

// Restore only config keys used here. No actual service credentials or network are used.
const original={};
for(const key of ['GOOGLE_CLIENT_ID','FACEBOOK_APP_ID','FACEBOOK_APP_SECRET','FACEBOOK_GRAPH_VERSION']) original[key]=process.env[key];
test.before(()=>{
  process.env.GOOGLE_CLIENT_ID='test-client';
  delete process.env.FACEBOOK_APP_ID;delete process.env.FACEBOOK_APP_SECRET;delete process.env.FACEBOOK_GRAPH_VERSION;
});
test.after(()=>{for(const [key,value] of Object.entries(original)){if(value===undefined)delete process.env[key];else process.env[key]=value}});

test('Registration requires explicit terms, confirmation, types and a consistent password policy',async()=>{
  const db=memoryDb();
  for(const change of [{termsAccepted:undefined},{confirmPassword:undefined},{confirmPassword:123},
    {email:{}},{password:'a       ',confirmPassword:'a       '},{password:'StrongPass123! ',confirmPassword:'StrongPass123! '}]) {
    await assert.rejects(registerUser({...input,...change},{db,skipEmail:true}),e=>e.status===400);
  }
  assert.equal(validatePassword('Aa1!'+ '界'.repeat(24)).valid,false);
});

test('Registration sends secret only by email, activation is one-use and identity bound',async()=>{
  const db=memoryDb(), options=mailOptions(db);
  const result=await registerUser(input,options);
  assert.equal(result.verificationToken,undefined);assert.equal(result.verificationLink,undefined);
  const user=db.tables.get('users')[0];
  assert.notEqual(user.password_hash,input.password);assert.ok(await bcrypt.compare(input.password,user.password_hash));
  const token=emailToken(options.mails[0]);
  const results=await Promise.allSettled([verifyEmailVerificationToken({token},{db}),verifyEmailVerificationToken({token},{db})]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(user.status,'active');
});

test('Verification cannot reopen locked account; resend invalidates old link and reserves cooldown atomically',async()=>{
  const db=memoryDb(), options=mailOptions(db);
  await registerUser(input,options);
  const user=db.tables.get('users')[0],oldToken=emailToken(options.mails[0]);
  user.status='locked';
  await assert.rejects(verifyEmailVerificationToken({token:oldToken},{db}));assert.equal(user.status,'locked');
  user.status='pending';user.last_verification_sent_at=new Date(Date.now()-61000);
  const results=await Promise.allSettled([resendVerificationLink({email:input.email},options),resendVerificationLink({email:input.email},options)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(results.find(r=>r.status==='fulfilled').value.verificationToken,undefined);
  await assert.rejects(verifyEmailVerificationToken({token:oldToken},{db}));
  await verifyEmailVerificationToken({token:emailToken(options.mails.at(-1))},{db});
});

test('Mail failures return sanitized 503 and database failures propagate',async()=>{
  const db=memoryDb();
  await assert.rejects(registerUser(input,{db,sendEmail:async()=>{throw new Error('secret SMTP detail')}}),
    e=>e.status===503&&e.code==='EMAIL_DELIVERY_FAILED'&&!e.message.includes('secret'));
  await assert.rejects(deliverAuthEmail({},{sendEmail:async()=>({sent:false})}),e=>e.status===503);
  db.fail=()=>{throw new Error('Database unavailable')};
  await assert.rejects(registerUser(input,{db,skipEmail:true}),/Database unavailable/);
});

test('Request rate counters enforce quotas under concurrency',async()=>{
  const db=memoryDb();
  const results=await Promise.allSettled(Array.from({length:12},()=>limitAuthRequests(db,'test','same',5)));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,5);
  assert.ok(results.filter(r=>r.status==='rejected').every(r=>r.reason.status===429));
});

test('Google validates signatures, audience, issuer, expiry and verified email; ignores request profile',async()=>{
  const db=memoryDb(),options=googleOptions(db);
  const result=await registerWithGoogle({idToken:googleToken(),email:'victim@example.test',providerId:'forged'},options);
  assert.equal(result.user.email,'google@example.test');
  assert.ok(verifyJwt(result.accessToken).credentialVersion);
  assert.ok(verifyJwt(result.accessToken).sid);
  assert.equal((await verifyAuthSession(result.accessToken, { db })).isAuthenticated, true);
  await assert.rejects(registerWithGoogle({email:'victim@example.test',providerId:'forged'},options),e=>e.code==='OAUTH_TOKEN_REQUIRED');
  for(const token of [googleToken({email_verified:false}),
    jwt.sign({sub:'user',email:'a@example.test',email_verified:true},attackerPrivateKey,{algorithm:'RS256',keyid:'test-key',audience:'test-client',issuer:'https://accounts.google.com',expiresIn:'1h'}),
    jwt.sign({sub:'user',email:'a@example.test',email_verified:true},privateKey,{algorithm:'RS256',keyid:'test-key',audience:'wrong',issuer:'https://accounts.google.com',expiresIn:'1h'}),
    jwt.sign({sub:'user',email:'a@example.test',email_verified:true},privateKey,{algorithm:'RS256',keyid:'test-key',audience:'test-client',issuer:'https://wrong.example',expiresIn:'1h'}),
    jwt.sign({sub:'user',email:'a@example.test',email_verified:true},privateKey,{algorithm:'RS256',keyid:'test-key',audience:'test-client',issuer:'https://accounts.google.com',expiresIn:-1}),
    jwt.sign({sub:'user'},'forged')]) {
    await assert.rejects(verifyGoogleIdentity({idToken:token},options),e=>e.status===401);
  }
  const token=googleToken();
  await assert.rejects(verifyGoogleIdentity({idToken:token},{fetch:async()=>{throw new Error('network')}}),e=>e.status===503);
});

test('Social sign-in refuses automatic email linking and locked provider identities',async()=>{
  const db=memoryDb(),options=googleOptions(db);const user=await activeUser(db,'google@example.test');
  await assert.rejects(registerWithGoogle({idToken:googleToken()},options),e=>e.code==='ACCOUNT_LINK_REQUIRED');
  const stored=db.tables.get('users')[0];stored.google_id='google-user';stored.status='locked';
  await assert.rejects(loginWithGoogle({idToken:googleToken()},options),e=>e.status===403);
  assert.equal(stored.status,'locked');assert.equal(stored.password_hash,user.password_hash);
});

test('Facebook fails closed without env; verifies app/user/expiry and trusts provider email only',async()=>{
  await assert.rejects(registerWithFacebook({providerId:'forged',email:'victim@example.test'},{db:memoryDb()}),e=>e.code==='OAUTH_NOT_CONFIGURED');
  process.env.FACEBOOK_APP_ID='app';process.env.FACEBOOK_APP_SECRET='test-secret';process.env.FACEBOOK_GRAPH_VERSION='v99.0';
  const options={fetch:async url=>({ok:true,json:async()=>String(url).includes('/debug_token')
    ? {data:{is_valid:true,type:'USER',app_id:'app',user_id:'fb-user',expires_at:Math.floor(Date.now()/1000)+3600}}
    : {id:'fb-user',email:'facebook@example.test',name:'Facebook User'}})};
  const identity=await verifyFacebookIdentity({accessToken:'provider-token',email:'forged@example.test'},options);
  assert.equal(identity.email,'facebook@example.test');
  await assert.rejects(verifyFacebookIdentity({accessToken:'provider-token'},{fetch:async()=>({ok:true,json:async()=>({data:{is_valid:true,type:'USER',app_id:'wrong',user_id:'fb-user',expires_at:9999999999}})})}),e=>e.status===401);
  await assert.rejects(verifyFacebookIdentity({accessToken:'provider-token'},{fetch:async()=>({ok:true,json:async()=>({data:{is_valid:true,type:'USER',app_id:'app',user_id:'fb-user',expires_at:1}})})}),e=>e.status===401);
  await assert.rejects(verifyFacebookIdentity({accessToken:'provider-token'},{fetch:async url=>({ok:true,json:async()=>String(url).includes('/debug_token')?{data:{is_valid:true,type:'USER',app_id:'app',user_id:'fb-user',expires_at:9999999999}}:{id:'fb-user'}})}),e=>e.code==='MISSING_EMAIL');
  delete process.env.FACEBOOK_APP_ID;delete process.env.FACEBOOK_APP_SECRET;delete process.env.FACEBOOK_GRAPH_VERSION;
});

test('OTP is cryptographic six-digit text; storage hashes it and unknown emails have identical cooldown',async()=>{
  assert.match(generateOtp(),/^\d{6}$/);
  for(const exists of [true,false]){
    const db=memoryDb(),options=mailOptions(db);if(exists)await activeUser(db);
    const result=await sendForgotPasswordOtp({email:input.email},options);
    assert.equal(result.testOtp,undefined);
    assert.equal(result.message,'Nếu email tồn tại trên hệ thống, bạn sẽ nhận được mã xác thực.');
    await assert.rejects(sendForgotPasswordOtp({email:input.email},options),e=>e.status===429);
    const row=db.tables.get('otps').find(r=>r.purpose==='reset_password');assert.match(row.otp,/^[a-f0-9]{64}$/);
    if(exists)assert.notEqual(row.otp,options.mails[0].text.match(/\b\d{6}\b/)[0]);else assert.equal(options.mails.length,0);
  }
});

test('Concurrent OTP use succeeds once; wrong guesses count atomically and preserve cooldown',async()=>{
  const db=memoryDb(),options=mailOptions(db);await activeUser(db);
  await sendForgotPasswordOtp({email:input.email},options);
  const otp=options.mails[0].text.match(/\b\d{6}\b/)[0];
  const results=await Promise.allSettled(Array.from({length:5},()=>verifyForgotPasswordOtp({email:input.email,otp},options)));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  const row=db.tables.get('otps').find(r=>r.purpose==='reset_authorization');row.created_at=new Date(Date.now()-61000);
  await sendForgotPasswordOtp({email:input.email},options);
  const current=options.mails.at(-1).text.match(/\b\d{6}\b/)[0];const wrong=current==='000000'?'000001':'000000';
  await Promise.allSettled(Array.from({length:8},()=>verifyForgotPasswordOtp({email:input.email,otp:wrong},options)));
  assert.equal(row.attempts,5);
  await assert.rejects(verifyForgotPasswordOtp({email:input.email,otp:current},options));
  await assert.rejects(sendForgotPasswordOtp({email:input.email},options),e=>e.status===429);
});

test('Expired or malformed OTP and non-string inputs are rejected',async()=>{
  const db=memoryDb(),options=mailOptions(db);await activeUser(db);await sendForgotPasswordOtp({email:input.email},options);
  for(const otp of [123456,'abc','12345',{},null])await assert.rejects(verifyForgotPasswordOtp({email:input.email,otp},options),e=>e.status===400);
  await assert.rejects(sendForgotPasswordOtp({email:{}},options),e=>e.status===400);
  db.tables.get('otps').find(r=>r.purpose==='reset_password').expires_at=new Date(0);
  await assert.rejects(verifyForgotPasswordOtp({email:input.email,otp:'123456'},options));
});

test('Reset is one-use under concurrency, enforces password policy and revokes previous JWTs',async()=>{
  const db=memoryDb(),options=mailOptions(db);await activeUser(db);
  const login=await loginWithCredentials({email:input.email,password:'OldPassword123!'},options);
  assert.equal((await verifyAuthSession(login.accessToken,{db})).isAuthenticated,true);
  const {token}=await resetFlow(db,options);
  for(const [newPassword,confirmPassword] of [['a       ','a       '],['weakpass','weakpass'],['StrongPass123!',undefined],[{},{}]]) {
    await assert.rejects(resetPasswordWithToken({resetToken:token,newPassword,confirmPassword},options),e=>e.status===400);
  }
  const params={resetToken:token,newPassword:input.password,confirmPassword:input.password};
  const results=await Promise.allSettled([resetPasswordWithToken(params,options),resetPasswordWithToken(params,options)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal((await verifyAuthSession(login.accessToken,{db})).reason,'SESSION_REVOKED');
  const next=await loginWithCredentials({email:input.email,password:input.password},options);
  assert.equal((await verifyAuthSession(next.accessToken,{db})).isAuthenticated,true);
  await assert.rejects(resetPasswordWithToken(params,options));
});

test('Reset preserves admin lock; a new OTP invalidates earlier reset grants',async()=>{
  const db=memoryDb(),options=mailOptions(db);await activeUser(db);const {token}=await resetFlow(db,options);
  const stored=db.tables.get('users')[0];stored.status='locked';stored.is_active=false;
  const params={resetToken:token,newPassword:input.password,confirmPassword:input.password};
  await assert.rejects(resetPasswordWithToken(params,options),e=>e.status===403);assert.equal(stored.status,'locked');
  stored.status='active';stored.is_active=true;
  db.tables.get('otps').find(r=>r.purpose==='reset_authorization').created_at=new Date(Date.now()-61000);
  await sendForgotPasswordOtp({email:input.email},options);
  await assert.rejects(resetPasswordWithToken(params,options),e=>e.code==='RESET_TOKEN_INVALID');
});

test('Session checker rejects legacy, refresh, verification, admin and suspended tokens',async()=>{
  const db=memoryDb();const user=await activeUser(db);
  for(const payload of [{sub:String(user._id)},{sub:String(user._id),type:'refresh'},
    {sub:String(user._id),purpose:'verify_email'},{adminId:String(user._id)}]) {
    assert.equal((await verifyAuthSession(signJwt(payload),{db})).isAuthenticated,false);
  }
  const token=signJwt({sub:String(user._id),credentialVersion:credentialVersion(user)});
  db.tables.get('users')[0].status='pending';
  assert.equal((await verifyAuthSession(token,{db})).isAuthenticated,false);
});

test('Resending during password hashing atomically invalidates the in-flight reset grant',async()=>{
  const db=memoryDb(),options=mailOptions(db);await activeUser(db);const {token}=await resetFlow(db,options);
  const stored=db.tables.get('users')[0],oldHash=stored.password_hash;
  db.tables.get('otps').find(r=>r.purpose==='reset_authorization').created_at=new Date(Date.now()-61000);
  let signal;const grantRead=new Promise(resolve=>{signal=resolve});
  db.fail=(name,op,filter)=>{if(name==='otps'&&op==='findOne'&&filter.purpose==='reset_authorization')signal()};
  const pending=resetPasswordWithToken({resetToken:token,newPassword:input.password,confirmPassword:input.password},options);
  await grantRead;
  await sendForgotPasswordOtp({email:input.email},options);
  await assert.rejects(pending,e=>e.code==='RESET_TOKEN_INVALID');
  assert.equal(stored.password_hash,oldHash);
});

test('Expired reset grants and concurrent account state changes never report successful password reset',async()=>{
  const db=memoryDb(),options=mailOptions(db);await activeUser(db);const {token}=await resetFlow(db,options);
  const row=db.tables.get('otps').find(r=>r.purpose==='reset_authorization');
  row.expires_at=new Date(0);
  const params={resetToken:token,newPassword:input.password,confirmPassword:input.password};
  await assert.rejects(resetPasswordWithToken(params,options),e=>e.code==='RESET_TOKEN_INVALID');
  row.expires_at=new Date(Date.now()+60000);
  const stored=db.tables.get('users')[0],oldHash=stored.password_hash;
  db.fail=(name,op)=>{if(name==='users'&&op==='updateOne')stored.status='locked'};
  await assert.rejects(resetPasswordWithToken(params,options),e=>e.code==='ACCOUNT_CHANGED');
  assert.equal(stored.password_hash,oldHash);assert.equal(stored.status,'locked');
});

test('Password login treats the supplied password literally and rejects malformed input',async()=>{
  const db=memoryDb();await activeUser(db);
  await assert.rejects(loginWithCredentials({email:input.email,password:'OldPassword123! '},{db}),e=>e.code==='INVALID_CREDENTIALS');
  await assert.rejects(loginWithCredentials({email:{},password:[]},{db}),e=>e.status===400);
});
