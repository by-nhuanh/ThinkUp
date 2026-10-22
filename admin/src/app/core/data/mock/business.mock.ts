import { BusinessOrder, BusinessVoucher, OrderStatus, PayoutRequest } from '../../../features/business/models/business.models';

// TODO(pre-deploy): Nhớ xóa dữ liệu mẫu này khi backend cung cấp API quản lý kinh doanh đã xác minh.
export const MOCK_PAYOUT_ADMIN_ROLE: 'finance' | 'super' = 'super';
export const MOCK_ORDER_SUMMARY = {
  total: 4820,
  previousPeriodChange: 12.4,
  success: 4150,
  successRate: 86.1,
  pending: 520,
  paymentExpiryMinutes: 15,
  cancelled: 150,
  cancelledRate: 3.1
} as const;
/** Số đơn hàng mẫu sinh tự động, cộng với các fixture viết tay phía trên. */
const MOCK_GENERATED_ORDER_COUNT = 39;
const MOCK_ORDER_FIXTURES: BusinessOrder[] = [
  { id: 'THKUP-261025-000148', transactionId: 'MOMO-987654321', learner: 'Nguyễn Hoàng Nam', email: 'nam@gmail.com', phone: '0912 345 678', instructor: 'Trần Thị Mai', courses: ['React JS Cơ Bản', 'Thiết kế UI thực chiến'], originalAmount: 599000, discount: 100000, voucherCode: 'THINKUP100', sponsor: 'thinkup', method: 'MoMo', status: 'success', createdAt: '2026-10-15T14:30:00+07:00', paidAt: '2026-10-15T14:32:18+07:00', invoiceId: 'HD261025-000456', bankReference: 'FT2610251032182456' },
  // TODO(pre-deploy): Thay fixture đơn chờ này bằng dữ liệu API để minh họa danh sách khóa học và hạn thanh toán thực.
  { id: 'THKUP-261025-000147', learner: 'Trần Mỹ Linh', email: 'linh@gmail.com', phone: '0987 654 321', instructor: 'Phạm Tuấn Anh', courses: ['Angular từ cơ bản', 'Thiết kế Web Responsive'], originalAmount: 799000, discount: 100000, voucherCode: 'THINKUP100', sponsor: 'thinkup', method: 'QR Code', status: 'pending', createdAt: '2026-10-19T10:42:00+07:00' },
  { id: 'THKUP-261024-000146', transactionId: 'VNPAY-3478102', learner: 'Phạm Quốc Huy', email: 'huy@gmail.com', phone: '0903 471 802', instructor: 'Nguyễn Minh Khoa', courses: ['Python phân tích dữ liệu'], originalAmount: 1299000, discount: 150000, voucherCode: 'GV-DATA15', sponsor: 'instructor', method: 'Thẻ ATM / nội địa', status: 'success', createdAt: '2026-10-14T10:42:00+07:00', paidAt: '2026-10-14T10:44:36+07:00', invoiceId: 'HD261024-000455', bankReference: 'FT2610241032182455' },
  { id: 'THKUP-261023-000145', learner: 'Lê Thảo Vy', email: 'vy@gmail.com', phone: '0938 246 810', instructor: 'Lê Minh Khôi', courses: ['Marketing số', 'Excel cho kinh doanh'], originalAmount: 499000, discount: 100000, voucherCode: 'THINKUP100', sponsor: 'thinkup', method: 'Chuyển khoản ngân hàng', status: 'cancelled', createdAt: '2026-10-13T09:05:00+07:00', cancellation: { reason: 'Đơn hàng hết thời gian chờ thanh toán.', cancelledAt: '2026-10-13T09:20:00+07:00', cancelledBy: 'system', paymentState: 'unpaid' } },
  { id: 'THKUP-261022-000144', transactionId: 'STRIPE-994321', learner: 'Đỗ Minh Anh', email: 'anh@gmail.com', phone: '0965 432 109', instructor: 'Nguyễn Thị Hương', courses: ['UX Research', 'Figma nâng cao', 'Design System'], originalAmount: 1899000, discount: 189900, voucherCode: 'SUMMER10', sponsor: 'thinkup', method: 'Thẻ tín dụng / ghi nợ quốc tế', status: 'success', createdAt: '2026-10-12T17:20:00+07:00', paidAt: '2026-10-12T17:22:41+07:00', invoiceId: 'HD261022-000454' },
  { id: 'THKUP-261021-000143', transactionId: 'PAYPAL-804422', learner: 'Ngô Gia Bảo', email: 'bao@gmail.com', phone: '0978 044 220', instructor: 'Đặng Thị Thu', courses: ['English for Work'], originalAmount: 699000, discount: 0, method: 'PayPal', status: 'success', createdAt: '2026-10-11T08:16:00+07:00', paidAt: '2026-10-11T08:18:09+07:00', invoiceId: 'HD261021-000453' },
  { id: 'THKUP-261020-000142', learner: 'Vũ Thanh Hà', email: 'ha@gmail.com', phone: '0918 990 142', instructor: 'Trần Quốc Bảo', courses: ['Lập trình web'], originalAmount: 899000, discount: 100000, voucherCode: 'THINKUP100', sponsor: 'thinkup', method: 'Apple Pay', status: 'cancelled', createdAt: '2026-10-10T21:10:00+07:00', cancellation: { reason: 'Học viên chủ động hủy đơn hàng.', cancelledAt: '2026-10-10T21:12:00+07:00', cancelledBy: 'learner', paymentState: 'unpaid' } },
  { id: 'THKUP-261019-000141', transactionId: 'MOMO-887700123', learner: 'Bùi Đức Long', email: 'long@gmail.com', phone: '0887 700 123', instructor: 'Lê Minh Khôi', courses: ['Excel cho kinh doanh'], originalAmount: 399000, discount: 50000, voucherCode: 'WELCOME50', sponsor: 'thinkup', method: 'MoMo', status: 'success', createdAt: '2026-10-09T11:06:00+07:00', paidAt: '2026-10-09T11:07:52+07:00', invoiceId: 'HD261019-000452' },
  { id: 'THKUP-261018-000140', learner: 'Hoàng Ngọc Mai', email: 'mai@gmail.com', phone: '0908 182 540', instructor: 'Đặng Thị Thu', courses: ['Tư duy sản phẩm'], originalAmount: 1099000, discount: 0, method: 'Chuyển khoản quốc tế', status: 'pending', createdAt: '2026-10-08T16:25:00+07:00' },
  { id: 'THKUP-261017-000139', transactionId: 'VNPAY-3478101', learner: 'Đặng Văn Khánh', email: 'khanh@gmail.com', phone: '0917 810 139', instructor: 'Trần Văn Đức', courses: ['SQL chuyên sâu'], originalAmount: 749000, discount: 0, method: 'Thẻ ATM / nội địa', status: 'success', createdAt: '2026-10-07T13:55:00+07:00', paidAt: '2026-10-07T13:57:24+07:00', invoiceId: 'HD261017-000451' },
  { id: 'THKUP-261016-000138', learner: 'Đinh Thu Trang', email: 'trang@gmail.com', phone: '0916 160 138', instructor: 'Phạm Quang Dũng', courses: ['Photoshop căn bản'], originalAmount: 459000, discount: 100000, voucherCode: 'THINKUP100', sponsor: 'thinkup', method: 'QR Code', status: 'cancelled', createdAt: '2026-10-06T07:40:00+07:00', cancellation: { reason: 'Học viên chủ động hủy đơn hàng.', cancelledAt: '2026-10-06T07:44:00+07:00', cancelledBy: 'learner', paymentState: 'unpaid' } }
];

