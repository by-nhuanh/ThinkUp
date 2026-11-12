import { getMongoDb } from '../../user/db.js';
import { createAdminRoleMiddleware } from '../auth/admin-rbac.js';
import {
  getAuditSummary,
  listAuditLogs,
  getAuditLogDetail,
  exportAuditReport,
} from './audit.admin.js';
import {
  getSecuritySummary,
  listAdminUsers,
  listEligibleInternalStaff,
  assignAdminRole,
  changeAdminRole,
  toggleAdminLock,
  resetAdminTwoFactor,
} from './security.admin.js';
import {
  getSystemSettings,
  updateSystemSettings,
} from './settings.admin.js';

export function createAdminSystemRouter(express, adminApiAuth) {
  const router = express.Router();
  const requireSuperAdmin = createAdminRoleMiddleware(['SA']);

  // Middleware bóc tách client context (IP, Device)
  const extractContext = (req) => ({
    ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1',
    device: req.headers['user-agent'] || 'Browser',
    session_id: req.cookies?.admin_session || 'sess_' + req.adminId,
    location: 'Việt Nam',
  });

  const getActor = (req) => ({
    admin_id: req.adminId,
    role: req.adminRole || 'SA',
    name: req.adminUser?.name || 'Super Admin',
    email: req.adminUser?.email || 'admin@thinkup.vn',
    admin_code: req.adminUser?.admin_code || 'SA-001',
  });

  // Áp dụng xác thực Admin cho toàn bộ route
  router.use(adminApiAuth);
  // Chỉ Super Admin (SA) mới có quyền truy cập toàn bộ phân hệ Hệ thống
  router.use(requireSuperAdmin);

  // ==========================================
  // 1. NHẬT KÝ KIỂM TOÁN (AUDIT LOGS)
  // ==========================================
  router.get('/audit/summary', async (req, res) => {
    try {
      const db = await getMongoDb();
      const summary = await getAuditSummary(db);
      res.json(summary);
    } catch (err) {
      res.status(err.status || 500).json({ message: err.message, code: err.code || 'AUDIT_ERROR' });
    }
  });

  router.get('/audit/logs', async (req, res) => {
    try {
      const db = await getMongoDb();
      const result = await listAuditLogs(db, req.query);
      res.json(result);
    } catch (err) {
      res.status(err.status || 500).json({ message: err.message, code: err.code || 'AUDIT_ERROR' });
    }
  });

  router.get('/audit/logs/:id', async (req, res) => {
    try {
      const db = await getMongoDb();
      const detail = await getAuditLogDetail(db, req.params.id);
      if (!detail) return res.status(404).json({ message: 'Không tìm thấy bản ghi kiểm toán.' });
      res.json(detail);
    } catch (err) {
      res.status(err.status || 500).json({ message: err.message, code: err.code || 'AUDIT_ERROR' });
    }
  });

  router.post('/audit/export', async (req, res) => {
    try {
      const db = await getMongoDb();
      const report = await exportAuditReport(db, {
        actor: getActor(req),
        reason: req.body.reason,
        format: req.body.format || 'xlsx',
        filters: req.body.filters || {},
        client_context: extractContext(req),
      });
      res.json(report);
    } catch (err) {
      res.status(err.status || 500).json({ message: err.message, code: err.code || 'EXPORT_ERROR' });
    }
  });

  // ==========================================
  // 2. PHÂN QUYỀN & BẢO MẬT (SECURITY & RBAC)
  // ==========================================
  router.get('/security/summary', async (req, res) => {
    try {
      const db = await getMongoDb();
      const summary = await getSecuritySummary(db);
      res.json(summary);
    } catch (err) {
      res.status(err.status || 500).json({ message: err.message, code: err.code || 'SECURITY_ERROR' });
    }
  });

  router.get('/security/admins', async (req, res) => {
    try {
      const db = await getMongoDb();
      const list = await listAdminUsers(db, {
        ...req.query,
        currentAdminId: req.adminId,
      });
      res.json(list);
    } catch (err) {
      res.status(err.status || 500).json({ message: err.message, code: err.code || 'SECURITY_ERROR' });
    }
  });

  router.get('/security/candidates', async (req, res) => {
    try {
      const db = await getMongoDb();
      const candidates = await listEligibleInternalStaff(db, req.query.search);
      res.json(candidates);
    } catch (err) {
      res.status(err.status || 500).json({ message: err.message, code: err.code || 'SECURITY_ERROR' });
    }
  });

  router.post('/security/assign-role', async (req, res) => {
    try {
      const db = await getMongoDb();
      const result = await assignAdminRole(db, {
        saActor: getActor(req),
        targetEmail: req.body.email,
        targetName: req.body.name,
        role: req.body.role,
        reason: req.body.reason,
        saOtp: req.body.saOtp,
        client_context: extractContext(req),
      });
      res.json(result);
    } catch (err) {
      res.status(err.status || 500).json({ message: err.message, code: err.code || 'ASSIGN_ERROR' });
    }
  });

  router.post('/security/change-role', async (req, res) => {
    try {
      const db = await getMongoDb();
      const result = await changeAdminRole(db, {
        saActor: getActor(req),
        targetAdminId: req.body.adminId,
        newRole: req.body.newRole,
        reason: req.body.reason,
        saOtp: req.body.saOtp,
        client_context: extractContext(req),
      });
      res.json(result);
    } catch (err) {
      res.status(err.status || 500).json({ message: err.message, code: err.code || 'CHANGE_ROLE_ERROR' });
    }
  });

  router.post('/security/toggle-lock', async (req, res) => {
    try {
      const db = await getMongoDb();
      const result = await toggleAdminLock(db, {
        saActor: getActor(req),
        targetAdminId: req.body.adminId,
        lock: Boolean(req.body.lock),
        reason: req.body.reason,
        saOtp: req.body.saOtp,
        client_context: extractContext(req),
      });
      res.json(result);
    } catch (err) {
      res.status(err.status || 500).json({ message: err.message, code: err.code || 'LOCK_ERROR' });
    }
  });

  router.post('/security/reset-2fa', async (req, res) => {
    try {
      const db = await getMongoDb();
      const result = await resetAdminTwoFactor(db, {
        saActor: getActor(req),
        targetAdminId: req.body.adminId,
        reason: req.body.reason,
        saOtp: req.body.saOtp,
        client_context: extractContext(req),
      });
      res.json(result);
    } catch (err) {
      res.status(err.status || 500).json({ message: err.message, code: err.code || 'RESET_2FA_ERROR' });
    }
  });

  // ==========================================
  // 3. CÀI ĐẶT HỆ THỐNG (SETTINGS)
  // ==========================================
  router.get('/settings', async (req, res) => {
    try {
      const db = await getMongoDb();
      const settings = await getSystemSettings(db);
      res.json(settings);
    } catch (err) {
      res.status(err.status || 500).json({ message: err.message, code: err.code || 'SETTINGS_ERROR' });
    }
  });

  router.put('/settings', async (req, res) => {
    try {
      const db = await getMongoDb();
      const result = await updateSystemSettings(db, {
        saActor: getActor(req),
        updates: req.body.updates || {},
        saOtp: req.body.saOtp,
        client_context: extractContext(req),
      });
      res.json(result);
    } catch (err) {
      res.status(err.status || 500).json({ message: err.message, code: err.code || 'UPDATE_SETTINGS_ERROR' });
    }
  });

  return router;
}

