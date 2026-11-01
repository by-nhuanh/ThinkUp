import { createHmac, timingSafeEqual } from 'node:crypto';
import { paymentMoney, paymentError, fulfillPaymentSuccess } from '../payment.service.js';

function config(){
  const merchant=process.env.VNP_TMN_CODE || process.env.VNPAY_TMN_CODE;
  const secret=process.env.VNP_HASH_SECRET || process.env.VNPAY_HASH_SECRET;
  const returnUrl=process.env.VNP_RETURN_URL || process.env.VNPAY_RETURN_URL;
  if(!merchant||!secret||!returnUrl)throw paymentError('VNPay chưa được cấu hình.',503,'PAYMENT_NOT_CONFIGURED');
  return {merchant,secret,returnUrl,url:process.env.VNP_URL || process.env.VNPAY_URL || 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html'};
}
export function canonicalVnpay(params){
  return Object.keys(params).filter(k=>k!=='vnp_SecureHash'&&k!=='vnp_SecureHashType').sort().map(key=>{
    if(typeof params[key]!=='string'&&typeof params[key]!=='number')throw paymentError('Tham số VNPay không hợp lệ.');
    return `${encodeURIComponent(key)}=${encodeURIComponent(String(params[key])).replace(/%20/g,'+')}`;
  }).join('&');
}
function vnpDate(date){
  const shifted=new Date(date.getTime()+7*3600000);
  return shifted.toISOString().slice(0,19).replace(/[-:T]/g,'');
}
export function createVnpayPaymentUrl({transactionId,amount,orderInfo,ipAddr='127.0.0.1',bankCode='',expiresAt}){
  const env=config();
  if(new URL(env.url).protocol!=='https:'||new URL(env.returnUrl).protocol!=='https:'&&process.env.NODE_ENV==='production')throw paymentError('URL VNPay phải sử dụng HTTPS.',503,'PAYMENT_NOT_CONFIGURED');
  const params={vnp_Version:'2.1.0',vnp_Command:'pay',vnp_TmnCode:env.merchant,vnp_Locale:'vn',vnp_CurrCode:'VND',vnp_TxnRef:transactionId,
    vnp_OrderInfo:orderInfo || `Thanh toan ${transactionId}`,vnp_OrderType:'other',vnp_Amount:paymentMoney(amount)*100,
    vnp_ReturnUrl:env.returnUrl,vnp_IpAddr:ipAddr,vnp_CreateDate:vnpDate(new Date()),...(expiresAt?{vnp_ExpireDate:vnpDate(new Date(expiresAt))}:{})};
  if(bankCode){if(typeof bankCode!=='string'||!/^[A-Z0-9_]{1,30}$/.test(bankCode))throw paymentError('Mã ngân hàng không hợp lệ.');params.vnp_BankCode=bankCode;}
  const data=canonicalVnpay(params), hash=createHmac('sha512',env.secret).update(data).digest('hex');
  return `${env.url}?${data}&vnp_SecureHash=${hash}`;
}
export async function verifyVnpayCallback(params,options={}){
  const env=config();
  const signature=params.vnp_SecureHash;
  const expected=createHmac('sha512',env.secret).update(canonicalVnpay(params)).digest();
  if(typeof signature!=='string'||!/^[a-f0-9]{128}$/i.test(signature)||!timingSafeEqual(expected,Buffer.from(signature,'hex')))return {isSuccess:false,code:'97',message:'Chữ ký không hợp lệ.'};
  if(params.vnp_TmnCode!==env.merchant)return {isSuccess:false,code:'97',message:'Sai merchant.'};
  if(params.vnp_CurrCode && params.vnp_CurrCode!=='VND')throw paymentError('Tiền tệ VNPay không hợp lệ.');
  if(!/^GD\d{16}$/.test(params.vnp_TxnRef || ''))throw paymentError('Mã giao dịch không hợp lệ.');
  if(params.vnp_ResponseCode!=='00'||params.vnp_TransactionStatus!=='00')return {isSuccess:false,code:params.vnp_ResponseCode || '99',message:'Thanh toán chưa thành công.'};
  if(!/^\d+$/.test(params.vnp_Amount || '')||Number(params.vnp_Amount)%100!==0)throw paymentError('Số tiền VNPay không hợp lệ.');
  if(!/^\d{14}$/.test(params.vnp_PayDate || '')||!params.vnp_TransactionNo)throw paymentError('Thiếu thời gian hoặc mã giao dịch VNPay.');
  // Return URL verifies only. Only server-to-server IPN can settle an order.
  if(!options.settle)return {isSuccess:true,code:'00',message:'Đang chờ xác nhận IPN.',transactionId:params.vnp_TxnRef};
  const v=params.vnp_PayDate;
  const paidAt=new Date(`${v.slice(0,4)}-${v.slice(4,6)}-${v.slice(6,8)}T${v.slice(8,10)}:${v.slice(10,12)}:${v.slice(12,14)}+07:00`);
  const result=await fulfillPaymentSuccess({transactionId:params.vnp_TxnRef,gateway:'vnpay',gatewayTransactionNo:String(params.vnp_TransactionNo),
    gatewayEventId:String(params.vnp_TransactionNo),paidAmount:Number(params.vnp_Amount)/100,currency:'VND',paidAt},options);
  if(result.unmatched)return {isSuccess:false,code:'01',message:'Không tìm thấy đơn đối chiếu.',...result};
  if(result.status==='needs_review'&&Number(params.vnp_Amount)/100>0)return {isSuccess:true,code:'00',message:'Đã ghi nhận tiền, cần đối soát.',...result};
  return {isSuccess:true,code:result.alreadyProcessed?'02':'00',message:'Đã ghi nhận IPN.',...result};
}
