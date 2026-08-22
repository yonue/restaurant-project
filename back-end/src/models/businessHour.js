const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const BusinessHour = sequelize.define('BusinessHour', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  day_of_week: { type: DataTypes.INTEGER, allowNull: false, unique: true },
  is_closed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
}, { tableName: 'business_hours' });

module.exports = BusinessHour;