/** Danh mục khóa học mẫu: dùng lại cho cả tên khóa học, giá và giảng viên phụ trách. */
interface MockCourse {
  name: string;
  price: number;
  instructor: string;
}

const MOCK_COURSE_CATALOG: MockCourse[] = [
  { name: 'React JS Cơ Bản', price: 599000, instructor: 'Trần Văn Đức' },
  { name: 'Thiết kế UI thực chiến', price: 699000, instructor: 'Nguyễn Thị Hương' },
  { name: 'Angular từ cơ bản', price: 799000, instructor: 'Phạm Tuấn Anh' },
  { name: 'Thiết kế Web Responsive', price: 549000, instructor: 'Đặng Thị Thu' },
  { name: 'Python phân tích dữ liệu', price: 1299000, instructor: 'Nguyễn Minh Khoa' },
  { name: 'Marketing số', price: 499000, instructor: 'Lê Minh Khôi' },
  { name: 'Excel cho kinh doanh', price: 399000, instructor: 'Trần Thị Mai' },
  { name: 'UX Research', price: 899000, instructor: 'Nguyễn Minh Khoa' },
  { name: 'Figma nâng cao', price: 649000, instructor: 'Đặng Thị Thu' },
  { name: 'Design System', price: 999000, instructor: 'Nguyễn Thị Hương' },
  { name: 'English for Work', price: 699000, instructor: 'Trần Văn Đức' },
  { name: 'Lập trình web', price: 899000, instructor: 'Phạm Tuấn Anh' },
  { name: 'Tư duy sản phẩm', price: 1099000, instructor: 'Lê Minh Khôi' },
  { name: 'SQL chuyên sâu', price: 749000, instructor: 'Trần Văn Đức' },
  { name: 'Photoshop căn bản', price: 459000, instructor: 'Phạm Quang Dũng' }
];

