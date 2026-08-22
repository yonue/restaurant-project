const { ActivityLog } = require('../models');

async function logActivity({ userId, action, entity, entityId }) {
  if (!userId || !action || !entity || entityId === undefined || entityId === null) {
    return null;
  }

  try {
    return await ActivityLog.create({
      user_id: userId,
      action: String(action),
      entity: String(entity),
      entity_id: String(entityId),
    });
  } catch (error) {
    console.error('Erreur journal activité:', error.message);
    return null;
  }
}

module.exports = {
  logActivity,
};
