import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { ObjectId } from 'mongodb';
import express from 'express';
import { createPaymentSession,retryPaymentSession,checkPaymentStatus,fulfillPaymentSuccess,completePaidOrder,recoverPayments,PAYMENT_EXPIRY_MS } from '../payment.service.js';
import { handleSepayWebhook } from '../gateways/sepay.service.js';
import { createVnpayPaymentUrl,verifyVnpayCallback,canonicalVnpay } from '../gateways/vnpay.service.js';
import { createStripeCheckoutSession,verifyStripeEvent,handleStripeWebhookEvent } from '../gateways/stripe.service.js';
import { createPaymentRouter } from '../payment.router.js';
import { updatePaymentPreferences } from '../../payment-settings/payment-settings.user.js';
import { updateNotificationPreferences } from '../../notification/notification.user.js';

function memoryDb(){
  let tables=new Map(),queue=Promise.resolve();
  const copy=value=>value instanceof ObjectId?new ObjectId(String(value)):value instanceof Date?new Date(value):value instanceof Map?new Map([...value].map(([k,v])=>[k,copy(v)])):Array.isArray(value)?value.map(copy):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,copy(v)])):value;
  const equal=(a,b)=>a instanceof ObjectId||b instanceof ObjectId?String(a)===String(b):a instanceof Date||b instanceof Date?new Date(a).getTime()===new Date(b).getTime():a===b;
  const match=(row,query)=>Object.entries(query).every(([key,value])=>{
    if(key==='$or')return value.some(q=>match(row,q));if(key==='$and')return value.every(q=>match(row,q));
    if(value&&typeof value==='object'&&!(value instanceof ObjectId)&&!(value instanceof Date))return Object.entries(value).every(([op,v])=>{
      const current=row[key];
      if(op==='$in')return v.some(x=>equal(current,x));if(op==='$ne')return !equal(current,v);
      if(op==='$nin')return !v.some(x=>equal(current,x));
      if(op==='$gt')return current>v;if(op==='$lt')return current<v;if(op==='$lte')return current<=v;
      if(op==='$exists')return (current!==undefined)===v;throw new Error(`Unsupported ${op}`);
    });return equal(row[key],value);
  });
  const apply=(row,update,inserted)=>{if(inserted)Object.assign(row,copy(update.$setOnInsert||{}));Object.assign(row,copy(update.$set||{}));for(const [k,v]of Object.entries(update.$inc||{}))row[k]=(row[k]||0)+v};
  const db={get tables(){return tables},fail:null,client:{startSession(){return {
    async withTransaction(work){let release;const previous=queue;queue=new Promise(resolve=>release=resolve);await previous;const snapshot=copy(tables);try{return await work()}catch(e){tables=snapshot;throw e}finally{release()}},async endSession(){},
  }}},collection(name){
    if(!tables.has(name))tables.set(name,[]);
    const rows=()=>tables.get(name);const check=(op,filter,update)=>{if(db.fail)db.fail(name,op,filter,update)};
    return {
      async findOne(query){check('findOne',query);return copy(rows().find(row=>match(row,query))||null)},
      find(query){let limit=Infinity;return {limit(n){limit=n;return this},async toArray(){check('find',query);return copy(rows().filter(row=>match(row,query)).slice(0,limit))}}},
      async insertOne(value){check('insertOne',value);const row=copy(value);row._id??=new ObjectId();if(rows().some(r=>equal(r._id,row._id)))throw Object.assign(new Error('Duplicate'),{code:11000});rows().push(row);return {insertedId:row._id}},
      async updateOne(query,update,options={}){check('updateOne',query,update);let row=rows().find(row=>match(row,query));if(!row&&options.upsert){row=Object.fromEntries(Object.entries(query).filter(([k,v])=>!k.startsWith('$')&&(typeof v!=='object'||v instanceof ObjectId)));row._id??=new ObjectId();apply(row,update,true);if(rows().some(r=>equal(r._id,row._id)))throw Object.assign(new Error('Duplicate'),{code:11000});rows().push(row);return {matchedCount:0,upsertedId:row._id}}if(!row)return {matchedCount:0};apply(row,update,false);return {matchedCount:1}},
      async findOneAndUpdate(query,update,options={}){check('findOneAndUpdate',query,update);const row=rows().find(row=>match(row,query));if(!row)return null;const before=copy(row);apply(row,update,false);return options.returnDocument==='before'?before:copy(row)},
      async deleteMany(query){check('deleteMany',query);const original=rows().length;tables.set(name,rows().filter(row=>!match(row,query)));return {deletedCount:original-rows().length}},
    };
  }};return db;
}
const envKeys=['SEPAY_BANK_ID','SEPAY_ACCOUNT_NO','BANK_ACCOUNT_HOLDER','SEPAY_WEBHOOK_KEY','STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET','CLIENT_URL','VNP_TMN_CODE','VNP_HASH_SECRET','VNP_RETURN_URL'];
const original=Object.fromEntries(envKeys.map(k=>[k,process.env[k]]));
test.before(()=>Object.assign(process.env,{SEPAY_BANK_ID:'MB',SEPAY_ACCOUNT_NO:'123456789',BANK_ACCOUNT_HOLDER:'THINKUP',SEPAY_WEBHOOK_KEY:'test-sepay-key',STRIPE_SECRET_KEY:'sk_test_example',STRIPE_WEBHOOK_SECRET:'whsec_test',CLIENT_URL:'http://localhost:4200',VNP_TMN_CODE:'TESTMERCHANT',VNP_HASH_SECRET:'test-vnpay-secret',VNP_RETURN_URL:'http://localhost:5000/api/payment/vnpay/callback'}));
test.after(()=>{for(const[k,v]of Object.entries(original)){if(v===undefined)delete process.env[k];else process.env[k]=v}});
async function fixture(){
  const db=memoryDb(),userId=String(new ObjectId()),courseId='COURSE_01';let sequence=0,sent=0;
  await db.collection('users').insertOne({_id:new ObjectId(userId),email:'buyer@example.test',full_name:'Buyer',status:'active',is_active:true});
  await db.collection('courses').insertOne({_id:new ObjectId(),course_id:courseId,title:'Course One',status:'published',price:500000,original_price:600000});
  const options={db,generateIds:async()=>{sequence++;return {orderId:`DH20261030${String(sequence).padStart(8,'0')}`,transactionId:`GD20261030${String(sequence).padStart(8,'0')}`}},sendEmail:async()=>{sent++;return {accepted:['buyer@example.test']}}};
  const create=(extra={})=>createPaymentSession({userId,courseIds:[courseId],paymentMethod:'sepay',idempotencyKey:'test-checkout-key-0001',...extra},options);
  const pay=(session,extra={})=>fulfillPaymentSuccess({transactionId:session.transactionId,gateway:session.paymentMethod,gatewayTransactionNo:'gateway-ref-1',paidAmount:session.amount,currency:'VND',paidAt:new Date(),...extra},options);
  return {db,userId,courseId,options,create,pay,get sent(){return sent}};
}
function txOf(f,id){return f.db.tables.get('payment_transactions').find(r=>r.transaction_id===id)}
function stripeSignature(raw,timestamp=Math.floor(Date.now()/1000)){return `t=${timestamp},v1=${createHmac('sha256',process.env.STRIPE_WEBHOOK_SECRET).update(`${timestamp}.`).update(raw).digest('hex')}`}
function signedVnp(extra={}){
  const date=new Date(Date.now()+7*3600000).toISOString().slice(0,19).replace(/[-:T]/g,'');
  const params={vnp_TmnCode:'TESTMERCHANT',vnp_TxnRef:'GD2026103000000001',vnp_ResponseCode:'00',vnp_TransactionStatus:'00',vnp_Amount:'50000000',vnp_TransactionNo:'vnp-ref',vnp_PayDate:date,...extra};
  return {...params,vnp_SecureHash:createHmac('sha512',process.env.VNP_HASH_SECRET).update(canonicalVnpay(params)).digest('hex')};
}