const MOCK_LEARNER_NAMES = [
  'Nguyễn Thị Thu Hà', 'Trần Đức Long', 'Lê Hoàng Nam', 'Phạm Minh Châu', 'Vũ Khánh Linh',
  'Đặng Thu Trang', 'Bùi Quang Huy', 'Hoàng Mai Anh', 'Đỗ Thành Đạt', 'Ngô Bảo Ngọc',
  'Phan Gia Huy', 'Trịnh Thùy Dung', 'Lý Quang Vinh', 'Đinh Yến Nhi', 'Cao Thị Hồng Vân',
  'Hồ Xuân Thắng', 'Mai Phương Linh', 'Tạ Quốc Việt', 'Lương Thị Mai', 'Chu Anh Khoa',
  'Dương Văn Hiếu', 'Trịnh Ngọc Ánh', 'Phan Văn Kiên', 'Võ Thị Hồng', 'Lương Văn Sơn'
];

const MOCK_PAYMENT_METHODS: { method: string; prefix: string }[] = [
  { method: 'MoMo', prefix: 'MOMO' },
  { method: 'QR Code', prefix: 'QR' },
  { method: 'Thẻ ATM / nội địa', prefix: 'ATM' },
  { method: 'Chuyển khoản ngân hàng', prefix: 'BANK' },
  { method: 'Thẻ tín dụng / ghi nợ quốc tế', prefix: 'CARD' },
  { method: 'PayPal', prefix: 'PAYPAL' },
  { method: 'Apple Pay', prefix: 'APPLE' },
  { method: 'Google Pay', prefix: 'GPAY' },
  { method: 'Chuyển khoản quốc tế', prefix: 'SWIFT' }
];

/** Voucher mẫu kèm đơn tối thiểu để dữ liệu sinh ra vẫn hợp lệ với điều kiện phát hành. */
const MOCK_ORDER_VOUCHERS: { code: string; sponsor: 'thinkup' | 'instructor'; discount: number; minOrder: number }[] = [
  { code: 'THINKUP100', sponsor: 'thinkup', discount: 100000, minOrder: 400000 },
  { code: 'WELCOME50', sponsor: 'thinkup', discount: 50000, minOrder: 299000 },
  { code: 'SUMMER10', sponsor: 'thinkup', discount: 150000, minOrder: 500000 },
  { code: 'GV-DATA15', sponsor: 'instructor', discount: 150000, minOrder: 600000 },
  { code: 'GV-REACT30', sponsor: 'instructor', discount: 150000, minOrder: 300000 }
];

const MOCK_CANCEL_REASONS = [
  { reason: 'Đơn hàng hết thời gian chờ thanh toán.', cancelledBy: 'system', paymentState: 'unpaid' },
  { reason: 'Học viên chủ động hủy đơn hàng.', cancelledBy: 'learner', paymentState: 'unpaid' },
  { reason: 'Học viên yêu cầu hoàn tiền do khóa học không đáp ứng.', cancelledBy: 'learner', paymentState: 'refunded' }
] as const;

