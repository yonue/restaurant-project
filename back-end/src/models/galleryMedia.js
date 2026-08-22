const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const GalleryMedia = sequelize.define('GalleryMedia', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  category_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  type: { type: DataTypes.ENUM('image', 'video'), allowNull: false, defaultValue: 'image' },
  title: { type: DataTypes.STRING(180), allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: true },
  alt: { type: DataTypes.STRING(255), allowNull: true },
  file_path: { type: DataTypes.STRING(500), allowNull: false },
  thumbnail: { type: DataTypes.STRING(500), allowNull: true },
  file_size: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
  width: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
  height: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
  sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  is_public: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  is_primary: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  created_by: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
}, { tableName: 'gallery_media' });

module.exports = GalleryMedia;
