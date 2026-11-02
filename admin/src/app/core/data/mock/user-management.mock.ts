import {
  DisciplineRecord,
  EnrolledCourse,
  Lecturer,
  LecturerCourseRow,
  LecturerStatus,
  Student,
  StudentStatus
} from '../../../features/users/models/user-management.models';
import { LECTURER_COURSE_OPTIONS } from '../../../features/users/models/user-management.labels';

/**
 * Dữ liệu demo cho module quản lý người dùng.
 *
 * TODO(pre-deploy): Nhớ xoá toàn bộ dữ liệu sinh tự động dưới đây khi nối API thật
 * (`GET /admin/users/lecturers`, `GET /admin/users/students`). Chỉ giữ file này khi
 * còn chạy UI bằng mock; service đã tách sẵn nên chỉ cần thay nguồn dữ liệu.
 */

/** Sinh số giả xác định (không dùng Math.random) để UI ổn định giữa các lần render. */
function createRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const random = createRandom(20261101);

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(random() * items.length)];
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[parts.length - 1]?.[0] ?? '')).toUpperCase();
}

function asciiName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z ]/g, '')
    .trim()
    .split(/\s+/)
    .join('.');
}

const LECTURER_NAMES = [
  'Nguyễn Minh Anh', 'Lê Tuấn Bình', 'Phạm Thảo My', 'Hoàng Văn Quân', 'Trần Hải Trang',
  'Đỗ Khánh Linh', 'Vũ Đức Thắng', 'Bùi Thanh Hà', 'Ngô Quốc Huy', 'Dương Mỹ Duyên',
  'Lý Gia Bảo', 'Trịnh Thuỳ Chi', 'Phan Anh Tuấn', 'Cao Ngọc Mai', 'Đặng Quang Vinh',
  'Nguyễn Thị Hồng', 'Trần Minh Quân', 'Lê Thu Hằng', 'Phạm Văn Nam', 'Hoàng Yến Nhi'
] as const;

const SPECIALTIES = [
  ['Frontend', 'Frontend Engineering', 'React · Next.js · TypeScript'],
  ['Product Design', 'Product Design', 'Figma · Design System · UX Research'],
  ['Data Science', 'Data Science', 'Python · SQL · Machine Learning'],
  ['Backend', 'Backend Engineering', 'Node.js · PostgreSQL · Docker'],
  ['Marketing', 'Digital Marketing', 'SEO · Performance Ads · Content'],
  ['Mobile', 'Mobile Engineering', 'Flutter · React Native · Firebase'],
  ['DevOps', 'Cloud & DevOps', 'Kubernetes · Terraform · CI/CD'],
  ['Business Analyst', 'Business Analysis', 'BPMN · SQL · Stakeholder Management']
] as const;

const STATUS_POOL: LecturerStatus[] = [
  'active', 'active', 'active', 'active', 'pending-review', 'pending-docs',
  'pending-contract', 'warning', 'violation', 'frozen', 'rejected'
];

const VIOLATION_REASONS = [
  'Chậm phản hồi thảo luận',
  'Nội dung bài giảng chưa cập nhật theo cam kết',
  'Sử dụng tài liệu chưa xin phép bản quyền',
  'Tỉ lệ hoàn thành khoá học thấp kéo dài'
];

function lecturerStatus(index: number): LecturerStatus {
  // 5 hồ sơ đầu tiên giữ đúng dữ liệu của frame Figma "Quản lý giảng viên".
  if (index === 0) return 'active';
  if (index === 1) return 'warning';
  if (index === 2) return 'active';
  if (index === 3) return 'violation';
  if (index === 4) return 'frozen';
  return STATUS_POOL[index % STATUS_POOL.length];
}

