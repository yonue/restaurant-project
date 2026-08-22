const bcrypt = require('bcrypt');
const { User, Role, Reservation, RestaurantTable, Favorite, Notification, Avis, ActivityLog, Otp, Order } = require('../models');
const { ensureRoleName, hasAnyRole } = require('../utils/roles');


function safeUser(userInstance) {
  if (!userInstance) {
    return null;
  }

  const user = userInstance.toJSON ? userInstance.toJSON() : { ...userInstance };
  delete user.password;
  return user;
}

function resolveAvatarPath(req) {
  if (req.file && req.file.path) {
    return req.file.path;
  }

  return req.body.avatar || null;
}

function isAdminOrManager(user) {
  return hasAnyRole(user, ['Administrator', 'Manager']);
}


async function loadUserById(id) {
  return User.findByPk(id, {
    include: [{ model: Role, as: 'role' }],
  });
}


exports.createUser = async (req, res) => {
  try {
    const {
      first_name,
      last_name,
      email,
      password,
      phone,
      role_id,
      avatar,
      is_verified,
      notes,
      is_vip,
      loyalty_points,
    } = req.body;

    if (!first_name || !last_name || !email || !password) {
      return res.status(400).json({
        message: 'first_name, last_name, email et password sont obligatoires.',
      });
    }

    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ message: 'Cet email existe déjà.' });
    }

    let finalRoleId = role_id || null;
    if (finalRoleId) {
      const roleExists = await Role.findByPk(finalRoleId);
      if (!roleExists) {
        return res.status(400).json({ message: 'Rôle introuvable.' });
      }
    } else {
      const customerRole = await ensureRoleName('Customer', 'Client du restaurant');
      finalRoleId = customerRole ? customerRole.id : null;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      first_name,
      last_name,
      email,
      password: hashedPassword,
      phone: phone || null,
      role_id: finalRoleId,
      avatar: avatar || null,
      is_verified: Boolean(is_verified),
      notes: notes || null,
      is_vip: Boolean(is_vip),
      loyalty_points: Number.isFinite(Number(loyalty_points)) ? Number(loyalty_points) : 0,
    });

    return res.status(201).json({
      message: 'Utilisateur créé avec succès.',
      user: safeUser(user),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};


exports.getAllUsers = async (req, res) => {
  try {
    if (!isAdminOrManager(req.user)) {
      return res.status(403).json({ message: 'Accès refusé.' });
    }

    const users = await User.findAll({
      include: [{ model: Role, as: 'role' }],
      order: [['createdAt', 'DESC']],
    });

    return res.status(200).json({
      users: users.map(safeUser),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};


exports.getUserById = async (req, res) => {
  try {
    if (!isAdminOrManager(req.user)) {
      return res.status(403).json({ message: 'Accès refusé.' });
    }

    const { id } = req.params;
    const user = await loadUserById(id);

    if (!user) {
      return res.status(404).json({ message: 'Utilisateur introuvable.' });
    }

    return res.status(200).json({ user: safeUser(user) });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.updateUser = async (req, res) => {
  try {
    if (!isAdminOrManager(req.user)) {
      return res.status(403).json({ message: 'Accès refusé.' });
    }

    const { id } = req.params;
    const user = await User.findByPk(id);

    if (!user) {
      return res.status(404).json({ message: 'Utilisateur introuvable.' });
    }

    const { first_name, last_name, email, phone, role_id, is_verified, notes, is_vip, loyalty_points } = req.body;

    if (email && email !== user.email) {
      const existingUser = await User.findOne({ where: { email } });
      if (existingUser) {
        return res.status(400).json({ message: 'Cet email existe déjà.' });
      }
    }

    if (role_id) {
      const roleExists = await Role.findByPk(role_id);
      if (!roleExists) {
        return res.status(400).json({ message: 'Rôle introuvable.' });
      }
    }

    if (loyalty_points !== undefined && (!Number.isInteger(Number(loyalty_points)) || Number(loyalty_points) < 0)) {
      return res.status(400).json({ message: 'Les points fidélité sont invalides.' });
    }

    await user.update({
      first_name: first_name ?? user.first_name,
      last_name: last_name ?? user.last_name,
      email: email ?? user.email,
      phone: phone ?? user.phone,
      role_id: role_id ?? user.role_id,
      is_verified: typeof is_verified === 'boolean' ? is_verified : user.is_verified,
      notes: notes ?? user.notes,
      is_vip: typeof is_vip === 'boolean' ? is_vip : user.is_vip,
      loyalty_points: loyalty_points === undefined ? user.loyalty_points : Number(loyalty_points),
    });

    return res.status(200).json({
      message: 'Utilisateur mis à jour.',
      user: safeUser(user),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    if (!isAdminOrManager(req.user)) {
      return res.status(403).json({ message: 'Accès refusé.' });
    }

    const { id } = req.params;
    const user = await User.findByPk(id);

    if (!user) {
      return res.status(404).json({ message: 'Utilisateur introuvable.' });
    }

    const transaction = await User.sequelize.transaction();
    try {
      await Promise.all([
        Reservation.destroy({ where: { user_id: user.id }, transaction }),
        Favorite.destroy({ where: { user_id: user.id }, transaction }),
        Notification.destroy({ where: { user_id: user.id }, transaction }),
        Avis.destroy({ where: { user_id: user.id }, transaction }),
        ActivityLog.destroy({ where: { user_id: user.id }, transaction }),
        Otp.destroy({ where: { user_id: user.id }, transaction }),
        Order.destroy({ where: { user_id: user.id }, transaction }),
      ]);
      await user.destroy({ transaction });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }

    return res.status(200).json({ message: 'Utilisateur supprimé.' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.getProfile = async (req, res) => {
  try {
    const user = await loadUserById(req.user.id);
    return res.status(200).json({ user: safeUser(user) });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id);

    if (!user) {
      return res.status(404).json({ message: 'Utilisateur introuvable.' });
    }

    const { first_name, last_name, email, phone } = req.body;

    if (email && email !== user.email) {
      const existingUser = await User.findOne({ where: { email } });
      if (existingUser) {
        return res.status(400).json({ message: 'Cet email existe déjà.' });
      }
    }

    await user.update({
      first_name: first_name ?? user.first_name,
      last_name: last_name ?? user.last_name,
      email: email ?? user.email,
      phone: phone ?? user.phone,
    });

    return res.status(200).json({
      message: 'Profil mis à jour.',
      user: safeUser(user),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id);

    if (!user) {
      return res.status(404).json({ message: 'Utilisateur introuvable.' });
    }

    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({
        message: 'currentPassword, newPassword et confirmPassword sont obligatoires.',
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: 'Les nouveaux mots de passe ne correspondent pas.' });
    }

    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      return res.status(401).json({ message: 'Mot de passe actuel incorrect.' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();

    return res.status(200).json({ message: 'Mot de passe modifié avec succès.' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.uploadAvatar = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id);

    if (!user) {
      return res.status(404).json({ message: 'Utilisateur introuvable.' });
    }

    const avatar = resolveAvatarPath(req);
    if (!avatar) {
      return res.status(400).json({
        message: 'Aucun avatar fourni. Utilise req.file ou le champ avatar.',
      });
    }

    user.avatar = avatar;
    await user.save();

    return res.status(200).json({
      message: 'Avatar mis à jour.',
      user: safeUser(user),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.getReservationHistory = async (req, res) => {
  try {
    const reservations = await Reservation.findAll({
      where: { user_id: req.user.id },
      include: [{ model: RestaurantTable, as: 'table' }],
      order: [['reservation_date', 'DESC']],
    });

    return res.status(200).json({
      reservations,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
