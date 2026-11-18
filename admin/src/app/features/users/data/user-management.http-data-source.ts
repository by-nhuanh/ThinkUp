import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { downloadServerExport } from '../../../shared/utils/api-export';
import { apiErrorMessage } from '../../../shared/utils/api-error';
import { API_FETCH_PAGE_SIZE, collectAllPages } from '../../../shared/utils/api-paging';
import { ExportFormat } from '../../../shared/utils/export-formats';
import {
  DisciplineLevel,
  EnrolledCourse,
  Lecturer,
  LecturerCourseRow,
  LecturerDocument,
  LecturerLegalStatus,
  LecturerStatus,
  Student,
  StudentStatus
} from '../models/user-management.models';
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

/** Phần response dùng chung của Admin API. */
interface ApiEnvelope {
  success?: boolean;
}

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  pages: number;
}

interface LecturerApiItem {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  status?: string;
  legalStatus?: string;
  specialty?: string;
  field?: string;
  title?: string;
  courses?: number;
  learners?: number;
  revenue?: number;
  taxCode?: string | null;
  cccd?: string | null;
  registeredAt?: string | null;
  lockedUntil?: string | null;
  lockLevel?: number | null;
}

interface StudentApiItem {
  id: string;
  studentId?: string | null;
  name?: string;
  email?: string;
  phone?: string;
  status?: string;
  courseCount?: number;
  orders?: number;
  registeredAt?: string | null;
  lockedUntil?: string | null;
  lockLevel?: number | null;
  lockReason?: string | null;
}

interface LecturerListResponse extends ApiEnvelope {
  items: LecturerApiItem[];
  pagination: Pagination;
}

interface StudentListResponse extends ApiEnvelope {
  items: StudentApiItem[];
  pagination: Pagination;
}

interface LecturerSummaryResponse extends ApiEnvelope {
  total: number;
  fresh: number;
  active: number;
  locked: number;
  pending: number;
  quickStats?: { publishedCourses?: number; openTickets?: number };
}

interface StudentSummaryResponse extends ApiEnvelope {
  total: number;
  fresh: number;
  active: number;
  locked: number;
}

interface LecturerDocumentApi {
  id?: string;
  type?: string;
  title?: string;
  filename?: string;
  mimeType?: string;
  status?: string;
  isSample?: boolean;
  downloadUrl?: string;
}

interface LecturerDetailResponse extends ApiEnvelope {
  user: LecturerApiItem & { status?: string };
  profile: {
    id?: string | null;
    title?: string;
    field?: string;
    stack?: string[] | string;
    bio?: string;
    links?: { portfolio?: string; linkedin?: string; gsahub?: string };
    documents?: LecturerDocumentApi[];
    status?: string;
  } | null;
  application: {
    status?: string;
    phase?: string;
    legalStatus?: string;
    kyc?: { verified?: boolean } | null;
    taxVerified?: boolean;
    submittedAt?: string | null;
  } | null;
  privateData?: {
    kyc?: { verified?: boolean; address?: string } | null;
    taxCode?: string | null;
    cccd?: string | null;
    address?: string | null;
  };
}

interface StudentDetailResponse extends ApiEnvelope {
  user: StudentApiItem;
  courses?: Array<{ name?: string; title?: string; progress?: number }>;
  orders?: Array<{ id?: string; amount?: number; paidAt?: string; status?: string }>;
  disciplineHistory?: Array<{ action?: string; at?: string; level?: number; reason?: string }>;
}

interface CoursesResponse extends ApiEnvelope {
  items: Array<{
    id: string;
    name?: string;
    status?: string;
    learners?: number;
    revenue?: number;
    updatedAt?: string | null;
  }>;
}

const LECTURER_STATUSES: readonly LecturerStatus[] = [
  'active', 'pending-review', 'pending-docs', 'pending-contract', 'warning', 'violation', 'frozen', 'rejected'
];

/**
 * Adapter HTTP của module quản lý người dùng — gọi `/api/admin/users/*`.
 *
 * Cách tải dữ liệu: mỗi lần `reload()` sẽ đọc hết các trang (pageSize=100) để giữ nguyên bộ lọc,
 * tìm kiếm và phân trang phía client đang có. Khi dữ liệu người dùng đủ lớn để cần lọc server-side
 * thật sự, chuyển các computed trong component sang query API (TODO trong từng trang).
 */
@Injectable({ providedIn: 'root' })
export class HttpUserManagementDataSource implements UserManagementDataSource {
  private readonly http = inject(HttpClient);
  private readonly api = `${environment.apiUrl}/admin/users`;

