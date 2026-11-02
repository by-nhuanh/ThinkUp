import { Provider } from '@angular/core';
import { USER_DATA_SOURCE } from './user-management.data-source';
import { MockUserManagementDataSource } from './user-management.mock-data-source';

/**
 * Nguồn dữ liệu của module quản lý người dùng.
 *
 * TODO(pre-deploy): Nhớ thay `MockUserManagementDataSource` bằng implementation `HttpClient`
 * khi backend sẵn sàng và xoá `MockUserManagementDataSource` cùng
 * `core/data/mock/user-management.mock.ts`. Endpoint dự kiến:
 *   GET   /admin/users/lecturers                  (danh sách + filter server-side)
 *   GET   /admin/users/students
 *   GET   /admin/users/summary                    (số liệu dải truy cập nhanh)
 *   GET   /admin/users/lecturers/:id/courses
 *   POST  /admin/users/lecturers/:id/discipline
 *   POST  /admin/users/lecturers/:id/unlock
 *   POST  /admin/users/lecturers/:id/decision     (duyệt / từ chối / yêu cầu bổ sung)
 *   POST  /admin/users/students/:id/lock
 *   POST  /admin/users/students/:id/unlock
 */
export function provideUserManagementDataSource(): Provider {
  return { provide: USER_DATA_SOURCE, useExisting: MockUserManagementDataSource };
}
