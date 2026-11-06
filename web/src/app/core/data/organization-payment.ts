import type { BankDisplay, SwiftInfo } from '../models/payment.model';

/** Organization bank details supplied for the checkout preview. */
export const ORGANIZATION_BANK_TRANSFER: Readonly<BankDisplay> = {
  bankName: 'Techcombank - Ngân hàng TMCP Kỹ Thương Việt Nam',
  accountNo: '1903 1234 5678 9012',
  accountName: 'CÔNG TY TNHH THINKUP',
  transferContent: 'THINKUP PAY',
};

export const ORGANIZATION_SWIFT_INFO: Readonly<SwiftInfo> = {
  bankName: 'JOINT STOCK COMMERCIAL BANK FOR FOREIGN TRADE OF VIETNAM (VIETCOMBANK)',
  address: '198 Tran Quang Khai Str., Hoan Kiem Dist., Hanoi, Vietnam',
  swift: 'BFTVVNVX',
  account: '0011 2345 6789',
  accountName: 'THINKUP TECHNOLOGY JOINT STOCK COMPANY',
  content: 'THINKUP SWIFT PAY',
};