test('Session uses DB prices, deduplicates canonical IDs and exports a 15-minute TTL',async()=>{
  const f=await fixture(),s=await f.create({courseIds:undefined,courses:[{id:f.courseId,price:1,salePrice:1},f.courseId],voucherDiscount:499999});
  assert.equal(PAYMENT_EXPIRY_MS,900000);assert.equal(s.amount,500000);assert.equal(s.status,'pending');assert.ok(s.qrCodeUrl.includes('amount=500000'));
  assert.equal(JSON.parse(txOf(f,s.transactionId).order_summary).courses.length,1);
});
test('Idempotency creates one order concurrently and rejects payload changes',async()=>{
  const f=await fixture();const [a,b]=await Promise.all([f.create(),f.create()]);assert.equal(a.transactionId,b.transactionId);assert.equal(f.db.tables.get('orders').length,1);
  await assert.rejects(f.create({paymentMethod:'stripe'}),e=>e.code==='IDEMPOTENCY_CONFLICT');
  await assert.rejects(f.create({idempotencyKey:'short'}),e=>e.code==='IDEMPOTENCY_REQUIRED');
});
test('Rejects unavailable/owned courses, missing gateway configuration, invalid data and non-transactional storage',async()=>{
  const f=await fixture();await assert.rejects(f.create({courseIds:['missing']}),e=>e.code==='COURSE_UNAVAILABLE');
  await f.db.collection('user_enrollments').insertOne({user_id:f.userId,course_id:f.courseId});await assert.rejects(f.create(),e=>e.code==='COURSE_ALREADY_OWNED');
  const g=await fixture();delete process.env.SEPAY_WEBHOOK_KEY;try{await assert.rejects(g.create(),e=>e.code==='PAYMENT_NOT_CONFIGURED');assert.equal(g.db.tables.get('orders')?.length || 0,0)}finally{process.env.SEPAY_WEBHOOK_KEY='test-sepay-key'}
  await assert.rejects(g.create({courseIds:{}}));const noClient=await fixture();noClient.db.client=null;await assert.rejects(noClient.create(),e=>e.code==='PAYMENT_STORAGE_UNAVAILABLE');
  await assert.rejects(g.create({paymentMethod:'toString'}));
});
test('Voucher is validated from DB, reserved once and released once on expiry',async()=>{
  const f=await fixture();await f.db.collection('platform_coupons').insertOne({code:'SAVE',status:'active',discount_type:'percent',discount_value:20,usage_count:0,usage_limit:1});
  const s=await f.create({voucherCode:'SAVE'});assert.equal(s.amount,400000);assert.equal(f.db.tables.get('platform_coupons')[0].usage_count,1);
  assert.equal((await f.create({voucherCode:'SAVE'})).transactionId,s.transactionId);assert.equal(f.db.tables.get('platform_coupons')[0].usage_count,1);
  txOf(f,s.transactionId).expires_at=new Date(0);
  assert.equal((await checkPaymentStatus(s.transactionId,f.userId,f.options)).status,'expired');
  await checkPaymentStatus(s.transactionId,f.userId,f.options);assert.equal(f.db.tables.get('platform_coupons')[0].usage_count,0);
  await assert.rejects(f.create({idempotencyKey:'another-checkout-key-01',voucherCode:'WELCOME'}),e=>e.code==='VOUCHER_INVALID');
});
test('A genuinely free course completes internally without a gateway',async()=>{
  const f=await fixture();f.db.tables.get('courses')[0].price=0;const s=await f.create();assert.equal(s.paymentMethod,'free');assert.equal(s.status,'success');assert.equal(f.db.tables.get('user_enrollments').length,1);
});
test('Fulfillment is idempotent, writes both ownership collections and removes only the buyer cart items',async()=>{
  const f=await fixture();await f.db.collection('user_cart_items').insertOne({user_id:f.userId,course_id:f.courseId});await f.db.collection('user_cart_items').insertOne({user_id:'other',course_id:f.courseId});
  const s=await f.create();const results=await Promise.all([f.pay(s),f.pay(s)]);assert.ok(results.some(r=>r.alreadyProcessed));
  assert.equal(txOf(f,s.transactionId).status,'success');assert.equal(f.db.tables.get('user_enrollments').length,1);assert.equal(f.db.tables.get('user_courses').length,1);
  assert.equal(f.db.tables.get('user_cart_items').length,1);assert.equal(f.db.tables.get('user_cart_items')[0].user_id,'other');assert.equal(f.sent,1);
});
test('Preserves existing progress when ownership appears before fulfillment',async()=>{
  const f=await fixture(),s=await f.create();await f.db.collection('user_courses').insertOne({user_id:f.userId,course_id:f.courseId,progress:80});assert.equal((await f.pay(s)).status,'needs_review');
  assert.equal(f.db.tables.get('user_courses')[0].progress,80);
});
test('Partial fulfillment rolls back; paid receipt persists and recovery retries safely',async()=>{
  const f=await fixture(),s=await f.create();let fail=true;
  f.db.fail=(name,op)=>{if(name==='user_courses'&&op==='updateOne'&&fail)throw new Error('storage failure')};
  await assert.rejects(f.pay(s),/storage failure/);assert.equal(txOf(f,s.transactionId).status,'paid');assert.equal(f.db.tables.get('user_enrollments')?.length || 0,0);
  fail=false;await recoverPayments(f.options);assert.equal(txOf(f,s.transactionId).status,'success');assert.equal(f.db.tables.get('user_enrollments').length,1);
});
test('Late, short, overpaid and wrong-currency payments are retained for review without access',async()=>{
  for(const extra of [{paidAmount:1},{paidAmount:600000},{currency:'USD'},{paidAt:new Date(Date.now()+1000)}]){
    const f=await fixture(),s=await f.create();if(extra.paidAt)txOf(f,s.transactionId).expires_at=new Date(Date.now()-1000);
    const result=await f.pay(s,extra);assert.equal(result.status,'needs_review');assert.equal(f.db.tables.get('user_enrollments')?.length || 0,0);
    assert.equal(f.db.tables.get('payment_transactions').filter(r=>r.record_type==='gateway_receipt').length,1);
  }
});
test('Gateway reference cannot pay a second transaction; wrong gateway and zero amount are rejected',async()=>{
  const f=await fixture(),first=await f.create();await f.pay(first);
  await assert.rejects(f.pay(first,{gateway:'vnpay',gatewayTransactionNo:'other'}),e=>e.code==='GATEWAY_MISMATCH');
  await assert.rejects(f.pay(first,{paidAmount:0}));
  const otherId=String(new ObjectId());await f.db.collection('users').insertOne({_id:new ObjectId(otherId),status:'active'});
  const second=await createPaymentSession({userId:otherId,courseIds:[f.courseId],paymentMethod:'sepay',idempotencyKey:'second-buyer-key-001'},f.options);
  await assert.rejects(f.pay(second),e=>e.code==='GATEWAY_REPLAY');assert.equal(txOf(f,second.transactionId).status,'pending');
});
test('Payment status is owner-only; a blocked buyer is retained for review',async()=>{
  const f=await fixture(),s=await f.create();await assert.rejects(checkPaymentStatus(s.transactionId,'someone-else',f.options),e=>e.status===404);
  f.db.tables.get('users')[0].status='locked';assert.equal((await f.pay(s)).status,'needs_review');
});
test('Retry keeps order identity, rotates GD and cancels the old attempt without losing voucher reservation',async()=>{
  const f=await fixture(),s=await f.create();const next=await retryPaymentSession({userId:f.userId,orderId:s.orderId,idempotencyKey:'retry-payment-key-001',paymentMethod:'stripe'},f.options);
  assert.equal(next.orderId,s.orderId);assert.notEqual(next.transactionId,s.transactionId);assert.equal(txOf(f,s.transactionId).status,'cancelled');
  assert.equal((await f.pay(s)).status,'needs_review');
});
test('SePay requires exact authentication, receiving account and verified inbound fields',async()=>{
  const f=await fixture(),s=await f.create();const payload={id:123,transferType:'in',transferAmount:500000,accountNumber:'123456789',transactionDate:new Date(Date.now()+7*3600000).toISOString().slice(0,19).replace('T',' '),content:`THINKUP ${s.transactionId}`};
  await assert.rejects(handleSepayWebhook(payload,'prefix test-sepay-key suffix',f.options),e=>e.status===401);
  await assert.rejects(handleSepayWebhook({...payload,accountNumber:'wrong'},'Apikey test-sepay-key',f.options),e=>e.code==='BANK_ACCOUNT_MISMATCH');
  assert.equal((await handleSepayWebhook(payload,'Apikey test-sepay-key',f.options)).status,'success');
});
test('VNPay encodes once, does not mutate input, separates Return URL and signed IPN',async()=>{
  const url=createVnpayPaymentUrl({transactionId:'GD2026103000000001',amount:500000,orderInfo:'Thanh toan khoa hoc'});
  assert.equal(new URL(url).searchParams.get('vnp_OrderInfo'),'Thanh toan khoa hoc');assert.ok(!url.includes('%2520'));
  const f=await fixture(),s=await f.create({paymentMethod:'vnpay'}),params=signedVnp({vnp_TxnRef:s.transactionId});
  const before=JSON.stringify(params);assert.equal((await verifyVnpayCallback(params,f.options)).isSuccess,true);assert.equal(JSON.stringify(params),before);assert.equal(txOf(f,s.transactionId).status,'pending');
  assert.equal((await verifyVnpayCallback({...params,vnp_Amount:'1'},f.options)).code,'97');
  assert.equal((await verifyVnpayCallback(params,{...f.options,settle:true})).status,'success');
});
test('Stripe creation charges precisely the DB-derived total and uses provider idempotency',async()=>{
  let request;const result=await createStripeCheckoutSession({transactionId:'GD2026103000000001',orderId:'DH01',amount:400000,courses:[{price:500000}]},{fetch:async(url,init)=>{request=init;return {ok:true,json:async()=>({id:'cs_test_session',url:'https://checkout.stripe.com/test'})}}});
  assert.equal(new URLSearchParams(request.body).get('line_items[0][price_data][unit_amount]'),'400000');assert.equal(request.headers['Idempotency-Key'],'thinkup-GD2026103000000001');assert.equal(result.sessionId,'cs_test_session');
});
test('Stripe verifies exact raw-body signature and timestamp, then checks provider session metadata',async()=>{
  const f=await fixture(),s=await f.create({paymentMethod:'stripe'});txOf(f,s.transactionId).gateway_session_id='cs_test_session';
  const event={id:'evt_test',created:Math.floor(Date.now()/1000),type:'checkout.session.completed',data:{object:{id:'cs_test_session'}}};const raw=Buffer.from(JSON.stringify(event));
  assert.throws(()=>verifyStripeEvent(raw,'bad'));assert.throws(()=>verifyStripeEvent(raw,stripeSignature(raw,1)));assert.throws(()=>verifyStripeEvent(Buffer.from('{}'),stripeSignature(raw)));
  f.options.fetch=async()=>({ok:true,json:async()=>({id:'cs_test_session',payment_status:'paid',status:'complete',client_reference_id:s.transactionId,metadata:{transactionId:s.transactionId,orderId:s.orderId},amount_total:500000,currency:'vnd'})});
  assert.equal((await handleStripeWebhookEvent(raw,stripeSignature(raw),f.options)).status,'success');
});
test('Receipt email failure never revokes completed access, and recovery retries delivery',async()=>{
  const f=await fixture(),s=await f.create();f.options.sendEmail=async()=>{throw new Error('SMTP failure')};await f.pay(s);assert.equal(txOf(f,s.transactionId).status,'success');assert.equal(txOf(f,s.transactionId).email_status,'pending');
  f.options.sendEmail=async()=>({accepted:['buyer@example.test']});txOf(f,s.transactionId).email_lease_until=new Date(0);await recoverPayments(f.options);assert.equal(txOf(f,s.transactionId).email_status,'sent');
});

