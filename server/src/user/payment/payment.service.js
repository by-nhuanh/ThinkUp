import { ObjectId } from 'mongodb';
import { createHash, randomInt, randomBytes, randomUUID } from 'node:crypto';
import { getMongoDb, sendEmail } from '../db.js';
import { generateOrderWithTransaction } from '../order/order-id.user.js';
import { renderPaymentReceiptEmail } from '../email/receipt-template.js';
import { getPaymentPreferences } from '../payment-settings/payment-settings.user.js';
import { createNotificationForEvent, getNotificationDeliveryPolicy } from '../notification/notification.user.js';
import { findBusinessVoucher, quoteBusinessVoucher, reserveBusinessVoucher } from '../voucher/voucher.service.js';

export const PAYMENT_EXPIRY_MS = 15 * 60 * 1000;
export const COLLECTION_TRANSACTIONS = 'payment_transactions';
export const COLLECTION_ORDERS = 'orders';
export const COLLECTION_USER_COURSES = 'user_courses';
export const COLLECTION_CARTS = 'user_cart_items';
export const COLLECTION_USERS = 'users';
const digest = value => createHash('sha256').update(value).digest('hex');

function executionMode(options) {
  const mode = options.paymentMode ?? process.env.PAYMENT_MODE ?? 'live';
  if (!['live','simulation'].includes(mode)) throw paymentError('Chế độ thanh toán chưa được cấu hình hợp lệ.',503,'PAYMENT_MODE_INVALID');
  return mode;
}
function simulatesMethod(method, options) {
  const mode = executionMode(options);
  const selected = String(options.simulatedMethods ?? process.env.PAYMENT_SIMULATED_METHODS ?? '')
    .split(',').map(value => value.trim()).filter(Boolean);
  if (selected.some(value => !['sepay','momo','zalopay','paypal','apple-pay','swift'].includes(value))) {
    throw paymentError('Danh sách phương thức mô phỏng không hợp lệ.',503,'PAYMENT_MODE_INVALID');
  }
  return mode === 'simulation' || selected.includes(method);
}
function simulationEmailEnabled(options) {
  return String(options.simulationEmail ?? process.env.PAYMENT_SIMULATION_EMAIL) === 'true';
}
function randomPaymentCode(prefix) {
  const date = new Date(Date.now()+7*3600000).toISOString().slice(0,10).replaceAll('-','');
  return prefix==='HD' ? `HD-${date}-${randomBytes(8).toString('hex').toUpperCase()}`
    : `${prefix}${date}${String(randomInt(100000000)).padStart(8,'0')}`;
}
async function reservePaymentCode(db, code, collection, field) {
  if (await db.collection(collection).findOne({[field]:code})) return false;
  try {
    // Existing counters collection and its unique _id reserve codes across requests.
    await db.collection('counters').insertOne({_id:`payment-code:${code}`,code,created_at:new Date()});
    return true;
  } catch(error) { if(error.code===11000)return false; throw error; }
}
async function allocatePaymentIds(db, simulation, options) {
  for(let attempt=0;attempt<5;attempt++) {
    const ids = options.generateIds ? await options.generateIds()
      : simulation ? {orderId:randomPaymentCode('DH'),transactionId:randomPaymentCode('GD')}
      : await generateOrderWithTransaction();
    if(!/^DH\d{16}$/.test(ids?.orderId)||!/^GD\d{16}$/.test(ids?.transactionId))
      throw paymentError('Không sinh được mã thanh toán hợp lệ.',503,'PAYMENT_ID_INVALID');
    if(await reservePaymentCode(db,ids.orderId,COLLECTION_ORDERS,'order_id')
      && await reservePaymentCode(db,ids.transactionId,COLLECTION_TRANSACTIONS,'transaction_id')) return ids;
  }
  throw paymentError('Chưa cấp được mã thanh toán duy nhất. Vui lòng thử lại.',503,'PAYMENT_ID_UNAVAILABLE');
}
async function allocateInvoiceCode(db) {
  for(let attempt=0;attempt<5;attempt++) {
    const code=randomPaymentCode('HD');
    if(await reservePaymentCode(db,code,COLLECTION_TRANSACTIONS,'invoice_code')) return code;
  }
  throw paymentError('Chưa cấp được mã hóa đơn duy nhất.',503,'PAYMENT_ID_UNAVAILABLE');
}
async function finishInternalPayment(tx, options) {
  const db=options.db || await getMongoDb();
  if((tx.is_simulated || tx.payment_method==='free')&&tx.status==='paid') await completePaidOrder(tx.transaction_id,options);
  return sessionView(await db.collection(COLLECTION_TRANSACTIONS).findOne({_id:tx._id}));
}
export function paymentError(message, status = 400, code = 'PAYMENT_INVALID') {
  return Object.assign(new Error(message), { status, code });
}
export function paymentMethod(value) {
  const aliases = { 'bank-transfer':'sepay', sepay:'sepay', atm:'vnpay', vnpay:'vnpay', international:'stripe', stripe:'stripe', swift:'swift', momo:'momo', zalopay:'zalopay', paypal:'paypal', 'apple-pay':'apple-pay' };
  if (typeof value !== 'string' || !Object.hasOwn(aliases,value)) throw paymentError('Phương thức thanh toán không hợp lệ.');
  return aliases[value];
}
export function paymentMoney(value) {
  if (!['number','string'].includes(typeof value) || typeof value==='string'&&!/^\d+(?:\.0+)?$/.test(value)) throw paymentError('Số tiền VND không hợp lệ.');
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > 100000000000) throw paymentError('Số tiền VND không hợp lệ.');
  return amount;
}
export function configured(name) {
  const value = process.env[name];
  if (!value) throw paymentError('Cổng thanh toán chưa được cấu hình.', 503, 'PAYMENT_NOT_CONFIGURED');
  return value;
}
export function bankConfiguration() {
  return { bankId: configured('SEPAY_BANK_ID'), accountNo: configured('SEPAY_ACCOUNT_NO'), accountName: configured('BANK_ACCOUNT_HOLDER') };
}
function requireGatewayConfiguration(method){
  if(['momo','zalopay','paypal','apple-pay'].includes(method))throw paymentError('Phương thức này hiện chỉ khả dụng trong chế độ mô phỏng.',503,'PAYMENT_NOT_CONFIGURED');
  if(method==='swift')throw paymentError('Chuyển khoản SWIFT hiện chỉ khả dụng trong chế độ mô phỏng.',503,'PAYMENT_NOT_CONFIGURED');
  if(method==='sepay'){bankConfiguration();configured('SEPAY_WEBHOOK_KEY');}
  if(method==='stripe'){configured('STRIPE_SECRET_KEY');configured('STRIPE_WEBHOOK_SECRET');new URL(configured('CLIENT_URL').split(',')[0]);}
  if(method==='vnpay'&&(!(process.env.VNP_TMN_CODE||process.env.VNPAY_TMN_CODE)||!(process.env.VNP_HASH_SECRET||process.env.VNPAY_HASH_SECRET)||!(process.env.VNP_RETURN_URL||process.env.VNPAY_RETURN_URL)))throw paymentError('VNPay chưa được cấu hình.',503,'PAYMENT_NOT_CONFIGURED');
}
function paymentLookupQr(transactionId) {
  const origin = (process.env.CLIENT_URL || '').split(',')[0].trim();
  let target;
  try {
    target = new URL('/main/checkout/result', origin);
    const base = new URL(origin);
    if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) throw new Error('Invalid origin');
  } catch {
    return { paymentDetailsUrl: null, paymentQrPayload: null, paymentQrError: 'PAYMENT_LOOKUP_URL_NOT_CONFIGURED' };
  }
  target.searchParams.set('transaction_id', transactionId);
  const value = target.toString();
  return { paymentDetailsUrl: value, paymentQrPayload: value };
}
function sessionView(tx) {
  const bankInfo = tx.payment_method === 'sepay' ? bankConfiguration() : null;
  return { orderId:tx.order_id, transactionId:tx.transaction_id, amount:tx.amount, currency:tx.currency,
    status:tx.status, fulfillmentStatus:tx.fulfillment_status, expiresAt:tx.expires_at,
    ...paymentLookupQr(tx.transaction_id),
    expiresInSeconds:Math.max(0,Math.floor((new Date(tx.expires_at)-Date.now())/1000)),
    paymentMethod:tx.payment_method, paymentUrl:tx.payment_url || '', transferContent:tx.transfer_content,
    ...(tx.is_simulated ? {executionMode:'simulation',isSimulated:true,requestedPaymentMethod:tx.requested_payment_method,
      invoiceCode:tx.invoice_code || null,paymentContent:tx.payment_content} : {}),
    ...(bankInfo ? {bankInfo,qrCodeUrl:`https://qr.sepay.vn/img?acc=${encodeURIComponent(bankInfo.accountNo)}&bank=${encodeURIComponent(bankInfo.bankId)}&amount=${tx.amount}&des=${encodeURIComponent(tx.transfer_content)}&template=compact`} : {}) };
}
export async function paymentTransaction(db, work) {
  if (!db.client?.startSession) throw paymentError('MongoDB cần hỗ trợ transaction để xử lý thanh toán.',503,'PAYMENT_STORAGE_UNAVAILABLE');
  const session = db.client.startSession();
  try { return await session.withTransaction(() => work(session)); }
  catch(error) {
    if (error.code === 20 || error.codeName === 'IllegalOperation') throw paymentError('MongoDB cần replica set hỗ trợ transaction.',503,'PAYMENT_STORAGE_UNAVAILABLE');
    throw error;
  } finally { await session.endSession(); }
}
async function releaseVoucher(db, tx, session) {
  if (!tx.voucher_reserved || tx.voucher_released || !tx.voucher_id) return;
  const result = await db.collection(tx.voucher_collection).updateOne({_id:tx.voucher_id,usage_count:{$gt:0}},{$inc:{usage_count:-1}},{session});
  if(result.matchedCount !== 1) throw paymentError('Không giải phóng được lượt voucher.',503,'VOUCHER_STORAGE_ERROR');
}
async function quoteVoucher(db, code, subtotal, userId, session, courses = []) {
  if(!code)return {discount:0};
  const managed = await findBusinessVoucher(db, code, { session });
  if (managed) {
    const isNewLearner = !await db.collection('user_enrollments').findOne({ $or: [{ user_id: String(userId) }, { userId: String(userId) }] }, { session });
    const quote = quoteBusinessVoucher(managed, courses, { user: { isNewLearner } });
    return reserveBusinessVoucher(db, managed, quote, userId, session);
  }
  let coupon, collection;
  for(const name of ['platform_coupons','payment_vouchers']) {
    coupon=await db.collection(name).findOne({code},{session});
    if(coupon){collection=name;break;}
  }
  if(!coupon)throw paymentError('Mã giảm giá không tồn tại.',400,'VOUCHER_INVALID');
  const now=new Date();
  if ([coupon.starts_at,coupon.expires_at].some(value=>value && !Number.isFinite(new Date(value).getTime())))throw paymentError('Ngày hiệu lực voucher không hợp lệ.',400,'VOUCHER_INVALID');
  if(coupon.course_ids || coupon.instructor_id || coupon.usage_limit_per_user)throw paymentError('Voucher có điều kiện riêng chưa được hỗ trợ ở checkout này.',400,'VOUCHER_SCOPE_UNSUPPORTED');
  const active=coupon.status==='active'||coupon.is_active===true||coupon.is_active===1||coupon.is_active==='1';
  if(!active || (coupon.starts_at && new Date(coupon.starts_at)>now) || (coupon.expires_at && new Date(coupon.expires_at)<=now) ||
     (coupon.allowed_user_ids && !coupon.allowed_user_ids.map(String).includes(String(userId))) ||
     subtotal < Number(coupon.min_order_value ?? coupon.minimum_amount ?? 0)) {
    throw paymentError('Mã giảm giá không áp dụng cho đơn này.',400,'VOUCHER_INVALID');
  }
  const limit=Number(coupon.usage_limit ?? coupon.quantity_limit ?? 0), count=Number(coupon.usage_count || 0);
  if(!Number.isSafeInteger(limit)||limit<0||!Number.isSafeInteger(count)||count<0||limit && count>=limit) throw paymentError('Voucher đã hết lượt hoặc cấu hình không hợp lệ.',400,'VOUCHER_INVALID');
  const value=Number(coupon.discount_value ?? coupon.percent_off ?? 0);
  const type=coupon.discount_type || (coupon.percent_off!==undefined?'percent':'fixed');
  if(!['percent','fixed'].includes(type)||!Number.isFinite(value)||value<0||type==='percent'&&value>100) throw paymentError('Cấu hình voucher không hợp lệ.',400,'VOUCHER_INVALID');
  let discount=type==='percent'?Math.round(subtotal*value/100):paymentMoney(value);
  if(coupon.max_discount!==undefined && coupon.max_discount!==null)discount=Math.min(discount,paymentMoney(coupon.max_discount));
  discount=Math.min(subtotal,discount);
  const held=await db.collection(collection).updateOne({_id:coupon._id,usage_count:coupon.usage_count ?? {$exists:false}},{$inc:{usage_count:1}},{session});
  if(held.matchedCount!==1)throw paymentError('Voucher vừa thay đổi. Vui lòng thử lại.',409,'VOUCHER_CHANGED');
  return {discount,id:coupon._id,collection};
}

