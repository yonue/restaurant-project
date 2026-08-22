const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const SiteMedia = sequelize.define('SiteMedia', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  name: { type: DataTypes.STRING(180), allowNull: false },
  type: { type: DataTypes.ENUM('image', 'video'), allowNull: false, defaultValue: 'image' },
  section: { type: DataTypes.STRING(80), allowNull: false },
  placement: { type: DataTypes.STRING(120), allowNull: false },
  file_path: { type: DataTypes.STRING(500), allowNull: false },
  thumbnail: { type: DataTypes.STRING(500), allowNull: true },
  alt: { type: DataTypes.STRING(255), allowNull: true },
  title: { type: DataTypes.STRING(180), allowNull: true },
  description: { type: DataTypes.TEXT, allowNull: true },
  file_size: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
  width: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
  height: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
  is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  created_by: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
}, { tableName: 'site_media' });

module.exports = SiteMedia;