test('Receipt opt-out is read at sending time and does not affect payment fulfillment or another owner',async()=>{
  const f=await fixture(),s=await f.create();
  await updatePaymentPreferences('another-owner',{invoiceEmail:false,expectedRevision:0},f.options);
  await updatePaymentPreferences(f.userId,{invoiceEmail:false,expectedRevision:0},f.options);
  await f.pay(s);
  const tx=txOf(f,s.transactionId);
  assert.equal(tx.status,'success');assert.equal(tx.fulfillment_status,'completed');
  assert.equal(f.db.tables.get('user_enrollments').length,1);
  assert.equal(f.sent,0);assert.equal(tx.email_status,'suppressed');
  assert.equal(tx.email_suppressed_reason,'invoice_email_disabled');assert.equal(tx.email_preference_revision,1);
  assert.equal((await recoverPayments(f.options)).checked,0);
  await completePaidOrder(s.transactionId,f.options);assert.equal(f.sent,0);
  const other=await fixture(),otherSession=await other.create();
  await updatePaymentPreferences('another-owner',{invoiceEmail:false,expectedRevision:0},other.options);
  await other.pay(otherSession);assert.equal(other.sent,1);
});

test('Turning receipts off also stops pending email retries without revoking completed access',async()=>{
  const f=await fixture(),s=await f.create();
  f.options.sendEmail=async()=>{throw new Error('SMTP failure')};
  await f.pay(s);assert.equal(txOf(f,s.transactionId).email_status,'pending');
  await updatePaymentPreferences(f.userId,{invoiceEmail:false,expectedRevision:0},f.options);
  let delivered=0;f.options.sendEmail=async()=>{delivered++;return {accepted:['buyer@example.test']}};
  txOf(f,s.transactionId).email_lease_until=new Date(0);
  await recoverPayments(f.options);
  assert.equal(delivered,0);assert.equal(txOf(f,s.transactionId).email_status,'suppressed');
  assert.equal(txOf(f,s.transactionId).status,'success');
});

