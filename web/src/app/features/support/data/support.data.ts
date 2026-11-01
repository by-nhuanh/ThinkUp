import type { IconName } from '../../../shared/components/icon/icon.component';

export interface FaqItem { question: string; answer: string; }
export interface FaqCategory { id: string; label: string; description: string; icon: IconName; items: FaqItem[]; }

export const SUPPORT_TOPICS = [
  '1. Khiếu nại Chất lượng & Giảng viên',
  '2. Khiếu nại Thanh toán & Hoàn tiền',
  '3. Lỗi kỹ thuật & Coding Lab',
  '4. Tài khoản & Bảo mật',
  '5. Tư vấn Lộ trình & Khóa học',
  '6. Góp ý & Vấn đề khác',
] as const;

export const FAQ_CATEGORIES: FaqCategory[] = [
  { id: 'account', label: 'Tài khoản & Bảo mật', description: 'Đăng nhập, hồ sơ và an toàn tài khoản.', icon: 'user', items: [
    { question: 'Làm thế nào để thay đổi mật khẩu?', answer: 'Vào Cài đặt > Tài khoản & bảo mật, chọn Đổi mật khẩu và làm theo hướng dẫn xác thực.' },
    { question: 'Tôi quên mật khẩu thì phải làm sao?', answer: 'Chọn Quên mật khẩu tại màn hình đăng nhập. ThinkUp sẽ gửi mã xác thực tới email của bạn.' },
    { question: 'Làm sao để cập nhật thông tin cá nhân?', answer: 'Bạn có thể cập nhật thông tin tại mục Hồ sơ cá nhân sau khi đăng nhập.' },
  ]},
  { id: 'payment', label: 'Thanh toán & Hóa đơn', description: 'Tất cả câu hỏi thường gặp về thanh toán, hóa đơn và hoàn tiền.', icon: 'credit-card', items: [
    { question: 'ThinkUp chấp nhận những phương thức thanh toán nào?', answer: 'Chúng tôi chấp nhận thanh toán qua thẻ quốc tế (Visa, Mastercard, JCB, AMEX) và ví điện tử (MoMo, ZaloPay). Tất cả giao dịch đều được mã hóa và bảo mật theo tiêu chuẩn PCI DSS.' },
    { question: 'Làm thế nào để thêm phương thức thanh toán mới?', answer: 'Bạn có thể thêm phương thức mới tại Cài đặt > Phương thức thanh toán.' },
    { question: 'Tôi có thể đổi phương thức thanh toán cho gói đã mua không?', answer: 'Phương thức thanh toán của giao dịch đã hoàn tất không thể thay đổi.' },
    { question: 'Tôi có nhận được hóa đơn sau khi thanh toán không?', answer: 'Hóa đơn được gửi tự động tới email và lưu tại Lịch sử giao dịch.' },
    { question: 'Làm thế nào để xem lịch sử giao dịch?', answer: 'Mở Hồ sơ > Lịch sử giao dịch để xem và tải hóa đơn.' },
    { question: 'Tôi có thể yêu cầu hoàn tiền không?', answer: 'Bạn có thể gửi yêu cầu hoàn tiền qua trang Liên hệ hỗ trợ để được kiểm tra điều kiện.' },
  ]},
  { id: 'learning', label: 'Khóa học & Học tập', description: 'Cách học, video bài giảng và bài tập Coding Lab.', icon: 'book-open', items: [
    { question: 'Tôi bắt đầu khóa học như thế nào?', answer: 'Mở Khóa học của tôi, chọn khóa học và nhấn Tiếp tục học.' },
    { question: 'Tôi có thể học trên nhiều thiết bị không?', answer: 'Có. Tiến độ học được đồng bộ khi bạn đăng nhập cùng một tài khoản.' },
    { question: 'Coding Lab hoạt động như thế nào?', answer: 'Coding Lab chạy trực tiếp trên trình duyệt, không yêu cầu cài đặt thêm.' },
  ]},
  { id: 'certificate', label: 'Chứng chỉ', description: 'Điều kiện nhận và xác thực chứng chỉ.', icon: 'award', items: [
    { question: 'Khi nào tôi được cấp chứng chỉ?', answer: 'Chứng chỉ được cấp khi bạn hoàn thành đầy đủ yêu cầu của khóa học.' },
    { question: 'Làm sao để xác thực chứng chỉ?', answer: 'Dùng mã chứng chỉ tại trang Tra cứu chứng chỉ công khai của ThinkUp.' },
  ]},
  { id: 'technical', label: 'Kỹ thuật & Ứng dụng', description: 'Lỗi kỹ thuật, trình duyệt và Coding Lab.', icon: 'wrench', items: [
    { question: 'Trình duyệt nào được hỗ trợ?', answer: 'ThinkUp hỗ trợ các phiên bản mới nhất của Chrome, Edge, Firefox và Safari.' },
    { question: 'Video không phát được thì làm sao?', answer: 'Hãy kiểm tra kết nối, tắt tiện ích chặn nội dung và tải lại trang.' },
  ]},
  { id: 'policy', label: 'Chính sách & Điều khoản', description: 'Điều khoản sử dụng và quyền riêng tư.', icon: 'file-text', items: [
    { question: 'Dữ liệu cá nhân của tôi được bảo vệ thế nào?', answer: 'ThinkUp chỉ sử dụng dữ liệu theo Chính sách quyền riêng tư và các quy định hiện hành.' },
    { question: 'Tôi có thể xóa tài khoản không?', answer: 'Bạn có thể gửi yêu cầu xóa tài khoản tại trang Liên hệ hỗ trợ.' },
  ]},
  { id: 'other', label: 'Khác', description: 'Những câu hỏi khác về ThinkUp.', icon: 'circle-help', items: [
    { question: 'Tôi có thể đóng góp ý kiến ở đâu?', answer: 'Hãy chọn chủ đề Góp ý & Vấn đề khác trong form Liên hệ hỗ trợ.' },
  ]},
];
