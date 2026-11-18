import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { MOCK_APPROVALS, MOCK_COURSES, MOCK_WORKSPACES } from '../../../core/data/mock/course.mock';
import { MOCK_ROADMAPS, MOCK_STUDIOS } from '../../../core/data/mock/roadmap.mock';
import { ApprovalItem, ApprovalWorkspace, Course, CourseStatus, Roadmap, RoadmapNode, RoadmapStudio, RoadmapTest } from '../models/course.models';
import { CourseDemoService } from './course-demo.service';

interface Page { items?: Array<Record<string, unknown>>; pagination?: { pages?: number; totalPages?: number }; }

/** Base adapter for the verified courses and roadmaps routes. UI-only fields retain safe empty values. */
@Injectable()
export class CourseHttpService extends CourseDemoService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;
  override readonly courses = signal<Course[]>(structuredClone(MOCK_COURSES));
  override readonly approvals = signal<ApprovalItem[]>(structuredClone(MOCK_APPROVALS));
  override readonly roadmaps = signal<Roadmap[]>(structuredClone(MOCK_ROADMAPS));
  override readonly workspaces = signal<ApprovalWorkspace[]>(structuredClone(MOCK_WORKSPACES));
  override readonly studios = signal<RoadmapStudio[]>(structuredClone(MOCK_STUDIOS));

  constructor() { super(); void this.load(); }
  override retry(): void { void this.load(); }
  async load(): Promise<void> {
    try {
      const [courses, approvals, roadmaps] = await Promise.all([
        this.all('/admin/courses'), this.all('/admin/courses/approvals'), this.all('/admin/roadmaps')
      ]);
      this.courses.set(courses.map((row, i) => toCourse(row, this.courses()[i])));
      this.approvals.set(approvals.map((row, i) => toApproval(row, this.approvals()[i])));
      this.roadmaps.set(roadmaps.map((row, i) => toRoadmap(row, this.roadmaps()[i])));
    } catch { /* 403 is intentionally handled on page entry, not by hiding navigation. */ }
  }
  private async all(path: string): Promise<Array<Record<string, unknown>>> {
    const rows: Array<Record<string, unknown>> = []; let page = 1; let pages = 1;
    do {
      const result = await firstValueFrom(this.http.get<Page>(`${this.base}${path}`, { params: new HttpParams().set('page', page).set('pageSize', 100) }));
      rows.push(...(result.items ?? [])); pages = result.pagination?.pages ?? result.pagination?.totalPages ?? 1; page += 1;
    } while (page <= pages);
    return rows;
  }
  override archiveCourse(id: string, reason: string, explanation: string): void { void this.post(`/admin/courses/${encodeURIComponent(id)}/business-status`, { status: 'archived', reason, explanation }); }
  override setCourseStatus(id: string, status: CourseStatus): void { void this.post(`/admin/courses/${encodeURIComponent(id)}/business-status`, { status }); }
  override approveApproval(id: string): void { void this.post(`/admin/courses/approvals/${encodeURIComponent(id)}/decision`, { decision: 'approve' }); }
  override rejectApproval(id: string, reason: string, detail: string): void { void this.post(`/admin/courses/approvals/${encodeURIComponent(id)}/decision`, { decision: 'reject', reason, detail }); }
  override requestSupplement(id: string, items: string[], issueType: string, detail: string): void { void this.post(`/admin/courses/approvals/${encodeURIComponent(id)}/decision`, { decision: 'request_supplement', items, issueType, detail }); }
  override toggleRoadmapVisibility(id: string): void { void this.post(`/admin/roadmaps/${encodeURIComponent(id)}/hide`, {}); }
  override updateRoadmapNode(roadmapId: string, node: RoadmapNode): void { void this.patch(`/admin/roadmaps/${encodeURIComponent(roadmapId)}`, { node }); }
  override saveRoadmapDraft(roadmapId: string): void { void this.patch(`/admin/roadmaps/${encodeURIComponent(roadmapId)}`, { status: 'draft' }); }
  override publishRoadmap(roadmapId: string): void { void this.post(`/admin/roadmaps/${encodeURIComponent(roadmapId)}/publish`, {}); }
  override saveRoadmapTest(roadmapId: string, test: RoadmapTest): void { void this.patch(`/admin/roadmaps/${encodeURIComponent(roadmapId)}`, { test }); }
  private post(path: string, body: unknown): Promise<unknown> { return firstValueFrom(this.http.post(`${this.base}${path}`, body)).then(result => { void this.load(); return result; }); }
  private patch(path: string, body: unknown): Promise<unknown> { return firstValueFrom(this.http.patch(`${this.base}${path}`, body)).then(result => { void this.load(); return result; }); }
}

const text = (row: Record<string, unknown>, ...keys: string[]): string => String(keys.map(key => row[key]).find(value => value != null) ?? '');
const num = (row: Record<string, unknown>, ...keys: string[]): number => Number(keys.map(key => row[key]).find(value => value != null) ?? 0);
function toCourse(row: Record<string, unknown>, fallback: Course): Course { return { ...fallback, id: text(row, 'courseId', 'id') || fallback.id, title: text(row, 'title') || fallback.title, category: text(row, 'category') || fallback.category, instructor: text(row, 'instructorName', 'instructor') || fallback.instructor, instructorId: text(row, 'instructorId') || fallback.instructorId, students: row['learnerCount'] == null ? fallback.students : num(row, 'learnerCount'), price: num(row, 'price') || fallback.price, rating: row['rating'] == null ? fallback.rating : num(row, 'rating'), reviewCount: num(row, 'reviewCount') || fallback.reviewCount, status: text(row, 'status') as CourseStatus || fallback.status, createdAt: text(row, 'createdAt') || fallback.createdAt, updatedAt: text(row, 'updatedAt') || fallback.updatedAt }; }
function toApproval(row: Record<string, unknown>, fallback: ApprovalItem): ApprovalItem { return { ...fallback, id: text(row, 'courseId', 'id') || fallback.id, courseId: text(row, 'courseId') || fallback.courseId, courseTitle: text(row, 'title') || fallback.courseTitle, category: text(row, 'category') || fallback.category, instructor: text(row, 'instructorName', 'instructor') || fallback.instructor, suggestedPrice: num(row, 'price', 'suggestedPrice') || fallback.suggestedPrice, submittedAt: text(row, 'submittedAt', 'createdAt') || fallback.submittedAt }; }
function toRoadmap(row: Record<string, unknown>, fallback: Roadmap): Roadmap { return { ...fallback, id: text(row, 'id', 'roadmapId') || fallback.id, code: text(row, 'code') || fallback.code, name: text(row, 'name', 'title') || fallback.name, industry: text(row, 'industry') || fallback.industry, stages: num(row, 'stages') || fallback.stages, nodes: num(row, 'nodes') || fallback.nodes, learners: num(row, 'learners') || fallback.learners, completion: num(row, 'completion') || fallback.completion, hidden: Boolean(row['hidden'] ?? fallback.hidden) }; }