test('Re-enabling receipts applies to new payments without replaying suppressed historical mail',async()=>{
  const f=await fixture();
  await updatePaymentPreferences(f.userId,{invoiceEmail:false,expectedRevision:0},f.options);
  const first=await f.create();await f.pay(first);
  await updatePaymentPreferences(f.userId,{invoiceEmail:true,expectedRevision:1},f.options);
  await recoverPayments(f.options);assert.equal(f.sent,0);
  assert.equal(txOf(f,first.transactionId).email_status,'suppressed');
  await f.db.collection('courses').insertOne({_id:new ObjectId(),course_id:'COURSE_02',title:'Second',status:'published',price:200000,original_price:200000});
  const second=await f.create({courseIds:['COURSE_02'],idempotencyKey:'second-receipt-checkout-key'});
  await f.pay(second,{gatewayTransactionNo:'gateway-reference-2'});
  assert.equal(f.sent,1);assert.equal(txOf(f,second.transactionId).email_status,'sent');
});

test('Preferences storage failure never defaults to sending or changes an already completed payment',async()=>{
  const f=await fixture(),s=await f.create();
  f.db.fail=(name,operation)=>{if(name==='payment_preferences'&&operation==='findOne')throw new Error('private preference database')};
  await f.pay(s);
  assert.equal(f.sent,0);assert.equal(txOf(f,s.transactionId).status,'success');
  assert.equal(txOf(f,s.transactionId).email_status,'pending');
  f.db.fail=null;txOf(f,s.transactionId).email_lease_until=new Date(0);
  await recoverPayments(f.options);assert.equal(f.sent,1);
});