  private readonly lecturerState = signal<readonly Lecturer[]>([]);
  private readonly studentState = signal<readonly Student[]>([]);
  private readonly quickStatsState = signal<UserQuickStats>({ publishedCourses: 0, payoutRequests: 0, openTickets: 0 });
  private readonly lecturerDetailState = signal<ReadonlyMap<string, Lecturer>>(new Map());
  private readonly studentDetailState = signal<ReadonlyMap<string, Student>>(new Map());
  private readonly coursesState = signal<ReadonlyMap<string, readonly LecturerCourseRow[]>>(new Map());
  private readonly loadingState = signal(false);
  private readonly errorState = signal<string | null>(null);

  readonly lecturers = this.lecturerState.asReadonly();
  readonly students = this.studentState.asReadonly();
  readonly quickStats = this.quickStatsState.asReadonly();
  readonly lecturerDetails = this.lecturerDetailState.asReadonly();
  readonly studentDetails = this.studentDetailState.asReadonly();
  readonly coursesByLecturer = this.coursesState.asReadonly();
  readonly loading = this.loadingState.asReadonly();
  readonly error = this.errorState.asReadonly();

  constructor() {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loadingState.set(true);
    this.errorState.set(null);

    try {
      const [lecturers, students, lecturerSummary, studentSummary] = await Promise.all([
        this.fetchAll<LecturerApiItem, LecturerListResponse>('lecturers'),
        this.fetchAll<StudentApiItem, StudentListResponse>('students'),
        firstValueFrom(this.http.get<LecturerSummaryResponse>(`${this.api}/lecturers/summary`)),
        firstValueFrom(this.http.get<StudentSummaryResponse>(`${this.api}/students/summary`))
      ]);

      this.lecturerState.set(lecturers.map((item) => this.toLecturer(item)));
      this.studentState.set(students.map((item) => this.toStudent(item)));
      this.quickStatsState.set({
        publishedCourses: Number(lecturerSummary.quickStats?.publishedCourses ?? 0),
        // Payout request API chưa tồn tại (handoff ghi rõ) — giữ 0, không giả lập số.
        payoutRequests: 0,
        openTickets: Number(lecturerSummary.quickStats?.openTickets ?? 0)
      });
      // Summary chỉ dùng để đối chiếu; KPI trong trang vẫn tính từ danh sách đang hiển thị.
      void studentSummary;
    } catch (error) {
      this.errorState.set(apiErrorMessage(error, 'Không tải được danh sách người dùng.'));
    } finally {
      this.loadingState.set(false);
    }
  }

  async loadLecturerDetail(id: string): Promise<Lecturer | undefined> {
    try {
      const response = await firstValueFrom(
        this.http.get<LecturerDetailResponse>(`${this.api}/lecturers/${encodeURIComponent(id)}`)
      );
      const base = this.lecturerState().find((item) => item.id === id);
      const detail = this.toLecturerDetail(response, base);
      this.lecturerDetailState.update((current) => new Map(current).set(id, detail));
      return detail;
    } catch (error) {
      throw new Error(apiErrorMessage(error, 'Không tải được hồ sơ giảng viên.'));
    }
  }

  async loadStudentDetail(id: string): Promise<Student | undefined> {
    try {
      const response = await firstValueFrom(
        this.http.get<StudentDetailResponse>(`${this.api}/students/${encodeURIComponent(id)}`)
      );
      const base = this.studentState().find((item) => item.id === id);
      const detail = this.toStudentDetail(response, base);
      this.studentDetailState.update((current) => new Map(current).set(id, detail));
      return detail;
    } catch (error) {
      throw new Error(apiErrorMessage(error, 'Không tải được hồ sơ học viên.'));
    }
  }

  async loadCoursesFor(id: string): Promise<readonly LecturerCourseRow[]> {
    const response = await firstValueFrom(
      this.http.get<CoursesResponse>(`${this.api}/lecturers/${encodeURIComponent(id)}/courses`)
    );
    const rows: LecturerCourseRow[] = (response.items ?? []).map((course) => ({
      // Backend trả ObjectId khóa học; đây cũng là giá trị phải gửi lại trong `courseIds` của API kỷ luật.
      code: course.id,
      name: course.name || course.id,
      status: course.status === 'published' || course.status === 'draft' ? course.status : 'hidden',
      learners: Number(course.learners ?? 0),
      revenue: Number(course.revenue ?? 0),
      updatedAt: course.updatedAt || ''
    }));
    this.coursesState.update((current) => new Map(current).set(id, rows));
    return rows;
  }

