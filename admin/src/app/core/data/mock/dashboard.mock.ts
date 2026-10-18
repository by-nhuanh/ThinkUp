// TODO(pre-deploy): Nhớ xóa dữ liệu dashboard mẫu này và thay bằng service sử dụng API admin đã được backend bàn giao.
export interface DashboardMetric { title: string; value: string; unit?: string; detail?: string[]; trend?: string; theme: string; icon: string; arrow: string; decoration: string; }
export interface ActionItem { title: string; description: string; count: number; suffix: string; status: string; action: string; theme: string; icon: string; }
export interface AuditLog { time: string; account: string; role: string; action: string; ip: string; id?: string; actor?: string; actionCode?: string; device?: string; entity?: string; previous?: string; current?: string; }

export const DASHBOARD_METRICS: DashboardMetric[] = [
  { title: 'Tổng người dùng', value: '120.540', unit: 'người', trend: '+38,2%', theme: 'users', icon: '1-group.svg', arrow: '1-svg.svg', decoration: '1-svg1.svg' },
  { title: 'Khóa học', value: '215', unit: 'khóa học', trend: '+12%', detail: ['Đã xuất bản: 180', 'Chờ duyệt: 25', 'Bị ẩn: 10'], theme: 'courses', icon: '1-svg2.svg', arrow: '1-svg3.svg', decoration: '1-svg4.svg' },
  { title: 'Doanh thu', value: '2.48', unit: 'tỷ VNĐ', trend: '+24,1%', theme: 'revenue', icon: '1-svg5.svg', arrow: '1-svg6.svg', decoration: '1-svg7.svg' },
  { title: 'Phòng học ảo', value: '18', unit: 'phòng đang diễn ra', detail: ['Trực tuyến: 258'], theme: 'rooms', icon: '1-svg8.svg', arrow: '1-svg9.svg', decoration: '1-svg10.svg' }
];

export const DASHBOARD_ACTIONS: ActionItem[] = [
  { title: 'Phê duyệt rút tiền', description: 'Yêu cầu vượt hạn mức (> 20M)', count: 3, suffix: 'yêu cầu đang chờ', status: 'Cần phê duyệt', action: 'Xem & Duyệt', theme: 'pink', icon: '2-svg.svg' },
  { title: 'Khóa học trễ hạn duyệt', description: 'Chờ duyệt quá hạn (> 2 tuần)', count: 3, suffix: 'khóa học cần xử lý', status: 'Cần phê duyệt', action: 'Xử lý', theme: 'amber', icon: '2-svg2.svg' },
  { title: 'Khiếu nại tài khoản', description: 'Ticket khiếu nại mức độ cao', count: 2, suffix: 'ticket chưa xử lý', status: 'Ưu tiên cao', action: 'Xử lý ngay', theme: 'pink', icon: '2-svg4.svg' },
  { title: 'Cảnh báo vận hành', description: 'Giám sát sức khỏe nền tảng', count: 0, suffix: 'sự cố ghi nhận', status: 'Vận hành ổn định', action: 'Kiểm tra', theme: 'blue', icon: '2-svg6.svg' }
];

export const TOP_COURSES = [
  { name: 'Python cơ bản', purchases: '12.480', rating: '4,9' },
  { name: 'Thiết kế UI/UX với Figma', purchases: '8.320', rating: '4,8' },
  { name: 'Phân tích dữ liệu với Excel', purchases: '6.540', rating: '4,7' },
  { name: 'Java nâng cao', purchases: '5.210', rating: '4,8' },
  { name: 'Marketing số', purchases: '4.490', rating: '4,5' }
];

export const AUDIT_LOGS: AuditLog[] = [
  { time: '12/10/2026 14:30:22', account: 'thanhtri@thinkup.vn', role: 'Academic (CA)', action: 'Cập nhật trạng thái khóa học', ip: '14.233.18.17', id: '10293', actor: 'Thanh Duy Academic (CA)', actionCode: 'UPDATE_COURSE_STATUS', device: 'Chrome 114, Windows 11', entity: '[Khóa học: Lập trình Angular 21]', previous: '{\n  "id": 10293,\n  "title": "Lập trình Angular 21",\n  "status": "pending_review",\n  "approved_by": null,\n  "updated_at": "2026-10-12 14:30:22"\n}', current: '{\n  "id": 10293,\n  "title": "Lập trình Angular 21",\n  "status": "published",\n  "approved_by": "Thanh Duy (CA)",\n  "updated_at": "2026-10-12 14:30:22"\n}' },
  { time: '12/10/2026 13:12:45', account: 'minhtram@thinkup.vn', role: 'Finance (FA)', action: 'Xử lý yêu cầu hoàn tiền', ip: '113.172.56.12' },
  { time: '12/10/2026 13:02:35', account: 'quangduy@thinkup.vn', role: 'Support (CS)', action: 'Phản hồi ticket hỗ trợ', ip: '171.81.033.33' },
  { time: '12/10/2026 12:19:37', account: 'admin@thinkup.vn', role: 'Admin', action: 'Cập nhật cấu hình hệ thống', ip: '123.45.67.89' },
  { time: '11/10/2026 14:58:30', account: 'ngochao@thinkup.vn', role: 'Academic (CA)', action: 'Duyệt khóa học', ip: '14.246.67.90' }
];

export const REVENUE_BARS = [
  { month: '06/25', original: 145, marketplace: 48, payout: 132 }, { month: '07/25', original: 125, marketplace: 46, payout: 107 },
  { month: '08/25', original: 183, marketplace: 45, payout: 153 }, { month: '09/25', original: 143, marketplace: 55, payout: 120 },
  { month: '10/25', original: 178, marketplace: 41, payout: 165 }, { month: '11/25', original: 184, marketplace: 46, payout: 187 },
  { month: '12/25', original: 193, marketplace: 48, payout: 179 }, { month: '01/26', original: 145, marketplace: 66, payout: 137 },
  { month: '02/26', original: 205, marketplace: 56, payout: 191 }, { month: '03/26', original: 184, marketplace: 40, payout: 160 },
  { month: '04/26', original: 151, marketplace: 36, payout: 124 }, { month: '05/26', original: 199, marketplace: 48, payout: 130 }
];
