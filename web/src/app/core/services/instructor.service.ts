import { Injectable } from '@angular/core';
import { Instructor } from '../models/instructor.model';
import { MOCK_INSTRUCTORS, findMockInstructor } from '../data/mock/mock-instructors';

@Injectable({ providedIn: 'root' })
export class InstructorService {
  // TODO(pre-deploy): Nhớ thay registry mock này bằng API hồ sơ giảng viên thật.
  private readonly instructors: Instructor[] = MOCK_INSTRUCTORS;

  getInstructors(): Instructor[] {
    return this.instructors;
  }

  /** Hồ sơ công khai dùng cho trang chi tiết và popup nổi (đồng bộ để hover mở tức thì). */
  getInstructor(ref: string | null | undefined): Instructor | null {
    return findMockInstructor(ref);
  }

  getProfileLink(instructor: Instructor): string {
    return `/instructors/${instructor.id}`;
  }
}