  async exportList(kind: 'students' | 'lecturers', format: ExportFormat, filters: UserListFilters): Promise<void> {
    // Ghi chú hợp đồng: `/admin/users/{students,lecturers}/export` hiện CHỈ trả CSV và bỏ qua `format`.
    // Vì vậy UI chỉ mời CSV; nếu backend bổ sung Excel, mở lại lựa chọn ở component.
    if (format !== 'csv') {
      throw new Error('Máy chủ hiện chỉ hỗ trợ xuất CSV cho danh sách người dùng.');
    }
    await downloadServerExport(this.http, {
      url: `${this.api}/${kind}/export`,
      params: {
        q: filters.q,
        status: filters.status,
        legalStatus: filters.legalStatus,
        courseCount: filters.courseCount,
        from: filters.from,
        to: filters.to
      },
      fallbackFilename: kind === 'students' ? 'thinkup-students' : 'thinkup-lecturers',
      format: 'csv'
    });
  }

  async uploadEvidence(userId: string, files: readonly File[]): Promise<readonly UploadedEvidence[]> {
    const accepted = ['image/png', 'image/jpeg', 'application/pdf'];
    const uploaded: UploadedEvidence[] = [];
    for (const file of files.slice(0, 5)) {
      if (!accepted.includes(file.type)) {
        throw new Error(`Tệp "${file.name}" không hợp lệ: chỉ nhận PNG, JPG hoặc PDF.`);
      }
      if (file.size > 20 * 1024 * 1024) {
        throw new Error(`Tệp "${file.name}" vượt quá 20 MB.`);
      }
      const response = await firstValueFrom(this.http.post<{ success: boolean; evidence: UploadedEvidence }>(
        `${this.api}/evidence/${encodeURIComponent(userId)}`,
        file,
        {
          headers: {
            'Content-Type': file.type || 'application/octet-stream',
            'X-File-Name': encodeURIComponent(file.name)
          }
        }
      ));
      uploaded.push(response.evidence);
    }
    return uploaded;
  }

  async disciplineLecturer(id: string, command: DisciplineCommand): Promise<void> {
    const files = command.files ?? [];
    if (!files.length) throw new Error('Cần tải lên ít nhất một tệp bằng chứng.');
    const evidence = await this.uploadEvidence(id, files);
    await firstValueFrom(this.http.post(`${this.api}/lecturers/${encodeURIComponent(id)}/discipline`, {
      level: command.level,
      reason: command.reason,
      // UI ghi chú ticket nhưng hợp đồng API hiện tại không có trường này; chỉ gửi khi có để không bị từ chối.
      ...(command.ticket?.trim() ? { ticket: command.ticket.trim() } : {}),
      evidence: evidence.map((file) => file.id),
      courseIds: command.level === 2 ? [...(command.courses ?? [])] : []
    }));
    await this.reload();
  }

  async unlockLecturer(id: string, reason: string): Promise<void> {
    await firstValueFrom(this.http.post(`${this.api}/lecturers/${encodeURIComponent(id)}/unlock`, { reason }));
    await this.reload();
  }

  async approveLecturer(id: string): Promise<void> {
    await firstValueFrom(this.http.post(`${this.api}/lecturers/${encodeURIComponent(id)}/decision`, {
      action: 'approve',
      sendEmail: true
    }));
    await this.reload();
  }

  async rejectLecturer(id: string, command: RejectLecturerCommand): Promise<void> {
    await firstValueFrom(this.http.post(`${this.api}/lecturers/${encodeURIComponent(id)}/decision`, {
      action: 'reject',
      reason: command.reason,
      sendEmail: command.sendEmail
    }));
    await this.reload();
  }

  async requestDocuments(id: string, command: DocumentRequestCommand): Promise<void> {
    await firstValueFrom(this.http.post(`${this.api}/lecturers/${encodeURIComponent(id)}/decision`, {
      action: 'request-documents',
      documentKeys: [...command.documentKeys],
      guidance: command.guidance,
      deadlineDays: command.deadlineDays,
      sendEmail: command.sendEmail
    }));
    await this.reload();
  }

