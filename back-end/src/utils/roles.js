const { Role } = require('../models');

const ROLE_ALIASES = {
  ADMIN: 'Administrator',
  ADMINISTRATOR: 'Administrator',
  MANAGER: 'Manager',
  EMPLOYEE: 'Employee',
  CUSTOMER: 'Customer',
};

const CANONICAL_ROLES = ['Customer', 'Employee', 'Manager', 'Administrator'];

function canonicalizeRoleName(name) {
  const raw = String(name || '').trim();
  if (!raw) {
    return null;
  }

  const upper = raw.toUpperCase();
  if (ROLE_ALIASES[upper]) {
    return ROLE_ALIASES[upper];
  }

  const titleCase = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
  return CANONICAL_ROLES.includes(titleCase) ? titleCase : titleCase;
}

function hasRoleName(user, roleName) {
  return canonicalizeRoleName(user?.role?.name) === canonicalizeRoleName(roleName);
}

function hasAnyRole(user, roleNames = []) {
  const currentRole = canonicalizeRoleName(user?.role?.name);
  return roleNames.some((roleName) => canonicalizeRoleName(roleName) === currentRole);
}

async function findRoleByName(roleName) {
  const canonicalName = canonicalizeRoleName(roleName);
  if (!canonicalName) {
    return null;
  }

  const roles = await Role.findAll();
  return roles.find((role) => canonicalizeRoleName(role.name) === canonicalName) || null;
}

async function ensureRoleName(roleName, description = null) {
  const canonicalName = canonicalizeRoleName(roleName);
  if (!canonicalName) {
    return null;
  }

  const [role] = await Role.findOrCreate({
    where: { name: canonicalName },
    defaults: {
      description,
    },
  });

  if (role.name !== canonicalName) {
    role.name = canonicalName;
  }

  if (description && role.description !== description) {
    role.description = description;
  }

  await role.save();
  return role;
}

module.exports = {
  CANONICAL_ROLES,
  canonicalizeRoleName,
  ensureRoleName,
  findRoleByName,
  hasAnyRole,
  hasRoleName,
};

