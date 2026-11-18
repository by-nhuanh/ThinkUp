import { SettingsParameters } from '../models/system.models';

export type PlatformSettingKey =
  | 'platformRevenueShare' | 'lecturerRevenueShare' | 'taxThreshold' | 'taxRate' | 'superAdminThreshold'
  | 'courseReviewHours' | 'skillMasteryThreshold' | 'knowledgeGapThreshold'
  | 'paymentTimeout' | 'studentLockReasonMin' | 'lecturerDisciplineReasonMin' | 'courseRejectReasonMin'
  | 'minWithdrawal' | 'maxWithdrawalsPerWeek';

export type PlatformSettings = Pick<SettingsParameters, PlatformSettingKey>;

export interface PlatformSettingField {
  key: PlatformSettingKey;
  label: string;
  unit: string;
  min: number;
  max?: number;
  step: number;
}

export interface PlatformSettingGroup {
  id: string;
  title: string;
  description: string;
  icon: string;
  blocks: readonly { title: string; description: string; fields: readonly PlatformSettingField[] }[];
}

const percent = (key: PlatformSettingKey, label: string): PlatformSettingField => ({ key, label, unit: '%', min: 0, max: 100, step: 0.01 });
const integer = (key: PlatformSettingKey, label: string, unit: string, min = 1, max?: number): PlatformSettingField => ({ key, label, unit, min, max, step: 1 });

export const PLATFORM_SETTING_GROUPS: readonly PlatformSettingGroup[] = [
  {
    id: 'finance', title: 'Tài chính và doanh thu', description: 'Quản lý phân chia học phí, khấu trừ thuế và hạn mức phê duyệt.',
    icon: 'M12 3v18 M16 7H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H7',
    blocks: [
      { title: 'Tỷ lệ phân chia doanh thu mặc định', description: 'Phân chia học phí giữa ThinkUp và giảng viên đối với đơn hàng thành công. Tổng tỷ lệ bằng 100%.',
        fields: [percent('platformRevenueShare', 'Tỷ lệ sàn giữ lại'), percent('lecturerRevenueShare', 'Tỷ lệ giảng viên nhận')] },
      { title: 'Ngưỡng khấu trừ thuế TNCN', description: 'Ngưỡng thanh toán và thuế suất khấu trừ áp dụng cho khoản chi trả giảng viên.',
        fields: [integer('taxThreshold', 'Ngưỡng rút tiền tính thuế', 'VNĐ', 0), percent('taxRate', 'Thuế suất khấu trừ')] },
      { title: 'Hạn mức phê duyệt tiền rút', description: 'Hạn mức Finance Admin được trực tiếp phê duyệt trước khi chuyển cấp.',
        fields: [integer('superAdminThreshold', 'Hạn mức chuyển cấp duyệt', 'VNĐ')] }
    ]
  },
  {
    id: 'education', title: 'Tiêu chuẩn đào tạo', description: 'Thiết lập thời hạn kiểm định và ngưỡng đánh giá năng lực học viên.',
    icon: 'M3 4h7a3 3 0 0 1 3 3v14a3 3 0 0 0-3-3H3V4Z M13 7a3 3 0 0 1 3-3h5v14h-5a3 3 0 0 0-3 3',
    blocks: [
      { title: 'Thời hạn duyệt khóa học - SLA', description: 'Thời gian tối đa để bộ phận phụ trách hoàn tất thẩm định khóa học mới.',
        fields: [integer('courseReviewHours', 'Hạn xử lý kiểm định', 'giờ')] },
      { title: 'Ngưỡng đạt năng lực kỹ năng', description: 'Điểm tối thiểu xác định học viên làm chủ kỹ năng trong Roadmap, dựa trên bài định vị, bài kiểm tra Node hoặc Quiz/Lab.',
        fields: [integer('skillMasteryThreshold', 'Tỷ lệ điểm đạt chuẩn', '%', 1, 100)] },
      { title: 'Ngưỡng cảnh báo lỗ hổng kiến thức', description: 'Điểm dưới ngưỡng này được đánh dấu Cờ cam cho kỹ năng cần củng cố trong Roadmap.',
        fields: [integer('knowledgeGapThreshold', 'Ngưỡng cảnh báo Cờ cam', '%', 0, 99)] }
    ]
  },
  {
    id: 'operations', title: 'Vận hành và kỷ luật', description: 'Quản lý thời gian giữ đơn, căn cứ xử lý vi phạm và điều kiện rút tiền.',
    icon: 'M12 3 4 6v5c0 5 8 10 8 10s8-5 8-10V6l-8-3Z M9 12l2 2 4-4',
    blocks: [
      { title: 'Thời gian chờ thanh toán đơn hàng', description: 'Thời hạn giữ đơn khi người mua chưa hoàn tất thanh toán.',
        fields: [integer('paymentTimeout', 'Thời gian giữ đơn hàng', 'phút')] },
      { title: 'Số ký tự tối thiểu khi xử phạt', description: 'Độ dài tối thiểu của nội dung giải trình cho từng quyết định quản trị.',
        fields: [integer('studentLockReasonMin', 'Lý do khóa học viên', 'ký tự'), integer('lecturerDisciplineReasonMin', 'Lý do kỷ luật giảng viên', 'ký tự'), integer('courseRejectReasonMin', 'Lý do từ chối khóa học', 'ký tự')] },
      { title: 'Hạn mức rút tiền tối thiểu', description: 'Điều kiện tạo yêu cầu rút tiền từ ví khả dụng về ngân hàng, giúp giảm tải đối soát thủ công.',
        fields: [integer('minWithdrawal', 'Số tiền rút tối thiểu', 'VNĐ'), integer('maxWithdrawalsPerWeek', 'Số lệnh rút tối đa mỗi tuần', 'lệnh')] }
    ]
  }
];