  async lockStudents(command: LockStudentsCommand): Promise<number> {
    const files = command.files ?? [];
    if (!files.length) throw new Error('Cần tải lên ít nhất một tệp bằng chứng cho mỗi học viên.');

    // Hợp đồng API yêu cầu bằng chứng riêng theo từng học viên (owner-bound). UI chọn một bộ tệp
    // cho cả đợt nên tải cùng bộ tệp lên từng tài khoản đích trước khi gọi khoá hàng loạt.
    const evidenceByTarget: Record<string, string[]> = {};
    for (const id of command.ids) {
      const uploaded = await this.uploadEvidence(id, files);
      evidenceByTarget[id] = uploaded.map((file) => file.id);
    }

    const response = await firstValueFrom(this.http.post<{ success: boolean; affected?: number; mailFailed?: number }>(
      `${this.api}/students/lock`,
      {
        ids: [...command.ids],
        level: command.level,
        reason: command.reason,
        evidenceByTarget
      }
    ));
    await this.reload();
    return Number(response.affected ?? command.ids.length);
  }

  async unlockStudent(id: string, reason: string): Promise<void> {
    await firstValueFrom(this.http.post(`${this.api}/students/${encodeURIComponent(id)}/unlock`, { reason }));
    await this.reload();
  }

  private async fetchAll<TItem, TResponse extends { items: TItem[]; pagination: Pagination }>(
    kind: 'students' | 'lecturers'
  ): Promise<TItem[]> {
    const result = await collectAllPages<TItem>(
      async (page, pageSize) => {
        const params = new HttpParams({ fromObject: { page: String(page), pageSize: String(pageSize) } });
        const response = await firstValueFrom(this.http.get<TResponse>(`${this.api}/${kind}`, { params }));
        return {
          items: response.items ?? [],
          total: response.pagination?.total ?? 0,
          page: response.pagination?.page ?? page,
          pageSize: response.pagination?.pageSize ?? pageSize,
          pages: response.pagination?.pages ?? 1
        };
      },
      API_FETCH_PAGE_SIZE
    );
    return result.items;
  }

  private toLecturer(item: LecturerApiItem): Lecturer {
    return {
      id: item.id,
      name: item.name || item.email || item.id,
      initials: initialsOf(item.name || item.email || ''),
      email: item.email || '',
      phone: item.phone || '',
      specialty: item.specialty || item.field || '',
      field: item.field || '',
      stack: '',
      title: item.title || '',
      bio: '',
      courses: Number(item.courses ?? 0),
      learners: Number(item.learners ?? 0),
      revenue: Number(item.revenue ?? 0),
      status: normalizeLecturerStatus(item.status),
      legalStatus: normalizeLegalStatus(item.legalStatus),
      // Danh sách không trả cờ xác minh thuế; chỉ hồ sơ chi tiết mới có `application.taxVerified`.
      taxVerified: false,
      joinedAt: item.registeredAt || '',
      links: {},
      kyc: {
        cccd: item.cccd || '',
        taxCode: item.taxCode || '',
        address: '',
        verified: false
      },
      violations: [],
      lockLevel: normalizeLevel(item.lockLevel),
      lockedUntil: item.lockedUntil || undefined,
      documents: []
    };
  }

  private toLecturerDetail(response: LecturerDetailResponse, base?: Lecturer): Lecturer {
    const user = response.user;
    const profile = response.profile;
    const application = response.application;
    const privateData = response.privateData;
    const documents = (profile?.documents ?? []).map(toDocument);
    const cvDocument = documents.find((doc) => /cv|resume|hồ sơ/i.test(`${doc.label} ${doc.filename ?? ''}`));

    return {
      ...(base ?? this.toLecturer(user)),
      id: user.id,
      name: user.name || base?.name || user.email || user.id,
      initials: initialsOf(user.name || base?.name || ''),
      email: user.email || base?.email || '',
      phone: user.phone || base?.phone || '',
      title: profile?.title || base?.title || '',
      field: profile?.field || base?.field || '',
      stack: stackText(profile?.stack),
      bio: profile?.bio || '',
      links: {
        portfolio: profile?.links?.portfolio || '',
        linkedin: profile?.links?.linkedin || '',
        gsahub: profile?.links?.gsahub || ''
      },
      cv: cvDocument
        ? {
          fileName: cvDocument.filename || cvDocument.label,
          // API không trả dung lượng tệp hồ sơ — hiển thị MIME type thay vì bịa số.
          size: cvDocument.mimeType || '',
          uploadedAt: ''
        }
        : undefined,
      status: normalizeLecturerStatus(application?.status || profile?.status || user.status || base?.status),
      legalStatus: normalizeLegalStatus(application?.legalStatus || base?.legalStatus),
      taxVerified: application?.taxVerified === true,
      kyc: {
        cccd: privateData?.cccd || base?.kyc.cccd || '',
        taxCode: privateData?.taxCode || base?.kyc.taxCode || '',
        address: privateData?.address || privateData?.kyc?.address || '',
        verified: application?.kyc?.verified === true || privateData?.kyc?.verified === true
      },
      // API chưa có endpoint lịch sử kỷ luật của giảng viên; giữ danh sách rỗng thay vì suy diễn.
      violations: base?.violations ?? [],
      documents
    };
  }

