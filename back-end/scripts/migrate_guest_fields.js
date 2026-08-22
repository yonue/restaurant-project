/**
 * One-time migration: add guest fields to reservations and reviews tables.
 * Run: node scripts/migrate_guest_fields.js
 */
require('dotenv').config();
const sequelize = require('../src/config/database');

async function migrate() {
  try {
    await sequelize.authenticate();
    console.log('Connected to database');

    const [resCols] = await sequelize.query("SHOW COLUMNS FROM Reservations LIKE 'guest_name'");
    if (resCols.length === 0) {
      await sequelize.query('ALTER TABLE Reservations ADD COLUMN guest_name VARCHAR(150) NULL');
      await sequelize.query('ALTER TABLE Reservations ADD COLUMN guest_email VARCHAR(150) NULL');
      await sequelize.query('ALTER TABLE Reservations ADD COLUMN guest_phone VARCHAR(30) NULL');
      console.log('Added guest fields to Reservations');
    }

    try {
      await sequelize.query('ALTER TABLE Reservations MODIFY COLUMN table_id INT UNSIGNED NULL');
      console.log('Made Reservations.table_id nullable');
    } catch (e) {
      console.warn('table_id nullable:', e.message);
    }

    const [revCols] = await sequelize.query("SHOW COLUMNS FROM Avis LIKE 'guest_name'");
    if (revCols.length === 0) {
      await sequelize.query('ALTER TABLE Avis ADD COLUMN guest_name VARCHAR(150) NULL');
      await sequelize.query('ALTER TABLE Avis ADD COLUMN guest_email VARCHAR(150) NULL');
      console.log('Added guest fields to Avis');
    }

    try {
      await sequelize.query('ALTER TABLE Avis MODIFY COLUMN produit_id INT UNSIGNED NULL');
      await sequelize.query('ALTER TABLE Avis MODIFY COLUMN user_id INT UNSIGNED NULL');
      console.log('Made Avis.produit_id and user_id nullable');
    } catch (e) {
      console.warn('Avis nullable:', e.message);
    }

    console.log('Migration complete');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  }
}

migrate();
