const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const sequelize = require('./config/database');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const menuRoutes = require('./routes/menuRoutes');
const reservationRoutes = require('./routes/reservationRoutes');
const tableRoutes = require('./routes/tableRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const favoriteRoutes = require('./routes/favoriteRoutes');
const employeeRoutes = require('./routes/employeeRoutes');
const employeeShiftRoutes = require('./routes/employeeShiftRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const exportRoutes = require('./routes/exportRoutes');
const orderRoutes = require('./routes/orderRoutes');
const galleryRoutes = require('./routes/galleryRoutes');
const publicConfigRoutes = require('./routes/publicConfigRoutes');
const siteMediaRoutes = require('./routes/siteMediaRoutes');
const businessHoursRoutes = require('./routes/businessHoursRoutes');
const zoneRoutes = require('./routes/zoneRoutes');
const { initSocket, initSse, emitGlobal } = require('./services/socketService');
const { startReservationReminderScheduler } = require('./services/reservationReminderService');
const app = express();
const server = http.createServer(app);

const models = require('./models/index')

const PORT = 4000;

async function startServer() {
  try {
    app.use(express.json({ limit: '15mb' }));
    app.use(express.urlencoded({ extended: true, limit: '15mb' }));
    app.use(cors({
      origin: process.env.FRONTEND_ORIGIN || '*',
    }));
    app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));
    app.get('/api/realtime', initSse);
    app.use('/api', (req, res, next) => {
      if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
      res.on('finish', () => {
        if (res.statusCode >= 200 && res.statusCode < 400) {
          const pathName = req.path.toLowerCase();
          const resource = pathName.includes('/menu/categories') ? 'categories'
            : pathName.includes('/menu/products') ? 'menu'
              : pathName.split('/').filter(Boolean)[0] || 'all';
          emitGlobal('data:changed', { resource, method: req.method });
        }
      });
      next();
    });

    await sequelize.authenticate();
    console.log(' Connexion à MySQL réussie');


    await sequelize.sync();
    await ensurePersistenceSchema();
    await ensureZoneRelations();
    await ensureZoneConstraints();
    await ensureBusinessHoursDefaults();
    await ensureSiteMediaDefaults();
    console.log(' Modèles synchronisés');

    app.get('/api/settings', async (req, res) => {
      try {
        const { RestaurantSettings } = require('./models');
        let settings = await RestaurantSettings.findOne();
        return res.status(200).json({ settings });
      } catch (error) {
        return res.status(500).json({ error: error.message });
      }
    });

    app.use('/api/auth', authRoutes);
    app.use('/api/users', userRoutes);
    app.use('/api/menu', menuRoutes);
    app.use('/api/reservations', reservationRoutes);
    app.use('/api/tables', tableRoutes);
    app.use('/api/reviews', reviewRoutes);
    app.use('/api/favorites', favoriteRoutes);
    app.use('/api/employees', employeeRoutes);
    app.use('/api/employee-shifts', employeeShiftRoutes);
    app.use('/api/settings', settingsRoutes);
    app.use('/api/dashboard', dashboardRoutes);
    app.use('/api/exports', exportRoutes);
    app.use('/api/orders', orderRoutes);
    app.use('/api/gallery', galleryRoutes);
    app.use('/api/public/config', publicConfigRoutes);
    app.use('/api/site-media', siteMediaRoutes);
    app.use('/api/business-hours', businessHoursRoutes);
    app.use('/api/zones', zoneRoutes);
    initSocket(server);
    startReservationReminderScheduler();

    server.listen(PORT, () => {
      console.log(` API disponible sur: http://localhost:${PORT}`);
    });

  } catch (error) {
    console.error(' Erreur de démarrage:', error.message);
    process.exit(1);
  }
}

async function ensurePersistenceSchema() {
  const queryInterface = sequelize.getQueryInterface();
  const additions = [
    ['Users', 'notes', { type: require('sequelize').TEXT, allowNull: true }],
    ['Users', 'is_vip', { type: require('sequelize').BOOLEAN, allowNull: false, defaultValue: false }],
    ['Users', 'loyalty_points', { type: require('sequelize').INTEGER, allowNull: false, defaultValue: 0 }],
    ['Avis', 'admin_reply', { type: require('sequelize').TEXT, allowNull: true }],
    ['Avis', 'replied_at', { type: require('sequelize').DATE, allowNull: true }],
    ['Avis', 'is_archived', { type: require('sequelize').BOOLEAN, allowNull: false, defaultValue: false }],
    ['Categories', 'is_active', { type: require('sequelize').BOOLEAN, allowNull: false, defaultValue: true }],
    ['Categories', 'sort_order', { type: require('sequelize').INTEGER, allowNull: false, defaultValue: 0 }],
    ['RestaurantSettings', 'restaurant_settings', { type: require('sequelize').TEXT('long'), allowNull: true }],
    ['RestaurantSettings', 'schedule_settings', { type: require('sequelize').TEXT('long'), allowNull: true }],
    ['RestaurantSettings', 'website_settings', { type: require('sequelize').TEXT('long'), allowNull: true }],
    ['RestaurantSettings', 'notification_settings', { type: require('sequelize').TEXT('long'), allowNull: true }],
    ['RestaurantSettings', 'appearance_settings', { type: require('sequelize').TEXT('long'), allowNull: true }],
    ['RestaurantSettings', 'security_settings', { type: require('sequelize').TEXT('long'), allowNull: true }],
    ['RestaurantTables', 'position_x', { type: require('sequelize').FLOAT, allowNull: false, defaultValue: 16 }],
    ['RestaurantTables', 'position_y', { type: require('sequelize').FLOAT, allowNull: false, defaultValue: 22 }],
    ['RestaurantTables', 'width', { type: require('sequelize').FLOAT, allowNull: false, defaultValue: 104 }],
    ['RestaurantTables', 'height', { type: require('sequelize').FLOAT, allowNull: false, defaultValue: 76 }],
    ['RestaurantTables', 'rotation', { type: require('sequelize').FLOAT, allowNull: false, defaultValue: 0 }],
    ['RestaurantTables', 'is_active', { type: require('sequelize').BOOLEAN, allowNull: false, defaultValue: true }],
    ['restaurant_zones', 'image_path', { type: require('sequelize').STRING(500), allowNull: true }],
    ['RestaurantTables', 'shape', { type: require('sequelize').STRING(30), allowNull: false, defaultValue: 'Round' }],
    ['RestaurantTables', 'zone', { type: require('sequelize').STRING(80), allowNull: false, defaultValue: 'Main Room' }],
    ['RestaurantTables', 'color', { type: require('sequelize').STRING(20), allowNull: false, defaultValue: '#b98b3b' }],
    ['RestaurantTables', 'notes', { type: require('sequelize').TEXT, allowNull: true }],
    ['RestaurantTables', 'zone_id', { type: require('sequelize').INTEGER.UNSIGNED, allowNull: true }],
    ['Reservations', 'zone_id', { type: require('sequelize').INTEGER.UNSIGNED, allowNull: true }],
  ];
  for (const [table, column, definition] of additions) {
    try { await queryInterface.addColumn(table, column, definition); } catch (error) {
      if (!/duplicate|exists|already/i.test(error.message)) throw error;
    }
  }
}

