import { InjectionToken, Signal } from '@angular/core';
import { ExportFormat } from '../../../shared/utils/export-formats';
import {
  DisciplineLevel,
  Lecturer,
  LecturerCourseRow,
  Student
} from '../models/user-management.models';

/** Số liệu module khác hiển thị ở dải truy cập nhanh của trang giảng viên. */
export interface UserQuickStats {
  publishedCourses: number;
  /** Backend chưa có API đếm yêu cầu rút tiền — luôn 0 cho tới khi có luồng payout thật. */
  payoutRequests: number;
  openTickets: number;
}

/** Tệp bằng chứng đã tải lên; `id` là mã `uev_...` dùng cho lock/discipline. */
export interface UploadedEvidence {
  id: string;
  filename: string;
}

export interface DisciplineCommand {
  level: DisciplineLevel;
  reason: string;
  /** Mã khóa học (server course id) bị ẩn — bắt buộc ở mức 2. */
  courses?: readonly string[];
  /** Không có trong hợp đồng API hiện tại (chỉ lưu ở audit metadata). */
  ticket?: string;
  /** Tệp bằng chứng cần tải lên trước khi gọi API kỷ luật. */
  files?: readonly File[];
}

export interface LockStudentsCommand {
  ids: readonly string[];
  level: DisciplineLevel;
  reason: string;
  files?: readonly File[];
}

export interface DocumentRequestCommand {
  documentKeys: readonly string[];
  guidance: string;
  deadlineDays: number;
  sendEmail: boolean;
}

export interface RejectLecturerCommand {
  reason: string;
  sendEmail: boolean;
}

/** Bộ lọc danh sách — dùng cho export server-side. */
export interface UserListFilters {
  q?: string;
  status?: string;
  legalStatus?: string;
  courseCount?: string;
  from?: string;
  to?: string;
}

/**
 * Hợp đồng dữ liệu của module quản lý người dùng.
 *
 * `HttpUserManagementDataSource` gọi Admin API thật, `MockUserManagementDataSource` giữ dữ liệu
 * demo cho môi trường không có backend. Component chỉ làm việc với interface này.
 */
export interface UserManagementDataSource {
  readonly lecturers: Signal<readonly Lecturer[]>;
  readonly students: Signal<readonly Student[]>;
  readonly quickStats: Signal<UserQuickStats>;
  /** Chi tiết giảng viên đã tải từ `/admin/users/lecturers/:id`. */
  readonly lecturerDetails: Signal<ReadonlyMap<string, Lecturer>>;
  /** Chi tiết học viên đã tải từ `/admin/users/students/:id`. */
  readonly studentDetails: Signal<ReadonlyMap<string, Student>>;
  /** Khóa học theo giảng viên đã tải từ `/admin/users/lecturers/:id/courses`. */
  readonly coursesByLecturer: Signal<ReadonlyMap<string, readonly LecturerCourseRow[]>>;
  readonly loading: Signal<boolean>;
  /** Thông điệp lỗi tải danh sách (403/500/mạng). `null` khi thành công. */
  readonly error: Signal<string | null>;

  reload(): Promise<void>;
  loadLecturerDetail(id: string): Promise<Lecturer | undefined>;
  loadStudentDetail(id: string): Promise<Student | undefined>;
  loadCoursesFor(id: string): Promise<readonly LecturerCourseRow[]>;

  exportList(kind: 'students' | 'lecturers', format: ExportFormat, filters: UserListFilters): Promise<void>;
  uploadEvidence(userId: string, files: readonly File[]): Promise<readonly UploadedEvidence[]>;

  disciplineLecturer(id: string, command: DisciplineCommand): Promise<void>;
  unlockLecturer(id: string, reason: string): Promise<void>;
  approveLecturer(id: string): Promise<void>;
  rejectLecturer(id: string, command: RejectLecturerCommand): Promise<void>;
  requestDocuments(id: string, command: DocumentRequestCommand): Promise<void>;
  lockStudents(command: LockStudentsCommand): Promise<number>;
  unlockStudent(id: string, reason: string): Promise<void>;
}

export const USER_DATA_SOURCE = new InjectionToken<UserManagementDataSource>('USER_DATA_SOURCE');
