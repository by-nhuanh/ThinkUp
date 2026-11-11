import { Injectable, signal } from '@angular/core';
import {
  MOCK_LECTURERS,
  MOCK_STUDENTS,
  USER_MODULE_QUICK_STATS,
  coursesForLecturer
} from '../../../core/data/mock/user-management.mock';
import {
  DisciplineLevel,
  Lecturer,
  LecturerCourseRow,
  LecturerDocument,
  Student
} from '../models/user-management.models';
import { addDaysIso, lockDeadlineIso, nowIso, todayIso } from '../user-management.utils';
import {
  DisciplineCommand,
  DocumentRequestCommand,
  LockStudentsCommand,
  RejectLecturerCommand,
  UserManagementDataSource,
  UserQuickStats
} from './user-management.data-source';

/** Số ngày khoá của từng mức kỷ luật; `null` = vô thời hạn. */
const LOCK_DAYS: Record<DisciplineLevel, number | null> = { 1: 7, 2: 30, 3: null };

const LEVEL_LABELS: Record<DisciplineLevel, string> = {
  1: 'Cảnh cáo · Mức 1',
  2: 'Cảnh cáo · Mức 2',
  3: 'Đóng băng · Mức 3'
};

const LEVEL_STATUS = { 1: 'warning', 2: 'violation', 3: 'frozen' } as const;

/**
 * Implementation mock của `UserManagementDataSource`.
 *
 * TODO(pre-deploy): Nhớ xoá cùng thư mục `core/data/mock/user-management.mock.ts` khi nối API
 * và thay provider trong `user-management.providers.ts`.
 */
@Injectable({ providedIn: 'root' })
export class MockUserManagementDataSource implements UserManagementDataSource {
  private readonly lecturerState = signal<readonly Lecturer[]>(MOCK_LECTURERS);
  private readonly studentState = signal<readonly Student[]>(MOCK_STUDENTS);
  private readonly quickStatsState = signal<UserQuickStats>({ ...USER_MODULE_QUICK_STATS });

  readonly lecturers = this.lecturerState.asReadonly();
  readonly students = this.studentState.asReadonly();
  readonly quickStats = this.quickStatsState.asReadonly();

  coursesForLecturer(lecturer: Lecturer): LecturerCourseRow[] {
    return coursesForLecturer(lecturer);
  }

  disciplineLecturer(id: string, command: DisciplineCommand): void {
    const courses = command.level === 2 ? command.courses ?? [] : [];
    // Mức 2 chỉ có nghĩa khi chỉ ra khoá học bị ẩn — không tự gán một khoá học bất kỳ.
    if (command.level === 2 && courses.length === 0) return;

    this.lecturerState.update((items) => items.map((item) => {
      if (item.id !== id) return item;
      return {
        ...item,
        status: LEVEL_STATUS[command.level],
        lockLevel: command.level,
        lockedUntil: lockDeadlineIso(LOCK_DAYS[command.level]),
        violations: [{
          level: LEVEL_LABELS[command.level],
          appliedAt: nowIso(),
          reason: command.reason,
          ticket: command.ticket?.trim() || undefined,
          evidence: command.evidence?.length ? [...command.evidence] : undefined
        }, ...item.violations],
        disciplineHistory: {
          warnings: (item.disciplineHistory?.warnings ?? 0) + (command.level === 1 ? 1 : 0),
          hiddenCourses: (item.disciplineHistory?.hiddenCourses ?? 0) + courses.length
        }
      };
    }));
  }

  unlockLecturer(id: string): void {
    this.lecturerState.update((items) => items.map((item) => (
      item.id === id ? { ...item, status: 'active', lockLevel: undefined, lockedUntil: undefined } : item
    )));
  }

  approveLecturer(id: string): void {
    this.lecturerState.update((items) => items.map((item) => (
      item.id === id ? { ...item, status: 'pending-contract', legalStatus: 'incomplete' } : item
    )));
  }

  rejectLecturer(id: string, command: RejectLecturerCommand): void {
    this.lecturerState.update((items) => items.map((item) => (
      item.id === id
        ? {
          ...item,
          status: 'rejected',
          rejection: { reason: command.reason, sendEmail: command.sendEmail, decidedAt: nowIso() }
        }
        : item
    )));
  }

  requestDocuments(id: string, command: DocumentRequestCommand): void {
    const deadline = addDaysIso(todayIso(), command.deadlineDays);
    this.lecturerState.update((items) => items.map((item) => {
      if (item.id !== id) return item;
      const documents: LecturerDocument[] = item.documents.map((doc) =>
        command.documentKeys.includes(doc.key) ? { ...doc, state: 'missing' } : doc
      );
      return {
        ...item,
        status: 'pending-docs',
        documents,
        documentRequest: {
          keys: [...command.documentKeys],
          guidance: command.guidance,
          deadline,
          sendEmail: command.sendEmail
        }
      };
    }));
  }

  lockStudents(command: LockStudentsCommand): void {
    const days = LOCK_DAYS[command.level];
    const lockedUntil = lockDeadlineIso(days);
    const record = {
      level: LEVEL_LABELS[command.level],
      appliedAt: nowIso(),
      reason: command.reason,
      evidence: command.evidence?.length ? [...command.evidence] : undefined
    };

    this.studentState.update((items) => items.map((item) => {
      if (!command.ids.includes(item.id)) return item;
      return {
        ...item,
        status: 'locked',
        lockedUntil,
        lockLevel: command.level,
        lockReason: command.reason,
        violations: [record, ...item.violations]
      };
    }));
  }

  unlockStudent(id: string): void {
    this.studentState.update((items) => items.map((item) => (
      item.id === id
        ? { ...item, status: 'active', lockedUntil: undefined, lockLevel: undefined, lockReason: undefined }
        : item
    )));
  }
}
