/**
 * P2 — Admin preferences.
 *
 * One document per admin, addressed by the adminId from the verified JWT.
 * The document keeps a monotonic `revision` so concurrent tabs cannot
 * silently overwrite each other (optimistic concurrency).
 */
import { getMongoDb } from '../../user/db.js';

export const ADMIN_PREFERENCES_COLLECTION = 'admin_preferences';

export const THEME_VALUES = Object.freeze(['light', 'dark']);
export const DENSITY_VALUES = Object.freeze(['compact', 'standard', 'comfortable']);

/**
 * Defaults intentionally preserve the current product behaviour:
 * no breadcrumb, no status bar, light theme, standard density.
 * `Asia/Ho_Chi_Minh` is the product's primary locale and a valid IANA zone.
 */
export const DEFAULT_ADMIN_PREFERENCES = Object.freeze({
  breadcrumbsVisible: false,
  timezone: 'Asia/Ho_Chi_Minh',
  statusBarEnabled: false,
  theme: 'light',
  density: 'standard',
});

const MAX_TIMEZONE_LENGTH = 64;

function failure(message, status = 400, code = 'PREFERENCES_INVALID') {
  return Object.assign(new Error(message), { status, code });
}

const TIMEZONE_FORMATTERS = new Map();

/** IANA validation uses the platform ICU database, including current DST rules. */
export function isValidIanaTimezone(value) {
  if (typeof value !== 'string') return false;
  const timezone = value.trim();
  if (!timezone || timezone.length > MAX_TIMEZONE_LENGTH) return false;
  // Tên IANA luôn bắt đầu bằng chữ cái; chuỗi offset như "+07:00" không phải IANA.
  if (!/^[A-Za-z][A-Za-z0-9_+\-/.]+$/.test(timezone)) return false;
  if (TIMEZONE_FORMATTERS.has(timezone)) return true;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    TIMEZONE_FORMATTERS.set(timezone, true);
    return true;
  } catch {
    return false;
  }
}

export function normalizePreferences(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw failure('Dữ liệu tuỳ chọn không hợp lệ.');
  }

  const allowedKeys = new Set(Object.keys(DEFAULT_ADMIN_PREFERENCES));
  const unknownKey = Object.keys(input).find((key) => !allowedKeys.has(key));
  if (unknownKey) {
    throw failure(`Trường tuỳ chọn không được hỗ trợ: ${unknownKey}.`, 400, 'PREFERENCES_FIELD_INVALID');
  }

  const source = input;
  const result = { ...DEFAULT_ADMIN_PREFERENCES };

  for (const key of ['breadcrumbsVisible', 'statusBarEnabled']) {
    if (source[key] !== undefined) {
      if (typeof source[key] !== 'boolean') {
        throw failure(`Giá trị ${key} phải là boolean.`);
      }
      result[key] = source[key];
    }
  }

  if (source.timezone !== undefined) {
    if (!isValidIanaTimezone(source.timezone)) {
      throw failure('Múi giờ không hợp lệ. Vui lòng chọn múi giờ IANA.', 400, 'PREFERENCES_TIMEZONE_INVALID');
    }
    result.timezone = source.timezone.trim();
  }

  if (source.theme !== undefined) {
    if (!THEME_VALUES.includes(source.theme)) {
      throw failure('Chủ đề không hợp lệ.');
    }
    result.theme = source.theme;
  }

  if (source.density !== undefined) {
    if (!DENSITY_VALUES.includes(source.density)) {
      throw failure('Mật độ hiển thị không hợp lệ.');
    }
    result.density = source.density;
  }

  return result;
}

function view(doc, isDefault) {
  return {
    success: true,
    preferences: { ...DEFAULT_ADMIN_PREFERENCES, ...(doc?.preferences || {}) },
    revision: doc?.revision ?? 0,
    isDefault: Boolean(isDefault),
    updatedAt: doc?.updated_at ? new Date(doc.updated_at).toISOString() : null,
  };
}

