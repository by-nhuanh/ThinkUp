import { Injectable, signal } from '@angular/core';
import { MOCK_APPROVALS, MOCK_COURSES, MOCK_WORKSPACES } from '../../../core/data/mock/course.mock';
import { MOCK_ROADMAPS, MOCK_STUDIOS } from '../../../core/data/mock/roadmap.mock';
import {
  ApprovalItem, ApprovalWorkspace, Course, CourseStatus, Roadmap, RoadmapNode, RoadmapStudio, RoadmapTest
} from '../models/course.models';
import { CourseStore } from './course.store';

// TODO(pre-deploy): Nhớ thay CourseDemoService bằng adapter HTTP khi backend cung cấp API quản lý khóa học.
@Injectable()
export class CourseDemoService extends CourseStore {
  private readonly courseState = signal<Course[]>(clone(MOCK_COURSES));
  private readonly approvalState = signal<ApprovalItem[]>(clone(MOCK_APPROVALS));
  private readonly roadmapState = signal<Roadmap[]>(clone(MOCK_ROADMAPS));
  private readonly workspaceState = signal<ApprovalWorkspace[]>(clone(MOCK_WORKSPACES));
  private readonly studioState = signal<RoadmapStudio[]>(clone(MOCK_STUDIOS));
  private readonly errorState = signal(readDemoLoadError());

  readonly courses = this.courseState.asReadonly();
  readonly approvals = this.approvalState.asReadonly();
  readonly roadmaps = this.roadmapState.asReadonly();
  readonly workspaces = this.workspaceState.asReadonly();
  readonly studios = this.studioState.asReadonly();
  readonly loadError = this.errorState.asReadonly();

  retry(): void {
    this.errorState.set(false);
  }

  archiveCourse(id: string, reason: string, explanation: string): void {
    this.courseState.update(items => items.map(item => item.id === id
      ? { ...item, status: 'archived', updatedAt: new Date().toISOString() }
      : item));
    this.setApprovalForCourse(id, 'Đã lưu trữ khóa học', `Lý do: ${reason}. ${explanation}`);
  }

  setCourseStatus(id: string, status: CourseStatus): void {
    this.courseState.update(items => items.map(item => item.id === id
      ? { ...item, status, updatedAt: new Date().toISOString() }
      : item));
  }

  approveApproval(id: string): void {
    const approval = this.approvalState().find(item => item.id === id);
    this.approvalState.update(items => items.map(item => item.id === id
      ? { ...item, slaStatus: 'approved', slaLabel: 'Đã duyệt', slaHint: 'Hoàn tất hôm nay', action: 'profile' }
      : item));
    if (approval) this.courseState.update(items => items.map(item =>
      item.id === approval.courseId || item.title === approval.courseTitle
        ? { ...item, status: 'published', updatedAt: new Date().toISOString() }
        : item));
    this.log(id, 'Phê duyệt & phát hành', 'Hồ sơ đủ 5 tiêu chí, khóa học được phát hành.');
  }

  rejectApproval(id: string, reason: string, detail: string): void {
    this.approvalState.update(items => items.map(item => item.id === id
      ? { ...item, slaStatus: 'waiting', slaLabel: 'Đã từ chối', slaHint: 'GV nhận thông báo', action: 'history' }
      : item));
    this.log(id, 'Từ chối xuất bản', `${reason}: ${detail}`);
  }

  requestSupplement(id: string, items: string[], issueType: string, detail: string): void {
    this.approvalState.update(rows => rows.map(item => item.id === id
      ? { ...item, slaStatus: 'waiting', slaLabel: 'Chờ GV sửa', slaHint: 'Đã gửi yêu cầu bổ sung', action: 'history' }
      : item));
    this.log(id, 'Yêu cầu bổ sung', `${issueType} · ${items.join(', ')} · ${detail}`);
  }

  toggleRoadmapVisibility(id: string): void {
    this.roadmapState.update(items => items.map(item => item.id === id ? { ...item, hidden: !item.hidden } : item));
  }

  updateRoadmapNode(roadmapId: string, node: RoadmapNode): void {
    this.studioState.update(studios => studios.map(studio => studio.roadmapId === roadmapId
      ? {
          ...studio,
          phases: studio.phases.map(phase => ({
            ...phase,
            nodes: phase.nodes.map(item => item.id === node.id ? { ...node } : item)
          }))
        }
      : studio));
  }

  saveRoadmapDraft(roadmapId: string): void {
    this.log(roadmapId, 'Lưu bản nháp', 'Cấu hình lộ trình và node đã được lưu nháp.');
  }

  publishRoadmap(roadmapId: string): void {
    this.roadmapState.update(items => items.map(item => item.id === roadmapId ? { ...item, hidden: false } : item));
    this.log(roadmapId, 'Xuất bản lộ trình', 'Lộ trình được phát hành cho học viên.');
  }

  saveRoadmapTest(roadmapId: string, test: RoadmapTest): void {
    this.studioState.update(studios => studios.map(studio => studio.roadmapId === roadmapId
      ? { ...studio, test }
      : studio));
  }

  reset(): void {
    this.courseState.set(clone(MOCK_COURSES));
    this.approvalState.set(clone(MOCK_APPROVALS));
    this.roadmapState.set(clone(MOCK_ROADMAPS));
    this.workspaceState.set(clone(MOCK_WORKSPACES));
    this.studioState.set(clone(MOCK_STUDIOS));
  }

  private setApprovalForCourse(courseId: string, action: string, note: string): void {
    const approval = this.approvalState().find(item => item.courseId === courseId);
    if (approval) this.log(approval.id, action, note);
  }

  private log(approvalId: string, action: string, note: string): void {
    this.workspaceState.update(items => items.map(item => item.approvalId === approvalId
      ? {
          ...item,
          history: [{ at: new Date().toISOString(), actor: 'Quản trị viên', action, note }, ...item.history]
        }
      : item));
  }
}

// TODO(pre-deploy): Nhớ xóa cờ demo ?courseError=1 khi nối API thật, lỗi sẽ lấy từ HTTP response.
function readDemoLoadError(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('courseError') === '1';
}

function clone<T>(value: T): T {
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}