/** Bộ sinh số giả ngẫu nhiên có seed cố định để danh sách mẫu ổn định giữa các lần tải trang. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const pad2 = (value: number): string => String(value).padStart(2, '0');

/** Mốc thời gian theo giờ Việt Nam, luôn dựng được ở múi giờ +07:00. */
function vietnamStamp(year: number, month: number, day: number, hour: number, minute: number): number {
  return Date.UTC(year, month - 1, day, hour, minute);
}

function vietnamIso(stamp: number): string {
  const date = new Date(stamp);
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}T${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}:00+07:00`;
}

function vietnamDateKey(stamp: number): string {
  const date = new Date(stamp);
  return `${String(date.getUTCFullYear()).slice(2)}${pad2(date.getUTCMonth() + 1)}${pad2(date.getUTCDate())}`;
}

function stripAccents(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/\s+/g, '.')
    .toLowerCase();
}

/**
 * Sinh danh sách đơn hàng mẫu đủ số lượng để kiểm tra phân trang và bộ lọc.
 * Dữ liệu giữ nguyên tính xác định: cùng seed luôn cho cùng một danh sách.
 */
function buildMockOrders(count: number, startSequence = 149): BusinessOrder[] {
  const random = seededRandom(20261021);
  const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)];
  const orders: BusinessOrder[] = [];
  let sequence = startSequence;
  let cursor = vietnamStamp(2026, 10, 20, 9, 12);

  for (let index = 0; index < count; index++) {
    const courseCount = 1 + Math.floor(random() * 3);
    const courses: MockCourse[] = [];
    while (courses.length < courseCount) {
      const course = pick(MOCK_COURSE_CATALOG);
      if (!courses.some(item => item.name === course.name)) courses.push(course);
    }
    const originalAmount = courses.reduce((sum, course) => sum + course.price, 0);
    const learner = pick(MOCK_LEARNER_NAMES);
    const method = pick(MOCK_PAYMENT_METHODS);
    const roll = random();
    const status: OrderStatus = roll < 0.8 ? 'success' : roll < 0.92 ? 'pending' : 'cancelled';
    // Đơn đã hủy vẫn có thể đã áp voucher; voucher đó được hoàn lại ví học viên.
    const voucher = status === 'success' || (status === 'cancelled' && random() < 0.5)
      ? pick(MOCK_ORDER_VOUCHERS)
      : undefined;
    const usableVoucher = voucher && originalAmount >= voucher.minOrder ? voucher : undefined;
    const discount = usableVoucher ? usableVoucher.discount : 0;
    const hour = 7 + Math.floor(random() * 15);
    const minute = Math.floor(random() * 60);
    // Mỗi đơn lùi về trước 1-3 ngày để dữ liệu trải rộng khoảng 2 tháng.
    cursor -= (1 + Math.floor(random() * 3)) * 86400000;
    const createdStamp = cursor - hour * 3600000 - minute * 60000;
    const dateKey = vietnamDateKey(createdStamp);
    const orderId = `THKUP-${dateKey}-${String(sequence).padStart(6, '0')}`;
    const order: BusinessOrder = {
      id: orderId,
      learner,
      email: `${stripAccents(learner)}@gmail.com`,
      // TODO(pre-deploy): Nhớ thay số điện thoại minh họa bằng trường phone từ API đơn hàng đã xác minh.
      phone: `09${String(10000000 + index * 7919).slice(-8)}`,
      instructor: courses[0].instructor,
      courses: courses.map(course => course.name),
      courseItems: courses.map(course => ({ courseName: course.name, salePrice: course.price })),
      originalAmount,
      discount,
      method: method.method,
      status,
      createdAt: vietnamIso(createdStamp)
    };
    if (usableVoucher) {
      order.voucherCode = usableVoucher.code;
      order.sponsor = usableVoucher.sponsor;
    }
    if (status === 'success') {
      order.transactionId = `${method.prefix}-${String(Math.floor(random() * 9000000) + 1000000)}`;
      // TODO(pre-deploy): Nhớ thay thời điểm thanh toán minh họa bằng paidAt từ API đơn hàng đã xác minh.
      order.paidAt = vietnamIso(createdStamp + (1 + Math.floor(random() * 4)) * 60000 + Math.floor(random() * 60) * 1000);
      order.invoiceId = `HD${dateKey}-${String(456 + index).padStart(6, '0')}`;
      if (random() < 0.5) order.bankReference = `FT${dateKey}${String(Math.floor(random() * 9000000000) + 1000000000)}`;
    } else if (status === 'cancelled') {
      const cancellation = pick(MOCK_CANCEL_REASONS);
      order.cancellation = {
        reason: cancellation.reason,
        cancelledBy: cancellation.cancelledBy,
        paymentState: cancellation.paymentState,
        cancelledAt: vietnamIso(createdStamp + 15 * 60000)
      };
    }
    orders.push(order);
    sequence++;
  }
  return orders.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export const MOCK_ORDERS: BusinessOrder[] = [...MOCK_ORDER_FIXTURES, ...buildMockOrders(MOCK_GENERATED_ORDER_COUNT)];


// TODO(pre-deploy): Nhớ thay fixture voucher mẫu bằng dữ liệu API và bổ sung danh mục khóa học, giảng viên từ API được bàn giao.
export const MOCK_VOUCHERS: BusinessVoucher[] = [
  { code: 'THINKUP100', description: 'Chiết khấu 100.000đ cho mọi khóa học trong đợt sale hè.', sponsor: 'thinkup', scope: 'all', audience: 'all', discountType: 'fixed', discountValue: 100000, minOrder: 400000, minCourseCount: 1, used: 450, limit: 500, perAccount: 1, startsAt: '2026-06-01T00:00', endsAt: '2027-06-30T23:59', showOnSite: true, locked: false, fundedAmount: 50000000, auditLog: [
    { at: '2026-06-10T09:42:00+07:00', actor: 'admin@thinkup.vn', action: 'unlocked', note: 'Mở khóa voucher để tiếp tục nhận giao dịch mới.' },
    { at: '2026-05-28T15:18:00+07:00', actor: 'marketing@thinkup.vn', action: 'updated', note: 'Đã thay đổi: mô tả hiển thị, đơn tối thiểu, tổng lượt phát hành.' },
    { at: '2026-05-20T08:30:00+07:00', actor: 'admin@thinkup.vn', action: 'created', note: 'Tạo voucher THINKUP100 cho chiến dịch ưu đãi mùa hè.' }
  ] },
  { code: 'GV-REACT30', description: 'Giảm 30% tối đa 150.000đ cho khóa React của thầy Đức.', sponsor: 'instructor', instructor: 'Trần Văn Đức', scope: 'courses', scopeTarget: 'React JS Cơ Bản', audience: 'all', discountType: 'percent', discountValue: 30, maxDiscount: 150000, minOrder: 300000, minCourseCount: 1, used: 85, limit: 100, perAccount: 1, startsAt: '2026-06-15T00:00', endsAt: '2027-07-15T23:59', showOnSite: true, locked: false, fundedAmount: 15000000, auditLog: [] },
  { code: 'SUMMER10', description: 'Giảm 10% cho học viên đánh giá từ 4 sao trở lên.', sponsor: 'thinkup', scope: 'rating', scopeTarget: '4', audience: 'all', discountType: 'percent', discountValue: 10, maxDiscount: 200000, minOrder: 500000, minCourseCount: 2, used: 120, limit: 300, perAccount: 1, startsAt: '2026-05-01T00:00', endsAt: '2027-08-31T23:59', showOnSite: true, locked: false, fundedAmount: 60000000, auditLog: [] },
  { code: 'GV-DATA15', description: 'Giảm 15% cho khóa Python phân tích dữ liệu của thầy Khoa.', sponsor: 'instructor', instructor: 'Nguyễn Minh Khoa', scope: 'courses', scopeTarget: 'Python phân tích dữ liệu', audience: 'all', discountType: 'percent', discountValue: 15, maxDiscount: 150000, minOrder: 600000, minCourseCount: 1, used: 74, limit: 120, perAccount: 1, startsAt: '2026-05-15T00:00', endsAt: '2027-04-30T23:59', showOnSite: true, locked: true, fundedAmount: 18000000, auditLog: [] },
  { code: 'WELCOME50', description: 'Ưu đãi 50.000đ dành riêng cho học viên đăng ký mới.', sponsor: 'thinkup', scope: 'all', audience: 'new_learner', discountType: 'fixed', discountValue: 50000, minOrder: 299000, minCourseCount: 1, used: 0, limit: 500, perAccount: 1, startsAt: '2026-10-01T00:00', endsAt: '2027-12-31T23:59', showOnSite: true, locked: false, fundedAmount: 25000000, auditLog: [] },
  { code: 'OLDCLASS20', description: 'Voucher đã hết hạn từ năm ngoái.', sponsor: 'thinkup', scope: 'all', audience: 'all', discountType: 'percent', discountValue: 20, maxDiscount: 100000, minOrder: 200000, minCourseCount: 1, used: 60, limit: 60, perAccount: 1, startsAt: '2025-01-01T00:00', endsAt: '2025-12-31T23:59', showOnSite: false, locked: false, fundedAmount: 6000000, auditLog: [] }
];

export const MOCK_PAYOUTS: PayoutRequest[] = [
  { id: 'PO-2026-089', instructor: 'Lê Thị Hồng', email: 'lehong@thinkup.vn', amount: 4200000, taxAmount: 420000, bank: 'Vietcombank', accountNumber: '1234567890', accountName: 'LE THI HONG', availableBalance: 7100000, verified: true, contractValid: true, disputed: false, status: 'pending', submittedAt: '2026-09-22T09:15:00+07:00' },
  { id: 'PO-2026-088', instructor: 'Trần Văn Đức', email: 'duc@thinkup.vn', amount: 28500000, taxAmount: 2850000, bank: 'Techcombank', accountNumber: '1903982026', accountName: 'TRAN VAN DUC', availableBalance: 35000000, verified: true, contractValid: true, disputed: false, status: 'pending', submittedAt: '2026-09-21T15:45:00+07:00' },
  { id: 'PO-2026-087', instructor: 'Nguyễn Minh Khoa', email: 'khoa@thinkup.vn', amount: 12000000, taxAmount: 1200000, bank: 'MB Bank', accountNumber: '0123456789', accountName: 'NGUYEN MINH KHOA', availableBalance: 15000000, verified: true, contractValid: true, disputed: false, status: 'approved', submittedAt: '2026-09-20T11:20:00+07:00' },
  { id: 'PO-2026-086', instructor: 'Phạm Thu An', email: 'an@thinkup.vn', amount: 6800000, taxAmount: 680000, bank: 'ACB', accountNumber: '245890123', accountName: 'PHAM THU AN', availableBalance: 8200000, verified: true, contractValid: true, disputed: false, status: 'paid', submittedAt: '2026-09-18T08:40:00+07:00', paidAt: '2026-10-02T10:00:00+07:00', bankReference: 'FT261002-00653' },
  { id: 'PO-2026-085', instructor: 'Đỗ Hoàng Nam', email: 'nam@thinkup.vn', amount: 3200000, taxAmount: 320000, bank: 'VietinBank', accountNumber: '1028304956', accountName: 'DO HOANG NAM', availableBalance: 4000000, verified: false, contractValid: true, disputed: false, status: 'pending', submittedAt: '2026-09-17T17:10:00+07:00' },
  { id: 'PO-2026-084', instructor: 'Vũ Hải Yến', email: 'yen@thinkup.vn', amount: 1800000, taxAmount: 0, bank: 'BIDV', accountNumber: '520101999', accountName: 'VU HAI YEN', availableBalance: 2400000, verified: true, contractValid: true, disputed: false, status: 'rejected', submittedAt: '2026-09-16T13:05:00+07:00', rejectionReason: 'Tên chủ tài khoản không khớp' }
];