export async function createPaymentSession(params = {}, options = {}) {
  const { userId, idempotencyKey, voucherCode='' }=params;
  if(typeof userId!=='string'||!ObjectId.isValid(userId))throw paymentError('Yêu cầu đăng nhập.',401,'UNAUTHORIZED');
  if(typeof idempotencyKey!=='string'||!/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey))throw paymentError('Cần Idempotency-Key dài 16–128 ký tự.',400,'IDEMPOTENCY_REQUIRED');
  if(typeof voucherCode!=='string'||voucherCode.length>64)throw paymentError('Mã voucher không hợp lệ.');
  const gateway=paymentMethod(params.paymentMethod || 'sepay');
  const simulation=simulatesMethod(gateway,options);
  if (gateway === 'swift' && !simulation) throw paymentError('Chuyển khoản SWIFT hiện chỉ khả dụng trong chế độ mô phỏng.', 503, 'PAYMENT_NOT_CONFIGURED');
  const raw=params.courseIds ?? params.courses;
  if(!Array.isArray(raw)||!raw.length||raw.length>50)throw paymentError('Cần danh sách từ 1 đến 50 khóa học.');
  const ids=[...new Set(raw.map(c=>typeof c==='string'?c:c?.id))];
  if(ids.some(id=>typeof id!=='string'||!id.trim()||id.length>100))throw paymentError('Mã khóa học không hợp lệ.');
  ids.sort();
  const requestHash=digest(JSON.stringify({ids,gateway,voucherCode:voucherCode.trim().toUpperCase(),...(simulation?{executionMode:'simulation'}:{})}));
  const _id=`checkout:${digest(`${userId}:${idempotencyKey}`)}`;
  const db=options.db || await getMongoDb();
  const existing=await db.collection(COLLECTION_TRANSACTIONS).findOne({_id});
  if(existing){if(existing.request_hash!==requestHash)throw paymentError('Idempotency-Key đã dùng cho nội dung khác.',409,'IDEMPOTENCY_CONFLICT');return finishInternalPayment(existing,options);}
  const {orderId,transactionId}=await allocatePaymentIds(db,simulation,options);
  try {
    const tx=await paymentTransaction(db,async session=>{
      const previous=await db.collection(COLLECTION_TRANSACTIONS).findOne({_id},{session});
      if(previous){if(previous.request_hash!==requestHash)throw paymentError('Idempotency-Key đã dùng.',409,'IDEMPOTENCY_CONFLICT');return previous;}
      const user=await db.collection('users').findOne({_id:new ObjectId(userId),status:'active',is_active:{$ne:false}},{session});
      if(!user)throw paymentError('Tài khoản không được phép thanh toán.',403,'ACCOUNT_UNAVAILABLE');
      const courses=[];
      for(const id of ids){
        const query=[{course_id:id},...(ObjectId.isValid(id)?[{_id:new ObjectId(id)}]:[])];
        const course=await db.collection('courses').findOne({$or:query},{session});
        if(!course||course.status!=='published'||course.admin_hidden===true)throw paymentError('Khóa học không tồn tại hoặc ngừng bán.',400,'COURSE_UNAVAILABLE');
        if(course.currency && String(course.currency).toUpperCase()!=='VND')throw paymentError('Khóa học không sử dụng tiền VND.',400,'COURSE_UNAVAILABLE');
        const canonical=String(course.course_id || course._id);
        if(courses.some(c=>c.id===canonical))continue;
        const allIds=[canonical,String(course._id)];
        const filter={$or:[{user_id:userId,course_id:{$in:allIds}},{userId,courseId:{$in:allIds}}]};
        for(const name of ['user_courses','user_enrollments'])if(await db.collection(name).findOne(filter,{session}))throw paymentError('Bạn đã sở hữu khóa học này.',409,'COURSE_ALREADY_OWNED');
        const price=paymentMoney(course.price ?? course.original_price);
        courses.push({id:canonical,aliases:allIds,instructor_id:course.instructor_id || null,rating:course.rating ?? course.average_rating ?? null,title:String(course.title || 'Khóa học ThinkUp'),price,
          original_price:paymentMoney(course.original_price ?? price),thumbnail:course.thumbnail_url || ''});
      }
      const saleSubtotal=paymentMoney(courses.reduce((sum,c)=>sum+c.price,0));
      const voucher=await quoteVoucher(db,voucherCode.trim().toUpperCase(),saleSubtotal,userId,session,courses);
      const amount=paymentMoney(saleSubtotal-voucher.discount);
      const method=simulation?'simulation':amount===0?'free':gateway;
      if(!simulation)requireGatewayConfiguration(method);
      const now=new Date(), expires=new Date(now.getTime()+PAYMENT_EXPIRY_MS);
      const summary={courses,subtotal:courses.reduce((sum,c)=>sum+c.original_price,0),sale_subtotal:saleSubtotal,voucher_code:voucherCode.trim().toUpperCase(),voucher_discount:voucher.discount,voucher_sponsor:voucher.sponsor||null,voucher_instructor_id:voucher.instructorId||null,voucher_eligible_course_ids:voucher.eligibleCourseIds||[],voucher_allocations:voucher.allocations||[],total:amount};
      const transaction={_id,transaction_id:transactionId,order_id:orderId,user_id:userId,payment_method:method,amount,currency:'VND',
        status:simulation||amount===0?'paid':'pending',fulfillment_status:'pending',request_hash:requestHash,
        transfer_content:`THINKUP ${transactionId}`,created_at:now,expires_at:expires,paid_at:simulation||amount===0?now:null,
        ...(simulation?{execution_mode:'simulation',is_simulated:true,requested_payment_method:gateway,
          payment_content:`Thanh toán mô phỏng đơn hàng ${orderId} (${transactionId})`,
          sandbox_code:`SIM-${randomUUID()}`,actual_paid_amount:amount}:{}),
        order_summary:JSON.stringify(summary),voucher_id:voucher.id || null,voucher_collection:voucher.collection || null,
        voucher_reserved:Boolean(voucher.id),voucher_released:false,email_status:simulation&&!simulationEmailEnabled(options)?'suppressed':'pending',
        ...(simulation&&!simulationEmailEnabled(options)?{email_suppressed_reason:'simulated_payment'}:{})};
      await db.collection(COLLECTION_ORDERS).insertOne({_id,order_id:orderId,user_id:userId,...summary,currency:'VND',status:simulation||amount===0?'paid':'pending',created_at:now,expires_at:expires,
        ...(simulation?{execution_mode:'simulation',is_simulated:true}:{})},{session});
      await db.collection(COLLECTION_TRANSACTIONS).insertOne(transaction,{session});
      return transaction;
    });
    return await finishInternalPayment(tx,options);
  }catch(error){
    if(error.code===11000){const concurrent=await db.collection(COLLECTION_TRANSACTIONS).findOne({_id});if(concurrent&&concurrent.request_hash===requestHash)return finishInternalPayment(concurrent,options);throw paymentError('Đơn vừa được tạo. Vui lòng kiểm tra lại.',409,'IDEMPOTENCY_CONFLICT');}
    throw error;
  }
}

