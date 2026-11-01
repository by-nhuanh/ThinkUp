/** Trạng thái tài khoản giảng viên — khoá theo đúng bộ lọc của Figma. */
export type LecturerStatus =
  | 'active'
  | 'pending-review'
  | 'pending-docs'
  | 'pending-contract'
  | 'warning'
  | 'violation'
  | 'frozen'
  | 'rejected';

/** Trạng thái pháp lý / hợp đồng & thuế. */
export type LecturerLegalStatus = 'signed' | 'incomplete';

/** Trạng thái tài khoản học viên. */
export type StudentStatus = 'active' | 'locked' | 'inactive';

/** Mức kỷ luật dùng chung cho luồng khoá tài khoản và xử lý vi phạm. */
export type DisciplineLevel = 1 | 2 | 3;

export interface DisciplineRecord {
  /** Nhãn mức, ví dụ "Cảnh cáo · Mức 1". */
  level: string;
  appliedAt: string;
  reason: string;
}

export interface LecturerLinks {
  portfolio?: string;
  linkedin?: string;
  gsahub?: string;
}

export interface LecturerDocument {
  key: string;
  label: string;
  /** Trạng thái của từng giấy tờ trong popup "Yêu cầu bổ sung". */
  state: 'missing' | 'invalid' | 'pending' | 'not-started';
}

export interface Lecturer {
  id: string;
  name: string;
  initials: string;
  email: string;
  phone: string;
  specialty: string;
  field: string;
  stack: string;
  title: string;
  bio: string;
  courses: number;
  learners: number;
  revenue: number;
  status: LecturerStatus;
  legalStatus: LecturerLegalStatus;
  taxVerified: boolean;
  contractCode?: string;
  joinedAt: string;
  links: LecturerLinks;
  cv: { fileName: string; size: string; uploadedAt: string };
  kyc: { cccd: string; taxCode: string; address: string; verified: boolean };
  violations: DisciplineRecord[];
  documents: LecturerDocument[];
  /** Hạn bổ sung hồ sơ (ISO) sau khi admin gửi yêu cầu. */
  documentDeadline?: string;
  /** Ghi chú lần xử lý gần nhất, hiển thị trong popup kỷ luật. */
  disciplineHistory?: { warnings: number; hiddenCourses: number };
}

export interface StudentOrder {
  id: string;
  amount: number;
  paidAt: string;
  status: string;
}

export interface EnrolledCourse {
  name: string;
  progress: number;
}

export interface Student {
  id: string;
  name: string;
  initials: string;
  email: string;
  phone: string;
  courseCount: number;
  orders: number;
  registeredAt: string;
  status: StudentStatus;
  violations: DisciplineRecord[];
  enrolledCourses: EnrolledCourse[];
  recentOrder?: StudentOrder;
}

/** Tham số hiển thị của bảng phân trang: tổng bản ghi của tập đã lọc. */
export interface PageResult<T> {
  items: T[];
  total: number;
}