test('Notification integration: completion records one inbox event even with repeated fulfillment and email opt-out',async()=>{
  const f=await fixture();
  await updatePaymentPreferences(f.userId,{invoiceEmail:false,expectedRevision:0},f.options);
  const s=await f.create();await f.pay(s);await completePaidOrder(s.transactionId,f.options);
  const notices=f.db.tables.get('notifications');
  assert.equal(notices.length,1);assert.equal(notices[0].user_id,f.userId);
  assert.equal(notices[0].kind,'purchase');assert.equal(notices[0].read_at,null);
  assert.equal(f.sent,0);assert.equal(txOf(f,s.transactionId).status,'success');
});

test('Notification integration: inbox failure rolls back fulfillment and recovery creates the event exactly once',async()=>{
  const f=await fixture(),s=await f.create();
  f.db.fail=(name,operation)=>{if(name==='notifications'&&operation==='updateOne')throw new Error('Inbox unavailable')};
  await assert.rejects(f.pay(s),/Inbox unavailable/);
  assert.equal(txOf(f,s.transactionId).status,'paid');
  assert.equal(f.db.tables.get('user_enrollments')?.length||0,0);assert.equal(f.sent,0);
  f.db.fail=null;await recoverPayments(f.options);
  assert.equal(txOf(f,s.transactionId).status,'success');assert.equal(f.db.tables.get('notifications').length,1);
});

