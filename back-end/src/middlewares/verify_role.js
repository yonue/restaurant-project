const { hasAnyRole, canonicalizeRoleName } = require('../utils/roles');

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Utilisateur non authentifié.' });
    }

    if (!hasAnyRole(req.user, allowedRoles)) {
      return res.status(403).json({
        message: `Accès réservé à: ${allowedRoles.map(canonicalizeRoleName).filter(Boolean).join(', ')}.`,
      });
    }

    return next();
  };
}

module.exports = {
  requireRole,
};

