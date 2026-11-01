import { Injectable, computed, signal } from '@angular/core';
import { MOCK_LECTURERS, MOCK_STUDENTS } from '../../../core/data/mock/user-management.mock';
import {
  DisciplineLevel,
  Lecturer,
  LecturerDocument,
  Student
} from '../models/user-management.models';
import { addDaysIso, todayIso, toIsoDate } from '../user-management.utils';

/**
 * Adapter dữ liệu của module quản lý người dùng.
 *
 * Hiện đọc mock trong `core/data/mock` để dựng và duyệt UI trước, đúng quy ước
 * "mock trước — API sau" của dự án. Khi nối backend, chỉ thay phần thân các hàm
 * bên dưới bằng `HttpClient` và giữ nguyên chữ ký để component không phải sửa.
 *
 * TODO(pre-deploy): Nhớ thay mock bằng các endpoint thật:
 *   GET  /admin/users/lecturers            (danh sách + filter server-side)
 *   GET  /admin/users/students
 *   POST /admin/users/lecturers/:id/discipline
 *   POST /admin/users/lecturers/:id/unlock
 *   POST /admin/users/lecturers/:id/decision     (duyệt / từ chối / yêu cầu bổ sung)
 *   POST /admin/users/students/:id/lock
 */
@Injectable({ providedIn: 'root' })
export class UserManagementService {
  private readonly lecturerState = signal<Lecturer[]>(MOCK_LECTURERS);
  private readonly studentState = signal<Student[]>(MOCK_STUDENTS);

  readonly lecturers = this.lecturerState.asReadonly();
  readonly students = this.studentState.asReadonly();

  readonly lecturerKpis = computed(() => {
    const items = this.lecturerState();
    return {
      total: items.length,
      pending: items.filter((item) => ['pending-review', 'pending-docs', 'pending-contract'].includes(item.status)).length,
      active: items.filter((item) => item.status === 'active').length,
      withViolations: items.filter((item) => item.violations.length > 0).length,
      needAction: items.filter((item) => ['warning', 'violation', 'frozen'].includes(item.status)).length
    };
  });

  readonly studentKpis = computed(() => {
    const items = this.studentState();
    const monthAgo = addDaysIso(todayIso(), -30);
    return {
      total: items.length,
      fresh: items.filter((item) => toIsoDate(item.registeredAt) >= monthAgo).length,
      active: items.filter((item) => item.status === 'active').length,
      locked: items.filter((item) => item.status === 'locked').length
    };
  });

  findLecturer(id: string): Lecturer | undefined {
    return this.lecturerState().find((item) => item.id === id);
  }

  findStudent(id: string): Student | undefined {
    return this.studentState().find((item) => item.id === id);
  }

  /** Áp dụng kỷ luật cho giảng viên, đồng bộ trạng thái bảng danh sách. */
  disciplineLecturer(id: string, level: DisciplineLevel, reason: string, courses: readonly string[] = []): void {
    const nextStatus = level === 1 ? 'warning' : level === 2 ? 'violation' : 'frozen';
    const levelLabel = level === 1 ? 'Cảnh cáo · Mức 1' : level === 2 ? 'Cảnh cáo · Mức 2' : 'Đóng băng · Mức 3';
    this.lecturerState.update((items) => items.map((item) => {
      if (item.id !== id) return item;
      return {
        ...item,
        status: nextStatus,
        violations: [{ level: levelLabel, appliedAt: new Date().toLocaleDateString('vi-VN'), reason }, ...item.violations],
        disciplineHistory: {
          warnings: (item.disciplineHistory?.warnings ?? 0) + (level === 1 ? 1 : 0),
          hiddenCourses: (item.disciplineHistory?.hiddenCourses ?? 0) + (level === 2 ? courses.length || 1 : 0)
        }
      };
    }));
  }

  unlockLecturer(id: string): void {
    this.lecturerState.update((items) => items.map((item) => (item.id === id ? { ...item, status: 'active' } : item)));
  }

  approveLecturer(id: string): void {
    this.lecturerState.update((items) => items.map((item) => {
      if (item.id !== id) return item;
      return { ...item, status: 'pending-contract', legalStatus: 'incomplete' };
    }));
  }

  rejectLecturer(id: string): void {
    this.lecturerState.update((items) => items.map((item) => (item.id === id ? { ...item, status: 'rejected' } : item)));
  }

  requestDocuments(id: string, documentKeys: readonly string[], _guidance: string, deadlineDays: number): void {
    const deadline = addDaysIso(todayIso(), deadlineDays);
    this.lecturerState.update((items) => items.map((item) => {
      if (item.id !== id) return item;
      const documents: LecturerDocument[] = item.documents.map((doc) =>
        documentKeys.includes(doc.key) ? { ...doc, state: 'missing' } : doc
      );
      return { ...item, status: 'pending-docs', documents, documentDeadline: deadline };
    }));
  }

  lockStudent(id: string, level: DisciplineLevel, reason: string): void {
    this.lockStudents([id], level, reason);
  }

  lockStudents(ids: readonly string[], level: DisciplineLevel, reason: string): void {
    const levelLabel = level === 1 ? 'Cảnh cáo · Mức 1' : level === 2 ? 'Cảnh cáo · Mức 2' : 'Đóng băng · Mức 3';
    const appliedAt = new Date().toLocaleDateString('vi-VN');
    this.studentState.update((items) => items.map((item) => {
      if (!ids.includes(item.id)) return item;
      return {
        ...item,
        status: 'locked',
        violations: [{ level: levelLabel, appliedAt, reason }, ...item.violations]
      };
    }));
  }

  unlockStudent(id: string): void {
    this.studentState.update((items) => items.map((item) => (item.id === id ? { ...item, status: 'active' } : item)));
  }
}
