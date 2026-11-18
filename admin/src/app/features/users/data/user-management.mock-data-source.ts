import { Injectable, signal } from '@angular/core';
import {
  MOCK_LECTURERS,
  MOCK_STUDENTS,
  USER_MODULE_QUICK_STATS,
  coursesForLecturer
} from '../../../core/data/mock/user-management.mock';
import { downloadTable, ExportFormat } from '../../../shared/utils/export-formats';
import {
  DisciplineLevel,
  Lecturer,
  LecturerCourseRow,
  LecturerDocument,
  Student
} from '../models/user-management.models';
import { addDaysIso, formatDate, lockDeadlineIso, nowIso, todayIso } from '../user-management.utils';
import { LECTURER_STATUS_LABELS, STUDENT_STATUS_LABELS } from '../models/user-management.labels';
import {
  DisciplineCommand,
  DocumentRequestCommand,
  LockStudentsCommand,
  RejectLecturerCommand,
  UploadedEvidence,
  UserListFilters,
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
 * Implementation demo của `UserManagementDataSource`.
 *
 * TODO(pre-deploy): Nhớ xoá cùng thư mục `core/data/mock/user-management.mock.ts` khi chốt
 * xoá mock; đổi `environment.adminDataSource` ở `environment.ts` để chọn lại nguồn.
 */
@Injectable({ providedIn: 'root' })
export class MockUserManagementDataSource implements UserManagementDataSource {
  private readonly lecturerState = signal<readonly Lecturer[]>(MOCK_LECTURERS);
  private readonly studentState = signal<readonly Student[]>(MOCK_STUDENTS);
  private readonly quickStatsState = signal<UserQuickStats>({ ...USER_MODULE_QUICK_STATS });
  private readonly detailState = signal<ReadonlyMap<string, Lecturer>>(new Map());
  private readonly studentDetailState = signal<ReadonlyMap<string, Student>>(new Map());
  private readonly coursesState = signal<ReadonlyMap<string, readonly LecturerCourseRow[]>>(new Map());

  readonly lecturers = this.lecturerState.asReadonly();
  readonly students = this.studentState.asReadonly();
  readonly quickStats = this.quickStatsState.asReadonly();
  readonly lecturerDetails = this.detailState.asReadonly();
  readonly studentDetails = this.studentDetailState.asReadonly();
  readonly coursesByLecturer = this.coursesState.asReadonly();
  readonly loading = signal(false).asReadonly();
  readonly error = signal<string | null>(null).asReadonly();

  async reload(): Promise<void> {
    this.lecturerState.set(MOCK_LECTURERS);
    this.studentState.set(MOCK_STUDENTS);
    this.quickStatsState.set({ ...USER_MODULE_QUICK_STATS });
  }

  async loadLecturerDetail(id: string): Promise<Lecturer | undefined> {
    const item = this.lecturerState().find((entry) => entry.id === id);
    if (item) this.cacheDetail(id, item);
    return item;
  }

  async loadStudentDetail(id: string): Promise<Student | undefined> {
    const item = this.studentState().find((entry) => entry.id === id);
    if (item) this.cacheStudent(id, item);
    return item;
  }

  async loadCoursesFor(id: string): Promise<readonly LecturerCourseRow[]> {
    const lecturer = this.lecturerState().find((entry) => entry.id === id);
    const rows = lecturer ? coursesForLecturer(lecturer) : [];
    this.coursesState.update((current) => new Map(current).set(id, rows));
    return rows;
  }

  async exportList(kind: 'students' | 'lecturers', format: ExportFormat, filters: UserListFilters): Promise<void> {
    const query = (filters.q ?? '').toLocaleLowerCase('vi-VN');
    if (kind === 'lecturers') {
      const rows = this.lecturerState()
        .filter((item) => !query || [item.name, item.email, item.phone, item.id].join(' ').toLocaleLowerCase('vi-VN').includes(query))
        .map((item) => [item.id, item.name, item.email, item.phone, item.specialty, item.courses, item.learners, item.revenue,
          item.legalStatus === 'signed' ? 'Đã ký hợp đồng điện tử' : 'Chưa hoàn tất hợp đồng',
          LECTURER_STATUS_LABELS[item.status], formatDate(item.joinedAt)]);
      await downloadTable(format, 'thinkup-giang-vien', [
        ['Mã giảng viên', 'Họ tên', 'Email', 'Số điện thoại', 'Chuyên môn', 'Khóa học', 'Học viên', 'Doanh thu', 'Pháp lý', 'Trạng thái', 'Tham gia'],
        ...rows
      ]);
      return;
    }

    const rows = this.studentState()
      .filter((item) => !query || [item.id, item.name, item.email, item.phone].join(' ').toLocaleLowerCase('vi-VN').includes(query))
      .map((item) => [item.id, item.name, item.email, item.phone, item.courseCount, formatDate(item.registeredAt), STUDENT_STATUS_LABELS[item.status]]);
    await downloadTable(format, 'thinkup-hoc-vien', [
      ['Mã học viên', 'Họ tên', 'Email', 'Số điện thoại', 'Số khóa học', 'Ngày đăng ký', 'Trạng thái'],
      ...rows
    ]);
  }

  async uploadEvidence(userId: string, files: readonly File[]): Promise<readonly UploadedEvidence[]> {
    // Demo giữ tên tệp làm mã tạm; API thật trả mã `uev_...`.
    void userId;
    return files.slice(0, 5).map((file, index) => ({ id: `demo-evidence-${index}`, filename: file.name }));
  }

  async disciplineLecturer(id: string, command: DisciplineCommand): Promise<void> {
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
          evidence: command.files?.length ? command.files.map((file) => file.name) : undefined
        }, ...item.violations],
        disciplineHistory: {
          warnings: (item.disciplineHistory?.warnings ?? 0) + (command.level === 1 ? 1 : 0),
          hiddenCourses: (item.disciplineHistory?.hiddenCourses ?? 0) + courses.length
        }
      };
    }));
  }

  async unlockLecturer(id: string, reason: string): Promise<void> {
    void reason;
    this.lecturerState.update((items) => items.map((item) => (
      item.id === id ? { ...item, status: 'active', lockLevel: undefined, lockedUntil: undefined } : item
    )));
  }

  async approveLecturer(id: string): Promise<void> {
    this.lecturerState.update((items) => items.map((item) => (
      item.id === id ? { ...item, status: 'pending-contract', legalStatus: 'incomplete' } : item
    )));
  }

  async rejectLecturer(id: string, command: RejectLecturerCommand): Promise<void> {
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

  async requestDocuments(id: string, command: DocumentRequestCommand): Promise<void> {
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

  async lockStudents(command: LockStudentsCommand): Promise<number> {
    const days = LOCK_DAYS[command.level];
    const lockedUntil = lockDeadlineIso(days);
    const record = {
      level: LEVEL_LABELS[command.level],
      appliedAt: nowIso(),
      reason: command.reason,
      evidence: command.files?.length ? command.files.map((file) => file.name) : undefined
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
    return command.ids.length;
  }

  async unlockStudent(id: string, reason: string): Promise<void> {
    void reason;
    this.studentState.update((items) => items.map((item) => (
      item.id === id
        ? { ...item, status: 'active', lockedUntil: undefined, lockLevel: undefined, lockReason: undefined }
        : item
    )));
  }

  private cacheDetail(id: string, item: Lecturer): void {
    this.detailState.update((current) => new Map(current).set(id, item));
  }

  private cacheStudent(id: string, item: Student): void {
    this.studentDetailState.update((current) => new Map(current).set(id, item));
  }
}