export async function retryPaymentSession({userId,orderId,idempotencyKey,paymentMethod:method},options={}){
  if(executionMode(options)==='simulation')throw paymentError('Luồng mô phỏng tự hoàn tất đơn hợp lệ, không tạo lại phiên cổng thanh toán.',409,'ORDER_NOT_PAYABLE');
  if(typeof idempotencyKey!=='string'||!/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey))throw paymentError('Cần Idempotency-Key hợp lệ.',400,'IDEMPOTENCY_REQUIRED');
  const gateway=paymentMethod(method), db=options.db || await getMongoDb();
  const simulation=simulatesMethod(gateway,options);
  if(!simulation)requireGatewayConfiguration(gateway);
  const _id=`checkout:${digest(`${userId}:${idempotencyKey}`)}`,requestHash=digest(JSON.stringify({orderId,gateway,...(simulation?{executionMode:'simulation'}:{})}));
  const ids=await allocatePaymentIds(db,simulation,options);
  const tx=await paymentTransaction(db,async session=>{
    const existing=await db.collection(COLLECTION_TRANSACTIONS).findOne({_id},{session});
    if(existing){if(existing.request_hash!==requestHash)throw paymentError('Idempotency-Key đã dùng.',409,'IDEMPOTENCY_CONFLICT');return existing;}
    const order=await db.collection(COLLECTION_ORDERS).findOne({order_id:orderId,user_id:userId},{session});
    if(!order)throw paymentError('Không tìm thấy đơn hàng của bạn.',404,'PAYMENT_NOT_FOUND');
    if(order.status!=='pending'||new Date(order.expires_at)<=new Date())throw paymentError('Đơn không còn cho phép thử thanh toán.',409,'ORDER_NOT_PAYABLE');
    const previous=await db.collection(COLLECTION_TRANSACTIONS).findOne({order_id:orderId,status:'pending'},{session});
    if(!previous)throw paymentError('Không có lần thanh toán đang chờ.',409,'ORDER_NOT_PAYABLE');
    await db.collection(COLLECTION_TRANSACTIONS).updateOne({_id:previous._id,status:'pending'},{$set:{status:'cancelled',voucher_reserved:false,updated_at:new Date()}},{session});
    const next={...previous,_id,transaction_id:ids.transactionId,payment_method:gateway,request_hash:requestHash,
      status:'pending',payment_url:'',gateway_session_id:null,transfer_content:`THINKUP ${ids.transactionId}`,created_at:new Date()};
    if(simulation)Object.assign(next,{
      payment_method:'simulation',status:'paid',paid_at:new Date(),execution_mode:'simulation',is_simulated:true,
      requested_payment_method:gateway,actual_paid_amount:previous.amount,sandbox_code:`SIM-${randomUUID()}`,
      payment_content:`Thanh toán mô phỏng đơn hàng ${orderId} (${ids.transactionId})`,
      email_status:simulationEmailEnabled(options)?'pending':'suppressed',
      email_suppressed_reason:simulationEmailEnabled(options)?null:'simulated_payment',
    });
    await db.collection(COLLECTION_TRANSACTIONS).insertOne(next,{session});
    // Serialize retry attempts against the order, including concurrent requests with distinct keys.
    await db.collection(COLLECTION_ORDERS).updateOne({_id:order._id,status:'pending'},{$set:{active_transaction_id:ids.transactionId,updated_at:new Date(),
      ...(simulation?{status:'paid',execution_mode:'simulation',is_simulated:true}:{})}},{session});
    return next;
  });
  return finishInternalPayment(tx,options);
}