  private toStudent(item: StudentApiItem): Student {
    return {
      id: item.id,
      name: item.name || item.email || item.id,
      initials: initialsOf(item.name || item.email || ''),
      email: item.email || '',
      phone: item.phone || '',
      courseCount: Number(item.courseCount ?? 0),
      orders: Number(item.orders ?? 0),
      registeredAt: item.registeredAt || '',
      status: normalizeStudentStatus(item.status),
      violations: [],
      enrolledCourses: [],
      lockedUntil: item.lockedUntil || undefined,
      lockLevel: normalizeLevel(item.lockLevel),
      lockReason: item.lockReason || undefined
    };
  }

  private toStudentDetail(response: StudentDetailResponse, base?: Student): Student {
    const user = response.user;
    const courses: EnrolledCourse[] = (response.courses ?? []).map((course) => ({
      name: course.name || course.title || '',
      progress: Number(course.progress ?? 0)
    }));
    const firstOrder = (response.orders ?? [])[0];
    return {
      ...(base ?? this.toStudent(user)),
      id: user.id,
      name: user.name || base?.name || user.email || user.id,
      initials: initialsOf(user.name || base?.name || ''),
      email: user.email || base?.email || '',
      phone: user.phone || base?.phone || '',
      courseCount: Number(user.courseCount ?? courses.length),
      orders: Number(user.orders ?? base?.orders ?? 0),
      registeredAt: user.registeredAt || base?.registeredAt || '',
      status: normalizeStudentStatus(user.status || base?.status),
      enrolledCourses: courses,
      recentOrder: firstOrder
        ? {
          id: firstOrder.id || '',
          amount: Number(firstOrder.amount ?? 0),
          paidAt: firstOrder.paidAt || '',
          status: firstOrder.status || ''
        }
        : base?.recentOrder,
      // Lịch sử kỷ luật lấy từ audit `USER_STUDENT_*` do backend trả về.
      violations: (response.disciplineHistory ?? [])
        .filter((entry) => String(entry.action || '').startsWith('USER_STUDENT_LOCK'))
        .map((entry) => ({
          level: entry.level ? `Cảnh cáo · Mức ${entry.level}` : 'Xử lý kỷ luật',
          appliedAt: entry.at || '',
          reason: entry.reason || ''
        })),
      lockedUntil: user.lockedUntil || base?.lockedUntil,
      lockLevel: normalizeLevel(user.lockLevel) ?? base?.lockLevel,
      lockReason: user.lockReason || base?.lockReason
    };
  }
}

function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  const last = words[words.length - 1];
  return (words.length > 1 ? words[0][0] + last[0] : last.slice(0, 2)).toLocaleUpperCase('vi-VN');
}

function stackText(stack: string[] | string | undefined): string {
  if (Array.isArray(stack)) return stack.filter(Boolean).join(', ');
  return stack || '';
}

function normalizeLecturerStatus(value: string | undefined): LecturerStatus {
  return (LECTURER_STATUSES as readonly string[]).includes(String(value)) ? value as LecturerStatus : 'active';
}

function normalizeLegalStatus(value: string | undefined): LecturerLegalStatus {
  return value === 'signed' ? 'signed' : 'incomplete';
}

function normalizeStudentStatus(value: string | undefined): StudentStatus {
  return value === 'locked' || value === 'inactive' ? value : 'active';
}

function normalizeLevel(value: number | null | undefined): DisciplineLevel | undefined {
  return value === 1 || value === 2 || value === 3 ? value : undefined;
}

function toDocument(doc: LecturerDocumentApi): LecturerDocument {
  const status = String(doc.status || 'uploaded').toLocaleLowerCase();
  const state: LecturerDocument['state'] = status === 'missing'
    ? 'missing'
    : status === 'invalid'
      ? 'invalid'
      : 'pending';
  return {
    key: doc.type || doc.id || doc.filename || doc.title || 'document',
    label: doc.title || doc.filename || 'Tài liệu hồ sơ',
    state,
    id: doc.id,
    filename: doc.filename,
    mimeType: doc.mimeType,
    downloadUrl: doc.downloadUrl
  };
}
