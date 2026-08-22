const jwt = require('jsonwebtoken');
const { User, Role } = require('../models');

const JWT_SECRET = process.env.JWT_SECRET;

function extractToken(req) {
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  return req.headers['x-auth-token'] || null;
}

module.exports = async function authenticate(req, res, next) {
  try {
    const token = extractToken(req);
    if (!token) {
      return res.status(401).json({ error: 'Token manquant.' });
    }

    const payload = jwt.verify(token, JWT_SECRET);
    const user = await User.findByPk(payload.id, {
      include: [{ model: Role, as: 'role' }],
    });

    if (!user) {
      return res.status(401).json({ error: 'Utilisateur introuvable.' });
    }
    req.userId = user.id;
    req.user = user;
    req.auth = payload;
    
    return next();
  } catch (error) {
    return res.status(401).json({ error: 'Token invalide ou expiré.' });
  }
};
