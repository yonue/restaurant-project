const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const RestaurantZone = sequelize.define('RestaurantZone', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  name: { type: DataTypes.STRING(100), allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: true },
  image_path: { type: DataTypes.STRING(500), allowNull: true },
  icon: { type: DataTypes.STRING(60), allowNull: true },
  min_capacity: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
  max_capacity: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
  is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
}, { tableName: 'restaurant_zones' });

module.exports = RestaurantZone;
