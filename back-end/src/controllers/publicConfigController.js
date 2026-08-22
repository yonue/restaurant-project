const { RestaurantSettings, SiteMedia } = require('../models');
const { toPublicPath } = require('../services/imageService');
const { getPublicSchedule } = require('../services/businessHoursService');

const parse = value => { try { return value ? JSON.parse(value) : {}; } catch (_) { return {}; } };

exports.get = async (_req, res) => {
  try {
    const settings = await RestaurantSettings.findOne();
    if (!settings) return res.json({ settings: { slots: {}, exceptions: [] }, schedule: { days: {}, exceptions: [] }, media: {} });
    const row = settings.toJSON();
    const restaurant = parse(row.restaurant_settings);
    const schedule = parse(row.schedule_settings);
    const scheduleSlots = schedule.slots && typeof schedule.slots === 'object' ? schedule.slots : {};
    for (const day of ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']) {
      if (Array.isArray(scheduleSlots[day])) {
        schedule[day] = scheduleSlots[day].filter(slot => slot && slot.start && slot.end).map(slot => `${slot.start} - ${slot.end}`).join(' / ') || 'Fermé';
      }
    }
    const website = { ...parse(row.website_content), ...parse(row.website_settings) };
    const notifications = parse(row.notification_settings);
    const appearance = parse(row.appearance_settings);
    const mediaRows = await SiteMedia.findAll({ where: { is_active: true }, order: [['sort_order', 'ASC']] });
    const businessSchedule = await getPublicSchedule();
    const media = {};
    for (const item of mediaRows) { const value = item.toJSON(); media[value.placement] = toPublicPath(value.file_path) || value.file_path; }
    const scheduleDays = Object.fromEntries(Object.entries(businessSchedule.days).map(([day, value]) => [day, value.slots.map(slot => `${slot.start} - ${slot.end}`).join(' / ') || 'Fermé']));
    res.json({ media, schedule: businessSchedule, settings: {
      ...restaurant,
      ...website,
      ...schedule,
      ...scheduleDays,
      slots: Object.fromEntries(Object.entries(businessSchedule.days).map(([day, value]) => [day, value.slots])),
      exceptions: businessSchedule.exceptions,
      notifications,
      appearance,
      name: restaurant.name || website.displayName || row.restaurant_name || '',
      email: restaurant.email || row.email || '',
      phone: restaurant.phone || row.phone || '',
      address: restaurant.address || row.address || '',
      description: restaurant.description || row.description || '',
      logo: website.logo || restaurant.logo || row.logo || '',
      banner: website.banner || row.banner || '',
      openingHours: schedule.hours || row.opening_hours || '',
    } });
  } catch (error) { res.status(500).json({ message: error.message }); }
};