async function ensureZoneRelations() {
  const { RestaurantZone, RestaurantTable } = require('./models');
  const tables = await RestaurantTable.findAll({ where: { zone_id: null } });
  for (const table of tables) {
    const name = table.zone || 'Main Room';
    const [zone] = await RestaurantZone.findOrCreate({ where: { name }, defaults: { name, sort_order: 0, is_active: true } });
    await table.update({ zone_id: zone.id });
  }
}

async function ensureZoneConstraints() {
  const queryInterface = sequelize.getQueryInterface();
  try {
    await queryInterface.changeColumn('RestaurantTables', 'zone_id', { type: require('sequelize').INTEGER.UNSIGNED, allowNull: false });
  } catch (error) {
    if (!/duplicate|exists|already/i.test(error.message)) throw error;
  }
  const constraints = [
    ['RestaurantTables', 'zone_id', 'fk_restaurant_tables_zone'],
    ['Reservations', 'zone_id', 'fk_reservations_zone'],
  ];
  for (const [table, field, name] of constraints) {
    try {
      await queryInterface.addConstraint(table, {
        fields: [field],
        type: 'foreign key',
        name,
        references: { table: 'restaurant_zones', field: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      });
    } catch (error) {
      if (!/duplicate|exists|already|constraint/i.test(error.message)) throw error;
    }
  }
}

async function ensureSiteMediaDefaults() {
  const { RestaurantSettings, SiteMedia } = require('./models');
  if (await SiteMedia.count()) return;
  const settings = await RestaurantSettings.findOne();
  if (!settings) return;
  let content = {};
  try { content = settings.website_content ? JSON.parse(settings.website_content) : {}; } catch (_) { content = {}; }
  const entries = [
    ['branding', 'logo', settings.logo || content.logo], ['branding', 'banner', settings.banner || content.banner],
    ['home', 'hero', content.heroBgImage], ['home', 'about', content.aboutImage], ['home', 'chef', content.chefImage],
    ['home', 'story', content.storyImage], ['home', 'featured', content.featuredImage], ['home', 'contact', content.contactImage],
    ['about', 'cover', content.storyImage || content.aboutImage], ['contact', 'cover', content.contactImage],
  ];
  const rows = entries.filter(([, , path]) => path).map(([section, placement, file_path], index) => ({ name: placement, section, placement, file_path, title: placement, alt: placement, sort_order: index, is_active: true }));
  if (rows.length) await SiteMedia.bulkCreate(rows);
}

async function ensureBusinessHoursDefaults() {
  const { BusinessHour, BusinessHourPeriod, RestaurantSettings } = require('./models');
  if (await BusinessHour.count()) return;
  const settings = await RestaurantSettings.findOne();
  let schedule = {};
  try { schedule = settings?.schedule_settings ? JSON.parse(settings.schedule_settings) : {}; } catch (_) { schedule = {}; }
  const dayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const timePattern = /(\d{1,2})\s*[h:]\s*(\d{2})/gi;
  for (let day = 0; day < 7; day += 1) {
    const key = dayKeys[day];
    const rawSlots = Array.isArray(schedule.slots?.[key]) ? schedule.slots[key] : [];
    const text = String(schedule[key] || '');
    const matches = [...text.matchAll(timePattern)].map(match => `${String(match[1]).padStart(2, '0')}:${match[2]}`);
    const slots = rawSlots.length ? rawSlots : Array.from({ length: Math.floor(matches.length / 2) }, (_, index) => ({ start: matches[index * 2], end: matches[index * 2 + 1] }));
    const row = await BusinessHour.create({ day_of_week: day, is_closed: !slots.length || /ferm/i.test(text) && !matches.length, sort_order: day });
    if (!row.is_closed) await BusinessHourPeriod.bulkCreate(slots.filter(slot => slot.start && slot.end).map((slot, index) => ({ business_hour_id: row.id, start_time: slot.start, end_time: slot.end, sort_order: index })));
  }
}



module.exports = {
  startServer
};
