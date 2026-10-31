import { createHmac, timingSafeEqual } from 'node:crypto';
import { getMongoDb } from '../../db.js';
import { configured, paymentMoney, paymentError, fulfillPaymentSuccess } from '../payment.service.js';

export async function stripeRequest(path, {method='GET',params,idempotencyKey}={}, options={}) {
  const secret=configured('STRIPE_SECRET_KEY');
  let response;
  try{response=await (options.fetch || fetch)(`https://api.stripe.com/v1/${path}`,{method,
    headers:{Authorization:`Bearer ${secret}`,...(params?{'Content-Type':'application/x-www-form-urlencoded'}:{}),...(idempotencyKey?{'Idempotency-Key':idempotencyKey}:{})},
    ...(params?{body:params.toString()}:{}),signal:AbortSignal.timeout(10000)});}catch{throw paymentError('Không kết nối được Stripe.',503,'GATEWAY_UNAVAILABLE');}
  if(!response.ok)throw paymentError('Stripe chưa xử lý được yêu cầu.',503,'GATEWAY_UNAVAILABLE');
  try{return await response.json();}catch{throw paymentError('Phản hồi Stripe không hợp lệ.',503,'GATEWAY_UNAVAILABLE');}
}
export async function createStripeCheckoutSession({transactionId,orderId,amount},options={}){
  configured('STRIPE_WEBHOOK_SECRET');
  const client=new URL(configured('CLIENT_URL').split(',')[0]);
  const success=new URL('/main/checkout/result',client);success.searchParams.set('transaction_id',transactionId);
  const cancel=new URL(success);cancel.searchParams.set('status','cancelled');
  const params=new URLSearchParams({mode:'payment',success_url:success.toString(),cancel_url:cancel.toString(),client_reference_id:transactionId,
    'metadata[transactionId]':transactionId,'metadata[orderId]':orderId,
    'line_items[0][price_data][currency]':'vnd','line_items[0][price_data][product_data][name]':`Đơn hàng ThinkUp ${orderId}`,
    'line_items[0][price_data][unit_amount]':String(paymentMoney(amount)),'line_items[0][quantity]':'1'});
  const result=await stripeRequest('checkout/sessions',{method:'POST',params,idempotencyKey:`thinkup-${transactionId}`},options);
  if(typeof result.id!=='string'||typeof result.url!=='string'||new URL(result.url).protocol!=='https:')throw paymentError('Phiên Stripe không hợp lệ.',503,'GATEWAY_UNAVAILABLE');
  return {sessionId:result.id,url:result.url};
}
export function verifyStripeEvent(rawBody,signature,now=Date.now()){
  const secret=configured('STRIPE_WEBHOOK_SECRET');
  if(!Buffer.isBuffer(rawBody)||typeof signature!=='string')throw paymentError('Thiếu chữ ký Stripe.',400,'WEBHOOK_SIGNATURE_INVALID');
  const parts=signature.split(',').map(s=>s.trim().split('='));
  const timestamp=parts.find(([key])=>key==='t')?.[1];
  if(!/^\d+$/.test(timestamp || '')||Math.abs(now/1000-Number(timestamp))>300)throw paymentError('Chữ ký Stripe hết hiệu lực.',400,'WEBHOOK_SIGNATURE_INVALID');
  const expected=createHmac('sha256',secret).update(`${timestamp}.`).update(rawBody).digest();
  const valid=parts.some(([key,value])=>key==='v1'&&/^[a-f0-9]{64}$/i.test(value || '')&&timingSafeEqual(expected,Buffer.from(value,'hex')));
  if(!valid)throw paymentError('Chữ ký Stripe không hợp lệ.',400,'WEBHOOK_SIGNATURE_INVALID');
  try{return JSON.parse(rawBody.toString('utf8'));}catch{throw paymentError('Sự kiện Stripe không hợp lệ.');}
}
export async function handleStripeWebhookEvent(rawBody,signature,options={}){
  const event=verifyStripeEvent(rawBody,signature);
  if(!['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type))return {success:true,ignored:true};
  if(typeof event.id!=='string'||!Number.isFinite(event.created))throw paymentError('Thiếu định danh sự kiện Stripe.');
  const object=event.data?.object;
  if(typeof object?.id!=='string'||!/^cs_[A-Za-z0-9_]+$/.test(object.id))throw paymentError('Thiếu Checkout Session.');
  const checkout=await stripeRequest(`checkout/sessions/${encodeURIComponent(object.id)}`,{},options);
  if(checkout.id!==object.id||checkout.payment_status!=='paid'||checkout.status!=='complete')return {success:true,ignored:true};
  const transactionId=checkout.client_reference_id;
  const db=options.db || await getMongoDb();
  const tx=await db.collection('payment_transactions').findOne({transaction_id:transactionId});
  if(!tx||tx.payment_method!=='stripe')throw paymentError('Sai tham chiếu Stripe.',409,'GATEWAY_MISMATCH');
  if(tx.gateway_session_id!==checkout.id)throw paymentError('Phiên Stripe chưa được lưu hoặc không khớp.',503,'GATEWAY_SESSION_MISMATCH');
  if(checkout.metadata?.transactionId!==transactionId||checkout.metadata?.orderId!==tx.order_id)throw paymentError('Metadata Stripe không khớp.',409,'GATEWAY_MISMATCH');
  return fulfillPaymentSuccess({transactionId,gateway:'stripe',gatewayTransactionNo:checkout.id,gatewayEventId:event.id,
    paidAmount:checkout.amount_total,currency:String(checkout.currency).toUpperCase(),paidAt:new Date(event.created*1000)},options);
}
