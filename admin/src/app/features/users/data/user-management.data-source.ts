import { InjectionToken, Signal } from '@angular/core';
import {
  DisciplineLevel,
  Lecturer,
  LecturerCourseRow,
  Student
} from '../models/user-management.models';

/** Số liệu module khác hiển thị ở dải truy cập nhanh của trang giảng viên. */
export interface UserQuickStats {
  publishedCourses: number;
  payoutRequests: number;
  openTickets: number;
}

export interface DisciplineCommand {
  level: DisciplineLevel;
  reason: string;
  /** Chỉ dùng cho mức 2 — danh sách khoá học bị ẩn. */
  courses?: readonly string[];
  ticket?: string;
  evidence?: readonly string[];
}

export interface LockStudentsCommand {
  ids: readonly string[];
  level: DisciplineLevel;
  reason: string;
  evidence?: readonly string[];
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

/**
 * Hợp đồng dữ liệu của module quản lý người dùng.
 *
 * Thay `USER_DATA_SOURCE` bằng implementation HTTP khi backend sẵn sàng — component
 * và service không phải sửa vì mọi thao tác đã đi qua interface này.
 */
export interface UserManagementDataSource {
  readonly lecturers: Signal<readonly Lecturer[]>;
  readonly students: Signal<readonly Student[]>;
  readonly quickStats: Signal<UserQuickStats>;

  coursesForLecturer(lecturer: Lecturer): LecturerCourseRow[];
  disciplineLecturer(id: string, command: DisciplineCommand): void;
  unlockLecturer(id: string): void;
  approveLecturer(id: string): void;
  rejectLecturer(id: string, command: RejectLecturerCommand): void;
  requestDocuments(id: string, command: DocumentRequestCommand): void;
  lockStudents(command: LockStudentsCommand): void;
  unlockStudent(id: string): void;
}

export const USER_DATA_SOURCE = new InjectionToken<UserManagementDataSource>('USER_DATA_SOURCE');
