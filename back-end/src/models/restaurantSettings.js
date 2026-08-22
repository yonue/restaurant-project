const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const RestaurantSettings = sequelize.define('RestaurantSettings', {
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    autoIncrement: true,
    primaryKey: true,
  },
  restaurant_name: {
    type: DataTypes.STRING(150),
    allowNull: false,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  website_content: {
    type: DataTypes.TEXT('long'),
    allowNull: true,
  },
  phone: {
    type: DataTypes.STRING(30),
    allowNull: true,
  },
  email: {
    type: DataTypes.STRING(191),
    allowNull: true,
  },
  address: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  opening_hours: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  logo: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  banner: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  restaurant_settings: { type: DataTypes.TEXT('long'), allowNull: true },
  schedule_settings: { type: DataTypes.TEXT('long'), allowNull: true },
  website_settings: { type: DataTypes.TEXT('long'), allowNull: true },
  notification_settings: { type: DataTypes.TEXT('long'), allowNull: true },
  appearance_settings: { type: DataTypes.TEXT('long'), allowNull: true },
  security_settings: { type: DataTypes.TEXT('long'), allowNull: true },
});

module.exports = RestaurantSettings;
