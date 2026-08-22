const { canonicalizeRoleName } = require('../utils/roles');

const PERMISSIONS = {
  Administrator: ['*'],
  Manager: [
    'dashboard:read', 'analytics:read', 'reservations:read', 'reservations:write',
    'orders:read', 'orders:write', 'tables:read', 'tables:write',
    'menu:read', 'menu:write', 'categories:read', 'categories:write',
    'customers:read', 'customers:write', 'employees:read', 'employees:write', 'reviews:read', 'reviews:write', 'zones:read', 'zones:write',
  ],
  Employee: ['reservations:read', 'orders:read', 'tables:read', 'menu:read', 'categories:read', 'customers:read'],
};

function hasPermission(user, permission) {
  const role = canonicalizeRoleName(user?.role?.name);
  const permissions = PERMISSIONS[role] || [];
  return permissions.includes('*') || permissions.includes(permission);
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Utilisateur non authentifié.' });
    if (!hasPermission(req.user, permission)) return res.status(403).json({ message: 'Accès refusé.' });
    return next();
  };
}

function requireAdmin(req, res, next) { return requirePermission('*')(req, res, next); }
function requireManager(req, res, next) { return requirePermission('dashboard:read')(req, res, next); }
function denyRoleMutation(req, res, next) {
  const role = canonicalizeRoleName(req.user?.role?.name);
  if (role !== 'Administrator' && (req.body?.role_id !== undefined || req.body?.role_name !== undefined)) return res.status(403).json({ message: 'La gestion des rôles est réservée à l’Admin.' });
  return next();
}

module.exports = { PERMISSIONS, hasPermission, requirePermission, requireAdmin, requireManager, denyRoleMutation };
