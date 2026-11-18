import { Injectable, computed, inject } from '@angular/core';
import {
  DisciplineCommand,
  DocumentRequestCommand,
  LockStudentsCommand,
  RejectLecturerCommand,
  USER_DATA_SOURCE,
  UserListFilters
} from '../data/user-management.data-source';
import { ExportFormat } from '../../../shared/utils/export-formats';
import { Lecturer, LecturerCourseRow, Student } from '../models/user-management.models';
import { addDaysIso, todayIso } from '../user-management.utils';

/**
 * Facade dữ liệu của module quản lý người dùng.
 *
 * Mọi thao tác đi qua `USER_DATA_SOURCE` (xem `data/user-management.providers.ts`), nên component
 * không biết dữ liệu đến từ Admin API hay bộ mock demo. Các lệnh ghi trả `Promise` để trang hiển
 * thị trạng thái đang xử lý và lỗi thật từ server.
 */
@Injectable({ providedIn: 'root' })
export class UserManagementService {
  private readonly source = inject(USER_DATA_SOURCE);

  readonly lecturers = this.source.lecturers;
  readonly students = this.source.students;
  readonly quickStats = this.source.quickStats;
  readonly lecturerDetails = this.source.lecturerDetails;
  readonly studentDetails = this.source.studentDetails;
  readonly coursesByLecturer = this.source.coursesByLecturer;
  readonly loading = this.source.loading;
  readonly error = this.source.error;

  readonly lecturerKpis = computed(() => {
    const items = this.lecturers();
    return {
      total: items.length,
      pending: items.filter((item) => ['pending-review', 'pending-docs', 'pending-contract'].includes(item.status)).length,
      active: items.filter((item) => item.status === 'active').length,
      withViolations: items.filter((item) => item.status === 'warning' || item.status === 'violation' || item.status === 'frozen').length,
      needAction: items.filter((item) => ['warning', 'violation', 'frozen'].includes(item.status)).length
    };
  });

  readonly studentKpis = computed(() => {
    const items = this.students();
    const monthAgo = addDaysIso(todayIso(), -30);
    return {
      total: items.length,
      fresh: items.filter((item) => item.registeredAt >= monthAgo).length,
      active: items.filter((item) => item.status === 'active').length,
      locked: items.filter((item) => item.status === 'locked').length
    };
  });

  findLecturer(id: string): Lecturer | undefined {
    return this.lecturers().find((item) => item.id === id);
  }

  findStudent(id: string): Student | undefined {
    return this.students().find((item) => item.id === id);
  }

  lecturerDetail(id: string): Lecturer | undefined {
    return this.lecturerDetails().get(id) ?? this.findLecturer(id);
  }

  studentDetail(id: string): Student | undefined {
    return this.studentDetails().get(id) ?? this.findStudent(id);
  }

  reload(): Promise<void> {
    return this.source.reload();
  }

  loadLecturerDetail(id: string): Promise<Lecturer | undefined> {
    return this.source.loadLecturerDetail(id);
  }

  loadStudentDetail(id: string): Promise<Student | undefined> {
    return this.source.loadStudentDetail(id);
  }

  loadCoursesFor(id: string): Promise<readonly LecturerCourseRow[]> {
    return this.source.loadCoursesFor(id);
  }

  coursesFor(id: string): readonly LecturerCourseRow[] {
    return this.coursesByLecturer().get(id) ?? [];
  }

  exportList(kind: 'students' | 'lecturers', format: ExportFormat, filters: UserListFilters): Promise<void> {
    return this.source.exportList(kind, format, filters);
  }

  disciplineLecturer(id: string, command: DisciplineCommand): Promise<void> {
    return this.source.disciplineLecturer(id, command);
  }

  unlockLecturer(id: string, reason: string): Promise<void> {
    return this.source.unlockLecturer(id, reason);
  }

  approveLecturer(id: string): Promise<void> {
    return this.source.approveLecturer(id);
  }

  rejectLecturer(id: string, command: RejectLecturerCommand): Promise<void> {
    return this.source.rejectLecturer(id, command);
  }

  requestDocuments(id: string, command: DocumentRequestCommand): Promise<void> {
    return this.source.requestDocuments(id, command);
  }

  lockStudents(command: LockStudentsCommand): Promise<number> {
    return this.source.lockStudents(command);
  }

  unlockStudent(id: string, reason: string): Promise<void> {
    return this.source.unlockStudent(id, reason);
  }
}