function violationsFor(index: number, status: LecturerStatus): DisciplineRecord[] {
  if (index === 1) {
    return [{ level: 'Cảnh cáo · Mức 1', appliedAt: '2026-06-18', reason: 'Chậm phản hồi thảo luận' }];
  }
  if (status === 'warning' || status === 'violation' || status === 'frozen') {
    return [{
      level: status === 'violation' ? 'Cảnh cáo · Mức 2' : 'Cảnh cáo · Mức 1',
      appliedAt: `2026-0${(index % 6) + 1}-${String(4 + (index % 9)).padStart(2, '0')}`,
      reason: VIOLATION_REASONS[index % VIOLATION_REASONS.length]
    }];
  }
  // 16 hồ sơ có lịch sử vi phạm (kể cả đã xử lý xong) — dùng cho KPI "Vi phạm & Cần rà soát".
  if (index % 18 === 0 && index > 0) {
    return [{ level: 'Cảnh cáo · Mức 1', appliedAt: '2026-03-12', reason: VIOLATION_REASONS[index % VIOLATION_REASONS.length] }];
  }
  return [];
}

function buildLecturer(index: number): Lecturer {
  const name = index < LECTURER_NAMES.length ? LECTURER_NAMES[index] : `${pick(LECTURER_NAMES)} ${Math.floor(index / LECTURER_NAMES.length) + 1}`;
  const [specialty, field, stack] = SPECIALTIES[index % SPECIALTIES.length];
  const status = lecturerStatus(index);
  const seed = index + 89;
  const courses = [6, 4, 8, 3, 2, 5, 7, 1][index % 8];
  const learners = [1420, 860, 2180, 410, 290, 1180, 1960, 175][index % 8];
  const revenue = [185000000, 126500000, 302000000, 74800000, 48200000, 141200000, 228600000, 31200000][index % 8];
  const signed = index === 3 ? false : index % 7 !== 0;
  const taxVerified = index === 2 ? false : index % 5 !== 0;
  const month = String((index % 12) + 1).padStart(2, '0');
  const day = String((index % 27) + 1).padStart(2, '0');

  return {
    id: `GV-2026-${String(seed).padStart(3, '0')}`,
    name,
    initials: initialsOf(name),
    email: `${asciiName(name).replace(/\./g, '.')}@thinkup.edu.vn`,
    phone: `(0${90 + (index % 9)}) ${String(100 + (index % 900))} - ${String(200 + (index % 700))}`,
    specialty,
    field,
    stack,
    title: `Senior ${specialty} Engineer`,
    bio: `${8 + (index % 12)} năm phát triển sản phẩm web, tập trung kiến trúc frontend và trải nghiệm người dùng.`,
    courses,
    learners,
    revenue,
    status,
    legalStatus: signed ? 'signed' : 'incomplete',
    taxVerified,
    contractCode: signed ? `HĐ-TU-2026-${String(seed).padStart(4, '0')}` : undefined,
    joinedAt: `2026-${month}-${day}`,
    links: {
      portfolio: `${asciiName(name).split('.')[0]}.dev`,
      linkedin: `linkedin.com/in/${asciiName(name).replace(/\./g, '')}`,
      gsahub: `gsahub.com/${asciiName(name).split('.')[0]}`
    },
    cv: {
      fileName: `CV_${asciiName(name).replace(/\./g, '')}_2026.pdf`,
      size: '4,2 MB',
      uploadedAt: '2026-05-12'
    },
    kyc: {
      cccd: `0${String(70 + (index % 20))}···${String(2841 + index)}`,
      taxCode: `849${String(190000 + index * 37)}`,
      address: `${12 + (index % 60)} Nguyễn Văn Bảo, Gò Vấp, TP. Hồ Chí Minh`,
      verified: taxVerified
    },
    violations: violationsFor(index, status),
    documents: [
      { key: 'cccd', label: 'CCCD / Hộ chiếu', state: 'missing' },
      { key: 'tax', label: 'Mã số thuế cá nhân', state: index === 2 ? 'invalid' : 'missing' },
      { key: 'address', label: 'Địa chỉ pháp lý', state: 'pending' },
      { key: 'bank', label: 'Tài khoản ngân hàng', state: 'missing' },
      { key: 'contract', label: 'Hợp đồng điện tử', state: 'not-started' }
    ],
    disciplineHistory: { warnings: index % 3 === 0 ? 1 : 0, hiddenCourses: status === 'violation' ? 1 : 0 }
  };
}

export const MOCK_LECTURERS: Lecturer[] = Array.from({ length: 284 }, (_, index) => buildLecturer(index));

