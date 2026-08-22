const { Notification } = require('../models');
const { markNotificationAsRead } = require('../services/notificationService');

function normalizeNotification(notificationInstance) {
  if (!notificationInstance) {
    return null;
  }

  return notificationInstance.toJSON ? notificationInstance.toJSON() : { ...notificationInstance };
}

exports.getMyNotifications = async (req, res) => {
  try {
    const notifications = await Notification.findAll({
      where: { user_id: req.user.id },
      order: [['createdAt', 'DESC']],
    });

    return res.status(200).json({
      notifications: notifications.map(normalizeNotification),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const notification = await markNotificationAsRead(id, req.user.id);

    if (!notification) {
      return res.status(404).json({ message: 'Notification introuvable.' });
    }

    return res.status(200).json({
      message: 'Notification marquée comme lue.',
      notification: normalizeNotification(notification),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.markAllAsRead = async (req, res) => {
  try {
    await Notification.update(
      { is_read: true },
      {
        where: { user_id: req.user.id, is_read: false },
      }
    );

    return res.status(200).json({ message: 'Toutes les notifications sont marquées comme lues.' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;
    const notification = await Notification.findOne({
      where: { id, user_id: req.user.id },
    });

    if (!notification) {
      return res.status(404).json({ message: 'Notification introuvable.' });
    }

    await notification.destroy();
    return res.status(200).json({ message: 'Notification supprimée.' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
