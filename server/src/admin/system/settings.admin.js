import { ObjectId } from 'mongodb';
import { createAuditRecord } from './audit.admin.js';
import { verifySuperAdminOtp } from './security.admin.js';

export const SETTINGS_COLLECTION = 'system_settings';
export const CONFIG_DOC_ID = 'global_config';

/** Chỉ giữ cấu hình chung và các tham số vận hành của hệ thống. */
export const DEFAULT_SYSTEM_SETTINGS = Object.freeze({
  _id: CONFIG_DOC_ID,
  general: {
    site_name: 'ThinkUp Vietnam',
    timezone: 'GMT+07:00',
    language: 'vi',
    hotline: '0901234567',
    address: 'Toà nhà ThinkUp, TP. Hồ Chí Minh',
    logo_url: '/assets/logo.png',
    favicon_url: '/assets/favicon.ico',
  },
  parameters: {
    tax_threshold: 2000000,
    tax_rate: 0.10,
    super_admin_threshold: 20000000,
    payment_timeout_minutes: 15,
    orders_per_page: 20,
    course_review_hours: 48,
    s_match_threshold: 70,
    min_courses_per_milestone: 3,
    test_pass_score: 80,
    student_lock_min_chars: 10,
    lecturer_discipline_min_chars: 10,
    course_reject_min_chars: 10,
  },
});

const ALLOWED_SECTIONS = Object.freeze(['general', 'parameters']);

function pickAllowedSections(updates = {}) {
  return Object.fromEntries(ALLOWED_SECTIONS
    .filter(section => updates[section] && typeof updates[section] === 'object' && !Array.isArray(updates[section]))
    .map(section => [section, updates[section]]));
}

/** Đọc duy nhất Cài đặt chung và Tham số hệ thống. */
export async function getSystemSettings(db) {
  const collection = db.collection(SETTINGS_COLLECTION);
  let doc = await collection.findOne({ _id: CONFIG_DOC_ID });

  if (!doc) {
    await collection.insertOne({ ...DEFAULT_SYSTEM_SETTINGS, created_at: new Date() });
    doc = DEFAULT_SYSTEM_SETTINGS;
  }

  return {
    general: { ...DEFAULT_SYSTEM_SETTINGS.general, ...(doc.general || {}) },
    parameters: { ...DEFAULT_SYSTEM_SETTINGS.parameters, ...(doc.parameters || {}) },
  };
}

/** Cập nhật giới hạn ở Cài đặt chung và Tham số hệ thống. */
export async function updateSystemSettings(db, {
  saActor,
  updates = {},
  saOtp,
  client_context = {},
}) {
  await verifySuperAdminOtp(db, saActor.admin_id, saOtp);

  const collection = db.collection(SETTINGS_COLLECTION);
  const currentDoc = await collection.findOne({ _id: CONFIG_DOC_ID }) || DEFAULT_SYSTEM_SETTINGS;
  const allowedUpdates = pickAllowedSections(updates);
  const updateFields = {
    updated_at: new Date(),
    updated_by: new ObjectId(saActor.admin_id),
  };

  for (const section of ALLOWED_SECTIONS) {
    if (allowedUpdates[section]) {
      updateFields[section] = {
        ...DEFAULT_SYSTEM_SETTINGS[section],
        ...(currentDoc[section] || {}),
        ...allowedUpdates[section],
      };
    }
  }

  await collection.updateOne(
    { _id: CONFIG_DOC_ID },
    { $set: updateFields },
    { upsert: true }
  );

  await createAuditRecord(db, {
    actor: saActor,
    module: 'system_settings',
    module_label: 'Cấu hình sàn',
    action: 'update_settings',
    action_label: 'Lưu cài đặt chung và tham số hệ thống',
    outcome: 'success',
    risk_level: 'high',
    target: {
      id: 'SYS-CONFIG',
      entity_type: 'system_settings',
      name: 'Cài đặt chung và tham số hệ thống',
      meta: 'Cập nhật cấu hình được hỗ trợ',
    },
    client_context,
    basis: { reason: 'Cập nhật cài đặt chung hoặc tham số hệ thống bởi Quản trị tối cao' },
    diff: {
      before: { updated_at: currentDoc.updated_at },
      after: { updated_at: updateFields.updated_at },
    },
  });

  return {
    success: true,
    message: 'Đã lưu cấu hình thành công.',
  };
}
