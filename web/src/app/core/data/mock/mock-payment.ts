import type { BankDisplay, SwiftInfo } from '../../models/payment.model';

// TODO(pre-deploy): Nhớ xóa thông tin ngân hàng demo khi POST /api/payment/create-session
// luôn trả bankInfo cho mọi phương thức chuyển khoản.
export const DEMO_BANK_TRANSFER: BankDisplay = {
  bankName: 'Techcombank - Ngân hàng TMCP Kỹ Thương Việt Nam',
  accountNo: '1903 1234 5678 9012',
  accountName: 'CÔNG TY TNHH THINKUP',
  transferContent: 'THINKUP 12345678',
};

// TODO(pre-deploy): Nhớ xóa thông tin SWIFT demo khi backend có cấu hình ngân hàng quốc tế.
export const DEMO_SWIFT_INFO: SwiftInfo = {
  bankName: 'JOINT STOCK COMMERCIAL BANK FOR FOREIGN TRADE OF VIETNAM (VIETCOMBANK)',
  address: '198 Tran Quang Khai Str., Hoan Kiem Dist., Hanoi, Vietnam',
  swift: 'BFTVVNVX',
  account: '0011 2345 6789',
  accountName: 'THINKUP TECHNOLOGY JOINT STOCK COMPANY',
  content: 'THINKUP 12345678',
};
