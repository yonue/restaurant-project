const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');


const RestaurantTable = sequelize.define('RestaurantTable', {
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    autoIncrement: true,
    primaryKey: true,
  },
  table_number: {
    type: DataTypes.STRING(30),
    allowNull: false,
    unique: true,
  },
  zone_id: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: true,
  },
  capacity: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
  },
  status: {
    type: DataTypes.ENUM('FREE', 'RESERVED', 'OCCUPIED'),
    allowNull: false,
    defaultValue: 'FREE',
  },
  is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  position_x: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 16 },
  position_y: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 22 },
  width: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 104 },
  height: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 76 },
  rotation: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
  shape: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'Round' },
  zone: { type: DataTypes.STRING(80), allowNull: false, defaultValue: 'Main Room' },
  color: { type: DataTypes.STRING(20), allowNull: false, defaultValue: '#b98b3b' },
  notes: { type: DataTypes.TEXT, allowNull: true },
});

module.exports = RestaurantTable;