export async function checkPaymentStatus(transactionId, userId, options = {}) {
  const db=options.db || await getMongoDb();
  let tx=await db.collection(COLLECTION_TRANSACTIONS).findOne({transaction_id:transactionId});
  if(!tx) throw paymentError('Không tìm thấy giao dịch của bạn.',404,'PAYMENT_NOT_FOUND');
  if(userId && String(tx.user_id)!==String(userId)) {
    // Check if user ID matches alternative representation (e.g. integer vs ObjectId)
    const user = await db.collection('users').findOne({
      $or: [
        { id: String(userId) },
        ...(ObjectId.isValid(String(userId)) ? [{ _id: new ObjectId(String(userId)) }] : [])
      ]
    });
    const matchesUser = user && (String(user._id) === String(tx.user_id) || String(user.id) === String(tx.user_id));
    if (!matchesUser) throw paymentError('Không tìm thấy giao dịch của bạn.',404,'PAYMENT_NOT_FOUND');
  }
  if(tx.status==='pending'&&new Date(tx.expires_at)<=new Date()){
    await paymentTransaction(db,async session=>{
      const expired=await db.collection(COLLECTION_TRANSACTIONS).findOneAndUpdate({transaction_id:transactionId,status:'pending'},{$set:{status:'expired',voucher_released:tx.voucher_reserved,updated_at:new Date()}},{session,returnDocument:'before'});
      if(expired){await releaseVoucher(db,expired,session);await db.collection(COLLECTION_ORDERS).updateOne({order_id:tx.order_id,status:'pending'},{$set:{status:'expired'}},{session});}
    });
    tx=await db.collection(COLLECTION_TRANSACTIONS).findOne({transaction_id:transactionId});
  }
  if(tx.status==='paid'){try{await completePaidOrder(transactionId,options);}catch{
      await db.collection(COLLECTION_TRANSACTIONS).updateOne({_id:tx._id,status:'paid'},{$set:{fulfillment_error_at:new Date()}});
    }
    tx=await db.collection(COLLECTION_TRANSACTIONS).findOne({transaction_id:transactionId});}
  if(['failed','expired'].includes(tx.status))await sendPaymentReceipt(tx,options);
  return tx;
}

