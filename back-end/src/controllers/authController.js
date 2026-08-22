const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { sequelize, User, Otp, Role } = require('../models');
const { sendOtpEmail } = require('../services/nodemailerService');
const { ensureRoleName } = require('../utils/roles');

const OTP_TTL_MINUTES = Number(process.env.OTP_TTL_MINUTES || 10);
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';

function safeUser(userInstance) {
  if (!userInstance) {
    return null;
  }

  const user = userInstance.toJSON ? userInstance.toJSON() : { ...userInstance };
  delete user.password;
  return user;
}


function generateOtpCode() {
  return Math.floor(100000 + Math.random() * 900000);
}


async function createAndSendOtp(user, options = {}) {
  const { transaction = null, sendEmail = true } = options;
  const code = generateOtpCode();
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

  const queryOptions = transaction ? { transaction } : {};

  await Otp.destroy({ where: { user_id: user.id }, ...queryOptions });
  await Otp.create({
    user_id: user.id,
    code,
    expiresAt,
  }, queryOptions);

  if (sendEmail) {
    await sendOtpEmail({
      to: user.email,
      name: `${user.first_name} ${user.last_name}`.trim(),
      code,
      expiresAt,
    });
  }

  return { code, expiresAt };
}


function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role_id: user.role_id || null,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

exports.register = async (req, res) => {
  try {
    const {
      first_name,
      last_name,
      email,
      password,
      confirmPassword,
      phone,
      avatar,
    } = req.body;

    if (confirmPassword && password !== confirmPassword) {
      return res.status(400).json({ message: 'Les mots de passe ne correspondent pas.' });
    }

    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ message: 'Cet email existe déjà.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const { createdUser, otpPayload } = await sequelize.transaction(async (transaction) => {
      const customerRole = await ensureRoleName('Customer', 'Client du restaurant');

      const user = await User.create(
        {
          first_name,
          last_name,
          email,
          password: hashedPassword,
          phone: phone || null,
          role_id: customerRole ? customerRole.id : null,
          avatar: avatar || null,
          is_verified: false,
        },
        { transaction }
      );

      const otpPayload = await createAndSendOtp(user, {
        transaction,
        sendEmail: false,
      });

      return { createdUser: user, otpPayload };
    });

    await sendOtpEmail({
      to: createdUser.email,
      name: `${createdUser.first_name} ${createdUser.last_name}`.trim(),
      code: otpPayload.code,
      expiresAt: otpPayload.expiresAt,
    });

    return res.status(201).json({
      message: 'Compte créé. Un code OTP a été envoyé par email.',
      user: safeUser(createdUser),
      requiresOtp: true,
      otpCode: otpPayload.code
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};


exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'email et password sont obligatoires.' });
    }

    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: 'email ou mot de passe incorrect.' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'email ou mot de passe incorrect.' });
    }

    const otpInfo = await createAndSendOtp(user);

    return res.status(200).json({
      message: 'Code OTP envoyé par email.',
      requiresOtp: true,
      userId: user.id,
      email: user.email,
      otpCode: otpInfo.code
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};


exports.verifyOtp = async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!code || ( !email)) {
      return res.status(400).json({
        message: 'code ou email sont obligatoires.',
      });
    }

    const user = await User.findOne({
      where: { email },
      include: [{ model: Role, as: 'role' }]
    });

    if (!user) {
      return res.status(404).json({ error: 'Utilisateur introuvable.' });
    }

    const otp = await Otp.findOne({
      where: {
        user_id: user.id,
        code: Number(code),
      },
      order: [['createdAt', 'DESC']],
    });

    if (!otp) {
      return res.status(401).json({ error: 'Code OTP invalide.' });
    }

    if (new Date(otp.expiresAt).getTime() < Date.now()) {
      await Otp.destroy({ where: { user_id: user.id } });
      return res.status(401).json({ error: 'Code OTP expiré.' });
    }

    await Otp.destroy({ where: { user_id: user.id } });
    user.is_verified = true;
    await user.save();

    const token = signToken(user);

    return res.status(200).json({
      message: 'Connexion validée.',
      token,
      user: safeUser(user),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.resendOtp = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ where: { email } });

    if (!user) {
      return res.status(404).json({ error: 'Utilisateur introuvable.' });
    }

    const otpInfo = await createAndSendOtp(user);

    return res.status(200).json({
      message: 'Un nouveau code OTP a été envoyé.',
      userId: user.id,
      email: user.email,
      otpCode: otpInfo.code
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};


exports.me = async (req, res) => {
  return res.status(200).json({ user: safeUser(req.user) });
};


exports.logout = async (req, res) => {
  return res.status(200).json({
    message: 'Déconnexion réussie.',
  });
};
