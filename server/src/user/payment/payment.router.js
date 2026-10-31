import { getMongoDb } from '../db.js';
import { createPaymentSession, retryPaymentSession, checkPaymentStatus, paymentError } from './payment.service.js';
import { handleSepayWebhook } from './gateways/sepay.service.js';
import { createVnpayPaymentUrl, verifyVnpayCallback } from './gateways/vnpay.service.js';
import { createStripeCheckoutSession, handleStripeWebhookEvent } from './gateways/stripe.service.js';

export function createPaymentRouter(express,requireAuth,options={}){
  const router=express.Router();
  async function initialize(session,req){
    if(session.status!=='pending')return session;
    const db=options.db || await getMongoDb();
    if(session.paymentMethod==='vnpay')session.paymentUrl=createVnpayPaymentUrl({transactionId:session.transactionId,amount:session.amount,
      orderInfo:`Thanh toan don hang ${session.orderId}`,ipAddr:req.ip || req.socket?.remoteAddress || '127.0.0.1',bankCode:req.body.bankCode,expiresAt:session.expiresAt});
    else if(session.paymentMethod==='stripe'&&!session.paymentUrl){
      const checkout=await createStripeCheckoutSession(session,options);
      const saved=await db.collection('payment_transactions').updateOne({transaction_id:session.transactionId,status:'pending'},
        {$set:{payment_url:checkout.url,gateway_session_id:checkout.sessionId,updated_at:new Date()}});
      if(saved.matchedCount!==1)throw paymentError('Phiên thanh toán đã thay đổi.',409,'ORDER_NOT_PAYABLE');
      session.paymentUrl=checkout.url;
    }
    return session;
  }
  router.post('/create-session',requireAuth,async(req,res,next)=>{
    try{
      const session=await createPaymentSession({userId:req.userId,courseIds:req.body.courseIds,courses:req.body.courses,
        paymentMethod:req.body.paymentMethod,voucherCode:req.body.voucherCode,idempotencyKey:req.get('Idempotency-Key')},options);
      res.set('Cache-Control','no-store');
      res.status(201).json({success:true,message:'Đã tạo đơn thanh toán.',data:await initialize(session,req)});
    }catch(error){next(error);}
  });
  router.post('/retry/:orderId',requireAuth,async(req,res,next)=>{
    try{
      const session=await retryPaymentSession({userId:req.userId,orderId:req.params.orderId,paymentMethod:req.body.paymentMethod,
        idempotencyKey:req.get('Idempotency-Key')},options);
      res.set('Cache-Control','no-store');
      res.status(201).json({success:true,data:await initialize(session,req)});
    }catch(error){next(error);}
  });
  router.get('/status/:id',requireAuth,async(req,res,next)=>{
    try{
      const tx=await checkPaymentStatus(req.params.id,req.userId,options);
      res.set('Cache-Control','no-store');
      res.json({success:true,transactionId:tx.transaction_id,orderId:tx.order_id,status:tx.status,fulfillmentStatus:tx.fulfillment_status,
        amount:tx.amount,currency:tx.currency,paidAt:tx.paid_at,expiresAt:tx.expires_at,
        remainingSeconds:Math.max(0,Math.floor((new Date(tx.expires_at)-Date.now())/1000))});
    }catch(error){next(error);}
  });
  router.post('/webhook/sepay',async(req,res,next)=>{
    try{res.json(await handleSepayWebhook(req.body,req.get('authorization') || '',options));}catch(error){next(error);}
  });
  router.post('/webhook/stripe',async(req,res,next)=>{
    try{res.json(await handleStripeWebhookEvent(req.rawBody,req.get('stripe-signature'),options));}catch(error){next(error);}
  });
  router.get('/vnpay/callback',async(req,res,next)=>{
    try{
      const result=await verifyVnpayCallback(req.query,{...options,settle:false});
      const client=new URL((process.env.CLIENT_URL || 'http://localhost:4200').split(',')[0]);
      const target=new URL('/main/checkout/result',client);
      if(typeof req.query.vnp_TxnRef==='string')target.searchParams.set('transaction_id',req.query.vnp_TxnRef);
      target.searchParams.set('status',result.isSuccess?'pending':'failed');
      res.redirect(target.toString());
    }catch(error){next(error);}
  });
  router.get('/vnpay/ipn',async(req,res)=>{
    try{const result=await verifyVnpayCallback(req.query,{...options,settle:true});res.json({RspCode:result.code || '99',Message:result.message});}
    catch(error){res.json({RspCode:error.code==='PAYMENT_NOT_FOUND'?'01':error.code==='GATEWAY_REPLAY'?'02':'99',Message:'Chưa xác nhận được giao dịch.'});}
  });
  // Removed the public simulation route: there is no HTTP path that can mark an unpaid order as paid.
  router.use((error,req,res,next)=>{
    const status=error.status || 500;
    if(status>=500 && !error.status)return res.status(500).json({message:'Không xử lý được thanh toán. Vui lòng thử lại.',code:'PAYMENT_INTERNAL_ERROR'});
    res.status(status).json({message:error.message,code:error.code || 'PAYMENT_INVALID'});
  });
  return router;
}