/** Called only after a provider failure has been authenticated and matched. */
export async function recordPaymentFailure(transactionId,gateway,options={}) {
  const db=options.db || await getMongoDb();
  await paymentTransaction(db,async session=>{
    const tx=await db.collection(COLLECTION_TRANSACTIONS).findOneAndUpdate(
      {transaction_id:transactionId,payment_method:gateway,status:'pending'},
      {$set:{status:'failed',email_status:'pending',voucher_released:true,updated_at:new Date()}},
      {session,returnDocument:'before'});
    if(!tx)return;
    await releaseVoucher(db,tx,session);
    await db.collection(COLLECTION_ORDERS).updateOne({order_id:tx.order_id,status:'pending'},{$set:{status:'failed',updated_at:new Date()}},{session});
  });
  const tx=await db.collection(COLLECTION_TRANSACTIONS).findOne({transaction_id:transactionId,payment_method:gateway});
  if(tx?.status==='failed')await sendPaymentReceipt(tx,options);
  return {success:true};
}

export async function fulfillPaymentSuccess(params, options = {}) {
  const {transactionId,gateway,gatewayTransactionNo,gatewayEventId,paidAmount,currency,paidAt}=params;
  if(typeof transactionId!=='string'||!/^GD\d{16}$/.test(transactionId))throw paymentError('Mã giao dịch không hợp lệ.');
  if(!['sepay','vnpay','stripe'].includes(gateway)||typeof gatewayTransactionNo!=='string'||!gatewayTransactionNo||gatewayTransactionNo.length>200)throw paymentError('Thiếu tham chiếu thanh toán đã xác minh.');
  const amount=paymentMoney(paidAmount);
  if(amount===0)throw paymentError('Giao dịch cổng thanh toán phải có số tiền dương.');
  const occurred=new Date(paidAt);
  if(!Number.isFinite(occurred.getTime())||occurred.getTime()>Date.now()+300000)throw paymentError('Thời gian thanh toán không hợp lệ.');
  const db=options.db || await getMongoDb();
  const receiptId=`receipt:${digest(`${gateway}:${gatewayTransactionNo}`)}`;
  const recorded=await paymentTransaction(db,async session=>{
    const prior=await db.collection(COLLECTION_TRANSACTIONS).findOne({_id:receiptId},{session});
    if(prior){if(prior.linked_transaction_id!==transactionId||prior.amount!==amount||prior.currency!==currency)throw paymentError('Tham chiếu cổng đã dùng cho giao dịch khác.',409,'GATEWAY_REPLAY');return {transactionId,duplicate:true,unmatched:prior.review_reason==='unknown_transaction'};}
    const tx=await db.collection(COLLECTION_TRANSACTIONS).findOne({transaction_id:transactionId},{session});
    if(!tx){
      await db.collection(COLLECTION_TRANSACTIONS).insertOne({_id:receiptId,record_type:'gateway_receipt',linked_transaction_id:transactionId,
        gateway,gateway_transaction_no:gatewayTransactionNo,amount,currency,occurred_at:occurred,created_at:new Date(),review_reason:'unknown_transaction'},{session});
      return {unmatched:true};
    }
    if(tx.payment_method!==gateway)throw paymentError('Thông báo sai cổng thanh toán.',409,'GATEWAY_MISMATCH');
    const order=await db.collection(COLLECTION_ORDERS).findOne({order_id:tx.order_id},{session});
    if(!order)throw paymentError('Thiếu đơn hàng đối chiếu.',503,'FULFILLMENT_DATA_INVALID');
    let reason='';
    if(!tx.request_hash||!tx.fulfillment_status)reason='legacy_unverified_quote';
    else if(currency!=='VND'||amount!==tx.amount)reason='amount_or_currency_mismatch';
    else if(['paid','success','needs_review'].includes(tx.status)||order.status==='completed')reason='duplicate_payment';
    else if(!['pending','expired'].includes(tx.status))reason='order_not_payable';
    else if(occurred>new Date(tx.expires_at)||tx.voucher_released)reason='late_payment';
    await db.collection(COLLECTION_TRANSACTIONS).insertOne({_id:receiptId,record_type:'gateway_receipt',linked_transaction_id:transactionId,
      gateway,gateway_transaction_no:gatewayTransactionNo,gateway_event_id:gatewayEventId || gatewayTransactionNo,amount,currency,
      occurred_at:occurred,created_at:new Date(),review_reason:reason || null},{session});
    if(!['paid','success'].includes(tx.status)){
      await db.collection(COLLECTION_TRANSACTIONS).updateOne({_id:tx._id},{$set:{status:reason?'needs_review':'paid',review_reason:reason || null,
        paid_at:occurred,actual_paid_amount:amount,gateway_transaction_no:gatewayTransactionNo,updated_at:new Date()}},{session});
      if(order.status!=='completed')await db.collection(COLLECTION_ORDERS).updateOne({order_id:tx.order_id},{$set:{status:reason?'needs_review':'paid',paid_at:occurred}},{session});
    }
    return {transactionId,duplicate:false};
  });
  if(recorded.unmatched)return {success:true,status:'needs_review',unmatched:true};
  const tx=await db.collection(COLLECTION_TRANSACTIONS).findOne({transaction_id:transactionId});
  if(tx.status==='paid')await completePaidOrder(transactionId,options);
  const final=await db.collection(COLLECTION_TRANSACTIONS).findOne({transaction_id:transactionId});
  return {success:true,alreadyProcessed:recorded.duplicate,orderId:final.order_id,transactionId,status:final.status,fulfillmentStatus:final.fulfillment_status};
}