const STUDENT_NAMES = [
  'Nguyễn Thị An', 'Trần Văn Bình', 'Lê Thị Cẩm Tú', 'Phạm Minh Đức', 'Hoàng Thị Mai',
  'Nguyễn Hoàng Long', 'Trần Mai Anh', 'Vũ Nhật Nam', 'Đỗ Thu Trang', 'Bùi Quốc Khánh',
  'Ngô Phương Thảo', 'Dương Gia Huy', 'Lý Bảo Châu', 'Trịnh Đức Anh', 'Phan Thanh Tùng'
] as const;

const STUDENT_COURSES: EnrolledCourse[] = [
  { name: 'Lập trình Web cơ bản', progress: 75 },
  { name: 'SQL và cơ sở dữ liệu', progress: 40 }
];

function studentStatus(index: number): StudentStatus {
  if (index === 2) return 'locked';
  if (index % 97 === 5) return 'locked';
  if (index % 4 === 3) return 'inactive';
  return 'active';
}

function buildStudent(index: number): Student {
  const name = index < STUDENT_NAMES.length ? STUDENT_NAMES[index] : `${pick(STUDENT_NAMES)} ${index + 1}`;
  const status = studentStatus(index);
  const day = String((index % 27) + 1).padStart(2, '0');
  const month = String((index % 12) + 1).padStart(2, '0');
  const year = 2023 + (index % 4);
  const courseCount = index === 1 ? 0 : [2, 3, 1, 4, 2, 5, 3][index % 7];
  const code = String(1234 + index).padStart(6, '0');

  return {
    id: `HV${code}`,
    name,
    initials: initialsOf(name),
    email: `${asciiName(name).split(' ').pop()}${index}@gmail.com`,
    phone: `0${90 + (index % 9)}${String(1234567 + index * 13).slice(0, 7)}`,
    courseCount,
    orders: Math.max(courseCount, courseCount + (index % 3)),
    registeredAt: `${year}-${month}-${day}`,
    status,
    violations: status === 'locked'
      ? [{ level: 'Cảnh cáo · Mức 1', appliedAt: '2026-05-22', reason: 'Spam bình luận trong khoá học' }]
      : [],
    enrolledCourses: index < 40
      ? [{ name: 'Lập trình Web cơ bản', progress: 75 }, { name: 'SQL và cơ sở dữ liệu', progress: 40 }]
        .slice(0, Math.min(2, Math.max(1, courseCount)))
      : [],
    recentOrder: index < 40
      ? { id: `#ORD-2026-${String(1 + index).padStart(3, '0')}`, amount: 1250000 + index * 50000, paidAt: '2026-07-11T13:05:00+07:00', status: 'Đã thanh toán' }
      : undefined
  };
}

export const MOCK_STUDENTS: Student[] = Array.from({ length: 12480 }, (_, index) => buildStudent(index));

/**
 * Số liệu của các module khác hiển thị trên dải "truy cập nhanh" của trang giảng viên.
 *
 * TODO(pre-deploy): Nhớ thay bằng API thật của module khóa học / chi trả / hỗ trợ
 * (`GET /admin/courses/summary`, `GET /admin/payouts/summary`, `GET /admin/tickets/summary`)
 * khi các module đó được nối; hiện giữ số cố định để dựng UI.
 */
export const USER_MODULE_QUICK_STATS = {
  publishedCourses: 36,
  payoutRequests: 8,
  openTickets: 3
} as const;

/** Danh sách khoá học của một giảng viên — dùng cho popup "Khoá học" ở hồ sơ. */
export function coursesForLecturer(lecturer: Lecturer): LecturerCourseRow[] {
  const statuses: LecturerCourseRow['status'][] = ['published', 'published', 'draft', 'hidden'];
  return Array.from({ length: Math.max(1, Math.min(lecturer.courses, 8)) }, (_, index) => {
    const name = LECTURER_COURSE_OPTIONS[index % LECTURER_COURSE_OPTIONS.length];
    return {
      name: index < LECTURER_COURSE_OPTIONS.length ? name : `${name} · Lớp ${index + 1}`,
      status: statuses[index % statuses.length],
      learners: Math.max(12, Math.round(lecturer.learners / Math.max(1, lecturer.courses)) - index * 17),
      revenue: Math.round(lecturer.revenue / Math.max(1, lecturer.courses)),
      updatedAt: `2026-0${(index % 6) + 4}-0${(index % 9) + 1}`
    };
  });
}

