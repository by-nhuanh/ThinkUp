import { CanDeactivateFn } from '@angular/router';

export interface HasUnsavedChanges {
  canLeave(): boolean | Promise<boolean>;
}

/**
 * Chặn rời form hồ sơ khi còn thay đổi chưa lưu.
 * Dùng cho cả nút Quay lại/Hủy bỏ lẫn điều hướng qua menu header.
 */
export const unsavedChangesGuard: CanDeactivateFn<HasUnsavedChanges> = (component) => {
  if (!component) return true;
  return component.canLeave();
};