export async function recordUnmatchedTransfer({gatewayTransactionNo,paidAmount,paidAt},options={}){
  const db=options.db || await getMongoDb(), amount=paymentMoney(paidAmount), occurred=new Date(paidAt);
  if(!amount||!Number.isFinite(occurred.getTime())||occurred.getTime()>Date.now()+300000)throw paymentError('Thông tin chuyển tiền không hợp lệ.');
  const _id=`receipt:${digest(`sepay:${gatewayTransactionNo}`)}`;
  await paymentTransaction(db,async session=>{
    const existing=await db.collection(COLLECTION_TRANSACTIONS).findOne({_id},{session});
    if(existing){if(existing.linked_transaction_id||existing.amount!==amount)throw paymentError('Tham chiếu đã được sử dụng.',409,'GATEWAY_REPLAY');return;}
    await db.collection(COLLECTION_TRANSACTIONS).insertOne({_id,record_type:'gateway_receipt',linked_transaction_id:null,
      gateway:'sepay',gateway_transaction_no:gatewayTransactionNo,amount,currency:'VND',occurred_at:occurred,created_at:new Date(),review_reason:'missing_transfer_reference'},{session});
  });
  return {success:true,status:'needs_review',unmatched:true};
}

export async function completePaidOrder(transactionId, options = {}) {
  const db=options.db || await getMongoDb();
  const before=await db.collection(COLLECTION_TRANSACTIONS).findOne({transaction_id:transactionId});
  const invoiceCode=before?.is_simulated&&before.status==='paid'&&!before.invoice_code ? await allocateInvoiceCode(db) : null;
  const completed=await paymentTransaction(db,async session=>{
    const tx=await db.collection(COLLECTION_TRANSACTIONS).findOne({transaction_id:transactionId},{session});
    if(!tx)throw paymentError('Không tìm thấy giao dịch.',404,'PAYMENT_NOT_FOUND');
    if(tx.status==='success'){
      await createPaymentNotification(tx,db,session,options);
      return tx;
    }
    if(tx.status!=='paid')throw paymentError('Đơn chưa được xác minh đã nhận tiền.',409,'PAYMENT_NOT_PAID');
    const user=await db.collection('users').findOne({_id:new ObjectId(tx.user_id),status:'active',is_active:{$ne:false}},{session});
    if(!user){
      await db.collection(COLLECTION_TRANSACTIONS).updateOne({_id:tx._id},{$set:{status:'needs_review',review_reason:'account_unavailable'}},{session});
      await db.collection(COLLECTION_ORDERS).updateOne({order_id:tx.order_id},{$set:{status:'needs_review'}},{session});
      return null;
    }
    const summary=JSON.parse(tx.order_summary);
    if(!Array.isArray(summary.courses)||!summary.courses.length)throw paymentError('Thiếu dữ liệu cấp quyền.',503,'FULFILLMENT_DATA_INVALID');
    for(const course of summary.courses){
      const aliases=course.aliases || [course.id];
      for(const name of ['user_enrollments','user_courses']){
        const owned=await db.collection(name).findOne({$or:[{user_id:tx.user_id,course_id:{$in:aliases}},{userId:tx.user_id,courseId:{$in:aliases}}]},{session});
        if(owned&&owned.order_id!==tx.order_id){
          await db.collection(COLLECTION_TRANSACTIONS).updateOne({_id:tx._id},{$set:{status:'needs_review',review_reason:'course_already_owned'}},{session});
          await db.collection(COLLECTION_ORDERS).updateOne({order_id:tx.order_id},{$set:{status:'needs_review'}},{session});
          return null;
        }
      }
    }
    const now=new Date();
    for(const course of summary.courses){
      for(const name of ['user_enrollments','user_courses']){
        const aliases=course.aliases || [course.id];
        const filter={$or:[{user_id:tx.user_id,course_id:{$in:aliases}},{userId:tx.user_id,courseId:{$in:aliases}}]};
        if(!await db.collection(name).findOne(filter,{session}))await db.collection(name).updateOne({_id:`enrollment:${digest(`${tx.user_id}:${course.id}`)}`},
          {$setOnInsert:{user_id:tx.user_id,course_id:course.id,title:course.title,enrolled_at:now,order_id:tx.order_id,transaction_id:transactionId,progress:0,status:'active'}},{upsert:true,session});
      }
    }
    const ids=summary.courses.flatMap(c=>c.aliases || [c.id]);
    await db.collection(COLLECTION_CARTS).deleteMany({$and:[{$or:[{user_id:tx.user_id},{userId:tx.user_id}]},{$or:[{course_id:{$in:ids}},{courseId:{$in:ids}}]}]},{session});
    const orderUpdate=await db.collection(COLLECTION_ORDERS).updateOne({order_id:tx.order_id},{$set:{status:'completed',updated_at:now}},{session});
    if(orderUpdate.matchedCount!==1)throw paymentError('Không tìm thấy đơn để hoàn tất.',503,'FULFILLMENT_DATA_INVALID');
    const invoice=tx.is_simulated ? {invoice_code:tx.invoice_code || invoiceCode} : {};
    if(tx.is_simulated&&!invoice.invoice_code)throw paymentError('Chưa tạo được mã hóa đơn.',503,'PAYMENT_ID_UNAVAILABLE');
    await db.collection(COLLECTION_TRANSACTIONS).updateOne({_id:tx._id,status:'paid'},{$set:{status:'success',fulfillment_status:'completed',updated_at:now,...invoice}},{session});
    await createPaymentNotification(tx,db,session,options);
    return {...tx,status:'success',fulfillment_status:'completed',...invoice};
  });
  if(completed)await sendPaymentReceipt(completed,options);
  return completed;
}

