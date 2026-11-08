import { Provider } from '@angular/core';
import { CourseDemoService } from './course-demo.service';
import { CourseStore } from './course.store';

// TODO(pre-deploy): Nhớ đổi sang adapter HTTP khi API quản lý khóa học được xác minh.
export const COURSE_PROVIDERS: Provider[] = [
  { provide: CourseStore, useClass: CourseDemoService }
];
