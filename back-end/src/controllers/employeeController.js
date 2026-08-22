const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { Employee, User, Role } = require('../models');
const { sendEmployeeInitialPasswordEmail } = require('../services/nodemailerService');
const { ensureRoleName, findRoleByName, hasAnyRole } = require('../utils/roles');

function normalizeEmployee(employeeInstance) {
  if (!employeeInstance) {
    return null;
  }

  return employeeInstance.toJSON ? employeeInstance.toJSON() : { ...employeeInstance };
}

function isAdminOrManager(user) {
  return hasAnyRole(user, ['Administrator', 'Manager']);
}

async function loadEmployeeById(id) {
  return Employee.findByPk(id, {
    include: [
      { model: User, as: 'user', include: [{ model: Role, as: 'role' }] },
    ],
  });
}

function normalizePosition(position) {
  const p = String(position || '').trim();
  const lower = p.toLowerCase();
  if (lower === 'server' || lower === 'serveur') return 'Serveur';
  if (lower === 'cook' || lower === 'cuisinier' || lower === 'cuisine') return 'Cuisinier';
  if (lower === 'manager') return 'Manager';
  if (lower === 'admin' || lower === 'administrator') return 'Administrator';
  if (p.length > 0) {
    return p.charAt(0).toUpperCase() + p.slice(1);
  }
  return p;
}

function generateInitialPassword() {
  return crypto.randomBytes(9).toString('base64url');
}

exports.createEmployee = async (req, res) => {
  try {
    if (!isAdminOrManager(req.user)) {
      return res.status(403).json({ message: 'Accès refusé.' });
    }

    const {
      first_name,
      last_name,
      email,
      password,
      phone,
      position,
      salary,
      hire_date,
    } = req.body;

    if (!first_name || !last_name || !email || !position || salary === undefined || !hire_date) {
      return res.status(400).json({
        message: 'first_name, last_name, email, position, salary et hire_date sont obligatoires.',
      });
    }

    const normalizedPosition = normalizePosition(position);

    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ message: 'Cet email existe déjà.' });
    }

    const initialPassword = password && String(password).trim() ? String(password).trim() : generateInitialPassword();
    const hashedPassword = await bcrypt.hash(initialPassword, 10);
    
    // Map position to fixed roles
    let roleName = 'Employee';
    if (normalizedPosition === 'Manager') {
      roleName = 'Manager';
    } else if (normalizedPosition === 'Administrator') {
      roleName = 'Administrator';
    }

    const role = await ensureRoleName(roleName, 'Rôle ' + roleName.toLowerCase());

    const user = await User.create({
      first_name,
      last_name,
      email,
      password: hashedPassword,
      phone: phone || null,
      role_id: role ? role.id : null,
      is_verified: true,
    });

    const employee = await Employee.create({
      user_id: user.id,
      position: normalizedPosition,
      salary,
      hire_date,
    });

    let emailSent = false;
    let emailDeliveryStatus = null;
    if (normalizedPosition === 'Manager') {
      try {
        const mailResult = await sendEmployeeInitialPasswordEmail({
          to: user.email,
          name: user.first_name + ' ' + user.last_name,
          position: normalizedPosition,
          email: user.email,
          password: initialPassword,
        });
        emailSent = !mailResult?.mocked;
        emailDeliveryStatus = mailResult?.mocked ? mailResult.reason || 'Email transport not configured' : 'sent';
      } catch (mailError) {
        console.error('Erreur envoi email mot de passe manager:', mailError.message);
        emailDeliveryStatus = mailError.message;
      }
    }

    return res.status(201).json({
      message: 'Employé créé avec succès.',
      employee: normalizeEmployee(employee),
      emailSent,
      emailDeliveryStatus,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.getAllEmployees = async (req, res) => {
  try {
    if (!isAdminOrManager(req.user)) {
      return res.status(403).json({ message: 'Accès refusé.' });
    }

    const employees = await Employee.findAll({
      include: [{ model: User, as: 'user', include: [{ model: Role, as: 'role' }] }],
      order: [['createdAt', 'DESC']],
    });

    return res.status(200).json({
      employees: employees.map(normalizeEmployee),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.getEmployeeById = async (req, res) => {
  try {
    if (!isAdminOrManager(req.user)) {
      return res.status(403).json({ message: 'Accès refusé.' });
    }

    const { id } = req.params;
    const employee = await loadEmployeeById(id);

    if (!employee) {
      return res.status(404).json({ message: 'Employé introuvable.' });
    }

    return res.status(200).json({ employee: normalizeEmployee(employee) });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.updateEmployee = async (req, res) => {
  try {
    if (!isAdminOrManager(req.user)) {
      return res.status(403).json({ message: 'Accès refusé.' });
    }

    const { id } = req.params;
    const employee = await Employee.findByPk(id);

    if (!employee) {
      return res.status(404).json({ message: 'Employé introuvable.' });
    }

    const user = await User.findByPk(employee.user_id);
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur lié introuvable.' });
    }

    const {
      first_name,
      last_name,
      email,
      phone,
      position,
      salary,
      hire_date,
      role_name,
      is_active,
    } = req.body;

    if (email && email !== user.email) {
      const existingUser = await User.findOne({ where: { email } });
      if (existingUser) {
        return res.status(400).json({ message: 'Cet email existe déjà.' });
      }
    }

    if (position) {
      const normalizedPosition = normalizePosition(position);
      employee.position = normalizedPosition;
      
      // Update role automatically based on new position
      let roleName = 'Employee';
      if (normalizedPosition === 'Manager') {
        roleName = 'Manager';
      } else if (normalizedPosition === 'Administrator') {
        roleName = 'Administrator';
      }
      
      const role = await findRoleByName(roleName);
      if (role) {
        user.role_id = role.id;
      }
    }

    if (role_name) {
      const role = await findRoleByName(role_name);
      if (role) {
        user.role_id = role.id;
      }
    }

    user.first_name = first_name ?? user.first_name;
    user.last_name = last_name ?? user.last_name;
    user.email = email ?? user.email;
    user.phone = phone ?? user.phone;
    if (typeof is_active === 'boolean') user.is_verified = is_active;

    employee.salary = salary ?? employee.salary;
    employee.hire_date = hire_date ?? employee.hire_date;

    await user.save();
    await employee.save();

    return res.status(200).json({
      message: 'Employé mis à jour.',
      employee: normalizeEmployee(await loadEmployeeById(employee.id)),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.deleteEmployee = async (req, res) => {
  try {
    if (!isAdminOrManager(req.user)) {
      return res.status(403).json({ message: 'Accès refusé.' });
    }

    const { id } = req.params;
    const employee = await Employee.findByPk(id);

    if (!employee) {
      return res.status(404).json({ message: 'Employé introuvable.' });
    }

    const user = await User.findByPk(employee.user_id);
    await employee.destroy();
    if (user) {
      await user.destroy();
    }

    return res.status(200).json({ message: 'Employé supprimé.' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
