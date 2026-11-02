import { LecturerStatus, StudentStatus } from './user-management.models';

/** Nhãn hiển thị của trạng thái tài khoản giảng viên. */
export const LECTURER_STATUS_LABELS: Record<LecturerStatus, string> = {
  'active': 'Đang hoạt động',
  'pending-review': 'Chờ thẩm định hồ sơ',
  'pending-docs': 'Chờ bổ sung hồ sơ',
  'pending-contract': 'Chờ ký hợp đồng',
  'warning': 'Cảnh cáo',
  'violation': 'Khóa học vi phạm',
  'frozen': 'Đóng băng và Khóa',
  'rejected': 'Từ chối hợp tác'
};

/** Nhóm màu trạng thái: success / warning / danger / info / neutral. */
export const LECTURER_STATUS_TONE: Record<LecturerStatus, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  'active': 'success',
  'pending-review': 'warning',
  'pending-docs': 'warning',
  'pending-contract': 'info',
  'warning': 'warning',
  'violation': 'danger',
  'frozen': 'danger',
  'rejected': 'neutral'
};

export const STUDENT_STATUS_LABELS: Record<StudentStatus, string> = {
  active: 'Đang hoạt động',
  locked: 'Đang bị khóa',
  inactive: 'Tạm ngưng'
};

export const STUDENT_STATUS_TONE: Record<StudentStatus, 'success' | 'danger' | 'neutral'> = {
  active: 'success',
  locked: 'danger',
  inactive: 'neutral'
};

/** Khoá học cần chọn khi áp dụng kỷ luật Mức 2 cho giảng viên. */
export const LECTURER_COURSE_OPTIONS = [
  'React & Next.js từ Zero đến Production',
  'Thiết kế hệ thống UI cho sản phẩm SaaS',
  'SQL cho người mới bắt đầu',
  'Kubernetes thực chiến cho đội Frontend'
] as const;