export async function getAdminPreferences(adminId, options = {}) {
  if (typeof adminId !== 'string' || !adminId.trim()) {
    throw failure('Yêu cầu đăng nhập quản trị viên.', 401, 'PREFERENCES_AUTH_REQUIRED');
  }
  const db = options.db || (await getMongoDb());
  const doc = await db.collection(ADMIN_PREFERENCES_COLLECTION).findOne({ admin_id: adminId });
  return view(doc, !doc);
}

function conflict(current) {
  const error = failure('Tuỳ chọn đã được thay đổi ở phiên khác. Vui lòng tải lại.', 409, 'PREFERENCES_CONFLICT');
  error.current = view(current, !current);
  return error;
}

/**
 * Saves preferences when `revision` still matches the stored revision.
 * `revision = 0` means "no document yet". Returns the new revision.
 */
export async function saveAdminPreferences(adminId, input, options = {}) {
  if (typeof adminId !== 'string' || !adminId.trim()) {
    throw failure('Yêu cầu đăng nhập quản trị viên.', 401, 'PREFERENCES_AUTH_REQUIRED');
  }
  if (!input || typeof input !== 'object') {
    throw failure('Dữ liệu tuỳ chọn không hợp lệ.');
  }
  const expectedRevision = input.revision;
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    throw failure('Phiên bản tuỳ chọn không hợp lệ.', 400, 'PREFERENCES_REVISION_INVALID');
  }
  const preferences = normalizePreferences(input.preferences);
  const db = options.db || (await getMongoDb());
  const collection = db.collection(ADMIN_PREFERENCES_COLLECTION);
  const now = options.now ? new Date(options.now) : new Date();

  const existing = await collection.findOne({ admin_id: adminId });
  const currentRevision = existing?.revision ?? 0;
  if (expectedRevision !== currentRevision) {
    throw conflict(existing);
  }

  if (!existing) {
    const document = {
      admin_id: adminId,
      preferences,
      revision: 1,
      created_at: now,
      updated_at: now,
    };
    try {
      await collection.insertOne(document);
    } catch (error) {
      // A concurrent first save won the race; surface the conflict instead of duplicating.
      if (error?.code === 11000) {
        throw conflict(await collection.findOne({ admin_id: adminId }));
      }
      throw error;
    }
    return view(document, false);
  }

  const result = await collection.updateOne(
    { _id: existing._id, admin_id: adminId, revision: currentRevision },
    {
      $set: { preferences, updated_at: now },
      $inc: { revision: 1 },
    },
  );

  if (!result || (result.matchedCount !== undefined && result.matchedCount === 0)) {
    throw conflict(await collection.findOne({ admin_id: adminId }));
  }

  const updated = await collection.findOne({ admin_id: adminId });
  return view(updated, false);
}

/** Idempotent index plan for the new collection; safe to call on startup. */
export async function ensureAdminPreferencesIndexes(db) {
  const collection = (db || (await getMongoDb())).collection(ADMIN_PREFERENCES_COLLECTION);
  await collection.createIndex({ admin_id: 1 }, { name: 'admin_unique', unique: true });
}

/** Router factory keeps auth middleware injected and testable. */
export function createAdminPreferencesRouter(express, requireAdmin, options = {}) {
  if (typeof requireAdmin !== 'function') {
    throw new Error('createAdminPreferencesRouter requires admin auth middleware');
  }
  const router = express.Router();

  router.get('/', requireAdmin, async (req, res, next) => {
    try {
      res.set('Cache-Control', 'no-store');
      res.json(await getAdminPreferences(req.adminId, options));
    } catch (error) {
      next(error);
    }
  });

  router.put('/', requireAdmin, async (req, res, next) => {
    try {
      res.set('Cache-Control', 'no-store');
      res.json(await saveAdminPreferences(req.adminId, req.body, options));
    } catch (error) {
      if (error?.code === 'PREFERENCES_CONFLICT' && error.current) {
        return res.status(error.status || 409).json({
          message: error.message,
          code: error.code,
          current: error.current,
        });
      }
      next(error);
    }
  });

  return router;
}
