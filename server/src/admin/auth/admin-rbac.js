export const ADMIN_ROLES = Object.freeze(['SA', 'CA', 'FA', 'CS']);

const LEGACY_ROLE_MAP = Object.freeze({
  ADMIN: 'SA',
  SUPER_ADMIN: 'SA',
  CONTENT_ADMIN: 'CA',
  ACADEMIC_ADMIN: 'CA',
  FINANCE_ADMIN: 'FA',
  SUPPORT_ADMIN: 'CS',
  CUSTOMER_SUPPORT: 'CS',
});

export function normalizeAdminRole(role) {
  const normalized = typeof role === 'string' ? role.trim().toUpperCase() : '';
  if (ADMIN_ROLES.includes(normalized)) return normalized;
  return LEGACY_ROLE_MAP[normalized] || null;
}

export function createAdminRoleMiddleware(allowedRoles) {
  const allowed = new Set((Array.isArray(allowedRoles) ? allowedRoles : [])
    .map(normalizeAdminRole).filter(Boolean));

  return (req, res, next) => {
    if (!req.adminRole || !allowed.has(req.adminRole)) {
      return res.status(403).json({ message: 'Bạn không có quyền thực hiện thao tác này.', code: 'ADMIN_FORBIDDEN' });
    }
    return next();
  };
}
