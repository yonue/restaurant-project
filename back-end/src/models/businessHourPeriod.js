const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const BusinessHourPeriod = sequelize.define('BusinessHourPeriod', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  business_hour_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  start_time: { type: DataTypes.STRING(5), allowNull: false },
  end_time: { type: DataTypes.STRING(5), allowNull: false },
  sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
}, { tableName: 'business_hour_periods' });

module.exports = BusinessHourPeriod;
