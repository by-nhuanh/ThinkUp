import { Provider } from '@angular/core';
import { SYSTEM_STORE } from './system.store';
import { SystemDemoService } from './system-demo.service';

/**
 * TODO(pre-deploy): Nhớ thay `SystemDemoService` bằng implementation `HttpClient` khi backend
 * sẵn sàng và xóa `core/data/mock/system.mock.ts`. Endpoint dự kiến:
 *   GET   /admin/system/admins          (danh sách quản trị viên + phân trang server-side)
 *   GET   /admin/system/audit-logs      (nhật ký kiểm toán + filter server-side)
 *   GET   /admin/system/audit-logs/:id  (chi tiết log, before/after, checksum)
 *   POST  /admin/system/admins/:id/role | /lock | /unlock | /reset-2fa
 *   GET   /admin/system/settings
 *   PUT   /admin/system/settings        (yêu cầu OTP phê duyệt)
 */
export const SYSTEM_PROVIDERS: Provider[] = [
  { provide: SYSTEM_STORE, useExisting: SystemDemoService }
];