export const PLATFORM_SETTING_FIELDS = PLATFORM_SETTING_GROUPS.flatMap(group => group.blocks.flatMap(block => block.fields));

export function pickPlatformSettings(parameters: SettingsParameters): PlatformSettings {
  return Object.fromEntries(PLATFORM_SETTING_FIELDS.map(field => [field.key, parameters[field.key]])) as PlatformSettings;
}

export function validatePlatformSettings(parameters: PlatformSettings): Partial<Record<PlatformSettingKey, string>> {
  const errors: Partial<Record<PlatformSettingKey, string>> = {};
  for (const field of PLATFORM_SETTING_FIELDS) {
    const value = parameters[field.key];
    if (!Number.isFinite(value)) errors[field.key] = 'Vui lòng nhập giá trị.';
    else if (value < field.min || (field.max !== undefined && value > field.max)) {
      errors[field.key] = field.max !== undefined ? `Nhập giá trị từ ${field.min} đến ${field.max}.` : `Giá trị phải từ ${field.min} trở lên.`;
    } else if (field.step === 1 && !Number.isSafeInteger(value)) errors[field.key] = 'Vui lòng nhập số nguyên hợp lệ.';
    else if (field.step !== 1 && Math.abs(value * 100 - Math.round(value * 100)) > 0.000001) errors[field.key] = 'Chỉ nhập tối đa 2 chữ số thập phân.';
  }
  if (!errors.platformRevenueShare && !errors.lecturerRevenueShare
    && Math.abs(parameters.platformRevenueShare + parameters.lecturerRevenueShare - 100) > 0.000001) {
    errors.lecturerRevenueShare = 'Tổng tỷ lệ của sàn và giảng viên phải bằng 100%.';
  }
  if (!errors.knowledgeGapThreshold && !errors.skillMasteryThreshold
    && parameters.knowledgeGapThreshold >= parameters.skillMasteryThreshold) {
    errors.knowledgeGapThreshold = 'Ngưỡng Cờ cam phải thấp hơn tỷ lệ điểm đạt chuẩn.';
  }
  return errors;
}
