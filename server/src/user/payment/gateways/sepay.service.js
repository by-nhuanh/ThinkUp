import { timingSafeEqual } from 'node:crypto';
import { configured, paymentMoney, paymentError, fulfillPaymentSuccess, recordUnmatchedTransfer } from '../payment.service.js';

export async function handleSepayWebhook(payload,authHeader='',options={}){
  const expected=Buffer.from(`Apikey ${configured('SEPAY_WEBHOOK_KEY')}`);
  const supplied=Buffer.from(typeof authHeader==='string'?authHeader:'');
  if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))throw paymentError('Không được phép gọi webhook SePay.',401,'WEBHOOK_UNAUTHORIZED');
  if(!payload||typeof payload!=='object')throw paymentError('Payload SePay không hợp lệ.');
  if(payload.transferType!=='in')return {success:true,ignored:true};
  if(String(payload.accountNumber)!==configured('SEPAY_ACCOUNT_NO'))throw paymentError('Sai tài khoản nhận tiền.',400,'BANK_ACCOUNT_MISMATCH');
  if(process.env.SEPAY_GATEWAY_NAME && payload.gateway!==process.env.SEPAY_GATEWAY_NAME)throw paymentError('Sai ngân hàng nhận tiền.',400,'BANK_ACCOUNT_MISMATCH');
  const matches=String(payload.content || '').match(/\bGD\d{16}\b/gi) || [];
  if(!Number.isSafeInteger(payload.id)||payload.id<=0)throw paymentError('Thiếu mã giao dịch SePay.');
  if(typeof payload.transactionDate!=='string'||!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(payload.transactionDate))throw paymentError('Thời gian SePay không hợp lệ.');
  const paidAt=new Date(payload.transactionDate.replace(' ','T')+'+07:00');
  if(matches.length!==1)return recordUnmatchedTransfer({gatewayTransactionNo:String(payload.id),paidAmount:payload.transferAmount,paidAt},options);
  return fulfillPaymentSuccess({transactionId:matches[0].toUpperCase(),gateway:'sepay',gatewayTransactionNo:String(payload.id),
    gatewayEventId:String(payload.id),paidAmount:paymentMoney(payload.transferAmount),currency:'VND',paidAt},options);
}
