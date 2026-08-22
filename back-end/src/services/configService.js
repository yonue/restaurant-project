const { RestaurantSettings } = require('../models');

const parse = value => { try { return value ? JSON.parse(value) : {}; } catch (_) { return {}; } };

async function getSettings() {
  const row = await RestaurantSettings.findOne();
  if (!row) return {};
  const data = row.toJSON();
  return { ...parse(data.restaurant_settings), ...parse(data.website_content), ...parse(data.website_settings), ...parse(data.schedule_settings), notifications: parse(data.notification_settings), appearance: parse(data.appearance_settings), restaurant_name: data.restaurant_name, email: data.email, phone: data.phone, address: data.address, logo: data.logo, banner: data.banner, opening_hours: data.opening_hours };
}

async function isNotificationEnabled(name) {
  const settings = await getSettings();
  const notifications = settings.notifications || {};
  const value = notifications[name];
  return value === undefined || value === true || value === 'Activé' || value === 'enabled' || value === 'true';
}

module.exports = { getSettings, isNotificationEnabled };
