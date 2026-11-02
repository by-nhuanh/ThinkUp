import { Injectable, computed, inject } from '@angular/core';
import {
  DisciplineCommand,
  DocumentRequestCommand,
  LockStudentsCommand,
  RejectLecturerCommand,
  USER_DATA_SOURCE
} from '../data/user-management.data-source';
import { Lecturer, LecturerCourseRow, Student } from '../models/user-management.models';
import { addDaysIso, todayIso } from '../user-management.utils';

/**
 * Adapter dữ liệu của module quản lý người dùng.
 *
 * Mọi thao tác đi qua `USER_DATA_SOURCE` (xem `data/user-management.providers.ts`), nên khi nối
 * backend chỉ cần thay provider — component và service giữ nguyên chữ ký.
 */
@Injectable({ providedIn: 'root' })
export class UserManagementService {
  private readonly source = inject(USER_DATA_SOURCE);

  readonly lecturers = this.source.lecturers;
  readonly students = this.source.students;
  readonly quickStats = this.source.quickStats;

  readonly lecturerKpis = computed(() => {
    const items = this.lecturers();
    return {
      total: items.length,
      pending: items.filter((item) => ['pending-review', 'pending-docs', 'pending-contract'].includes(item.status)).length,
      active: items.filter((item) => item.status === 'active').length,
      withViolations: items.filter((item) => item.violations.length > 0).length,
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

  coursesForLecturer(lecturer: Lecturer): LecturerCourseRow[] {
    return this.source.coursesForLecturer(lecturer);
  }

  disciplineLecturer(id: string, command: DisciplineCommand): void {
    this.source.disciplineLecturer(id, command);
  }

  unlockLecturer(id: string): void {
    this.source.unlockLecturer(id);
  }

  approveLecturer(id: string): void {
    this.source.approveLecturer(id);
  }

  rejectLecturer(id: string, command: RejectLecturerCommand): void {
    this.source.rejectLecturer(id, command);
  }

  requestDocuments(id: string, command: DocumentRequestCommand): void {
    this.source.requestDocuments(id, command);
  }

  lockStudents(command: LockStudentsCommand): void {
    this.source.lockStudents(command);
  }

  unlockStudent(id: string): void {
    this.source.unlockStudent(id);
  }
}