async function createPaymentNotification(tx,db,session,options){
  return createNotificationForEvent(String(tx.user_id),{
    eventKey:`order-completed:${tx.order_id}`,category:'transactions',kind:'purchase',
    title:'Mua khóa học thành công',
    message:`Đơn hàng ${tx.order_id} đã hoàn tất. Bạn có thể bắt đầu học.`,
    sourceType:'order',sourceId:tx.order_id,href:`/main/profile/billing/${encodeURIComponent(tx.order_id)}`,
  },{...options,db,session});
}

export async function recoverPayments(options={}){
  const db=options.db || await getMongoDb();
  const rows=[];
  for(const filter of [{status:'pending',expires_at:{$lte:new Date()}},{status:'paid'},
    {status:{$in:['success','failed','expired']},email_status:{$nin:['sent','suppressed']},$or:[{email_lease_until:{$exists:false}},{email_lease_until:{$lte:new Date()}}]}]) {
    rows.push(...await db.collection(COLLECTION_TRANSACTIONS).find(filter).limit(50).toArray());
  }
  let failed=0;
  for(const tx of rows){
    try{
      if(['success','failed','expired'].includes(tx.status))await sendPaymentReceipt(tx,options);
      else await checkPaymentStatus(tx.transaction_id,tx.user_id,options);
    }catch{failed++;}
  }
  return {checked:rows.length,failed};
}
async function sendPaymentReceipt(tx,options){
  const db=options.db || await getMongoDb(), now=new Date(),lease=randomUUID();
  if(tx.is_simulated&&!simulationEmailEnabled(options)){
    await db.collection(COLLECTION_TRANSACTIONS).updateOne({_id:tx._id,status:'success'},{$set:{email_status:'suppressed',email_suppressed_reason:'simulated_payment'}});
    return;
  }
  const claimed=await db.collection(COLLECTION_TRANSACTIONS).findOneAndUpdate({_id:tx._id,status:tx.status,email_status:{$nin:['sent','suppressed']},$or:[{email_lease_until:{$exists:false}},{email_lease_until:{$lt:now}}]},
    {$set:{email_lease:lease,email_lease_until:new Date(now.getTime()+60000)}},{returnDocument:'after'});
  if(!claimed)return;
  try{
    const preferences=await getPaymentPreferences(String(tx.user_id),{...options,db});
    if(tx.status==='success'&&!preferences.invoiceEmail){
      await db.collection(COLLECTION_TRANSACTIONS).updateOne({_id:tx._id,email_lease:lease},{$set:{
        email_status:'suppressed',email_suppressed_reason:'invoice_email_disabled',
        email_suppressed_at:new Date(),email_preference_revision:preferences.revision,email_lease_until:new Date(0),
      }});
      return;
    }
    const policy=await getNotificationDeliveryPolicy(String(tx.user_id),'transactions',{...options,db});
    if(!policy.email){
      const deferred=policy.reason==='dnd';
      const deadline=policy.dndEndsAt?Date.parse(policy.dndEndsAt):Date.now()+300000;
      await db.collection(COLLECTION_TRANSACTIONS).updateOne({_id:tx._id,email_lease:lease},{$set:{
        email_status:deferred?'pending':'suppressed',email_suppressed_reason:deferred?'dnd':'notification_email_disabled',
        email_lease_until:new Date(deferred?Math.max(Date.now()+1000,deadline):0),
      }});
      return;
    }
    const user=await db.collection('users').findOne({_id:new ObjectId(tx.user_id)});
    if(!user?.email)throw new Error('No receipt destination');
    const summary=JSON.parse(tx.order_summary);
    const successful=tx.status==='success';
    const failureText=`Thanh toán ${tx.status==='expired'?'đã hết hạn':'không thành công'} cho đơn hàng ${tx.order_id}. Khóa học chưa được cấp từ giao dịch này. Vui lòng kiểm tra đơn hàng trước khi thanh toán lại. Nếu tài khoản đã bị trừ tiền, hãy liên hệ hỗ trợ ThinkUp để đối soát.`;
    const result=await (options.sendEmail || sendEmail)({to:user.email,subject:successful?`[ThinkUp] Biên lai đơn hàng ${tx.order_id}`:`[ThinkUp] Thanh toán chưa hoàn tất — ${tx.order_id}`,
      ...(successful?{
      html:renderPaymentReceiptEmail({userName:user.full_name,orderId:tx.order_id,transactionId:tx.transaction_id,paymentMethod:tx.requested_payment_method || tx.payment_method,
        totalAmount:tx.amount,courses:summary.courses,paidAt:new Date(tx.paid_at).toISOString(),clientUrl:process.env.CLIENT_URL}),
      text:`Thanh toán thành công đơn hàng ${tx.order_id}. Tổng tiền: ${tx.amount} VND.`}:{text:failureText})});
    if(result?.sent===false||!result?.accepted?.length)throw new Error('Receipt delivery unavailable');
    await db.collection(COLLECTION_TRANSACTIONS).updateOne({_id:tx._id,email_lease:lease},{$set:{email_status:'sent',email_sent_at:new Date()}});
  }catch{
    await db.collection(COLLECTION_TRANSACTIONS).updateOne({_id:tx._id,email_lease:lease},{$set:{email_status:'pending',email_lease_until:new Date(Date.now()+300000)}});
  }
}