test('Notification integration: DND defers receipts while preserving access and inbox, then recovery sends once',async()=>{
  const f=await fixture();
  await updateNotificationPreferences(f.userId,{dnd:{mode:'indefinite'},expectedRevision:0},f.options);
  const s=await f.create();await f.pay(s);
  assert.equal(f.sent,0);assert.equal(txOf(f,s.transactionId).status,'success');
  assert.equal(txOf(f,s.transactionId).email_status,'pending');assert.equal(txOf(f,s.transactionId).email_suppressed_reason,'dnd');
  assert.equal(f.db.tables.get('notifications').length,1);
  await updateNotificationPreferences(f.userId,{dnd:{mode:'off'},expectedRevision:1},f.options);
  txOf(f,s.transactionId).email_lease_until=new Date(0);
  await recoverPayments(f.options);await recoverPayments(f.options);assert.equal(f.sent,1);
});

test('Notification integration: global email opt-out suppresses receipts without suppressing inbox creation',async()=>{
  const f=await fixture();await updateNotificationPreferences(f.userId,{email:false},f.options);
  const s=await f.create();await f.pay(s);
  assert.equal(f.sent,0);assert.equal(txOf(f,s.transactionId).email_status,'suppressed');
  assert.equal(txOf(f,s.transactionId).email_suppressed_reason,'notification_email_disabled');
  assert.equal(f.db.tables.get('notifications').length,1);
});
test('HTTP router enforces auth/owner/idempotency, removes simulation, and checks raw Stripe input',async()=>{
  const f=await fixture(),app=express();app.use(express.json({verify:(req,res,buf)=>{req.rawBody=Buffer.from(buf)}}));
  app.use('/api/payment',createPaymentRouter(express,(req,res,next)=>{if(!req.get('X-Test-User'))return res.sendStatus(401);req.userId=req.get('X-Test-User');next()},f.options));
  const server=app.listen(0);await new Promise(resolve=>server.once('listening',resolve));const base=`http://127.0.0.1:${server.address().port}/api/payment`;
  try{
    assert.equal((await fetch(`${base}/status/any`)).status,401);
    assert.equal((await fetch(`${base}/simulate-success`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,404);
    const response=await fetch(`${base}/create-session`,{method:'POST',headers:{'Content-Type':'application/json','X-Test-User':f.userId,'Idempotency-Key':'http-checkout-key-001'},body:JSON.stringify({courseIds:[f.courseId],paymentMethod:'sepay',voucherDiscount:500000})});
    assert.equal(response.status,201);const {data}=await response.json();assert.equal(data.amount,500000);
    assert.equal((await fetch(`${base}/status/${data.transactionId}`,{headers:{'X-Test-User':'someone-else'}})).status,404);
    assert.equal((await fetch(`${base}/webhook/stripe`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,400);
  }finally{await new Promise(resolve=>server.close(resolve))}
});

test('Unknown transfer references are retained for reconciliation, not silently discarded',async()=>{
  const f=await fixture();const payload={id:999,transferType:'in',transferAmount:500000,accountNumber:'123456789',transactionDate:new Date(Date.now()+7*3600000).toISOString().slice(0,19).replace('T',' '),content:'Missing payment code'};
  assert.equal((await handleSepayWebhook(payload,'Apikey test-sepay-key',f.options)).status,'needs_review');
  assert.equal((await handleSepayWebhook(payload,'Apikey test-sepay-key',f.options)).status,'needs_review');
  assert.equal(f.db.tables.get('payment_transactions').length,1);
  const unknown=await fulfillPaymentSuccess({transactionId:'GD2026103099999999',gateway:'sepay',gatewayTransactionNo:'unknown-2',paidAmount:500000,currency:'VND',paidAt:new Date()},f.options);
  assert.equal(unknown.unmatched,true);
});
test('Rejected vouchers and a failed order insert roll back all reservations',async()=>{
  const f=await fixture();await f.db.collection('platform_coupons').insertOne({code:'SAVE',status:'active',discount_type:'fixed',discount_value:100000,usage_count:0,usage_limit:1});
  f.db.fail=(name,op)=>{if(name==='payment_transactions'&&op==='insertOne')throw new Error('Payment insert failed')};
  await assert.rejects(f.create({voucherCode:'SAVE'}),/Payment insert failed/);
  assert.equal(f.db.tables.get('platform_coupons')[0].usage_count,0);assert.equal(f.db.tables.get('orders')?.length || 0,0);
  f.db.fail=null;f.db.tables.get('platform_coupons')[0].expires_at=new Date(0);
  await assert.rejects(f.create({voucherCode:'SAVE'}),e=>e.code==='VOUCHER_INVALID');
});
test('Stripe unpaid Checkout Session never triggers fulfillment even with a valid signature',async()=>{
  const f=await fixture(),s=await f.create({paymentMethod:'stripe'});txOf(f,s.transactionId).gateway_session_id='cs_unpaid';
  const raw=Buffer.from(JSON.stringify({id:'evt_unpaid',created:Math.floor(Date.now()/1000),type:'checkout.session.completed',data:{object:{id:'cs_unpaid'}}}));
  f.options.fetch=async()=>({ok:true,json:async()=>({id:'cs_unpaid',payment_status:'unpaid',status:'complete'})});
  assert.equal((await handleStripeWebhookEvent(raw,stripeSignature(raw),f.options)).ignored,true);assert.equal(txOf(f,s.transactionId).status,'pending');
});
