const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const SpecialOpening = sequelize.define('SpecialOpening', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  date: { type: DataTypes.DATEONLY, allowNull: false, unique: true },
  opening_time: { type: DataTypes.STRING(5), allowNull: true },
  closing_time: { type: DataTypes.STRING(5), allowNull: true },
  is_closed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  title: { type: DataTypes.STRING(150), allowNull: true },
  description: { type: DataTypes.TEXT, allowNull: true },
  slots: { type: DataTypes.TEXT('long'), allowNull: true },
}, { tableName: 'special_openings' });

module.exports = SpecialOpening;
