const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const GalleryCategory = sequelize.define('GalleryCategory', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  name: { type: DataTypes.STRING(120), allowNull: false, unique: true },
  slug: { type: DataTypes.STRING(140), allowNull: false, unique: true },
  description: { type: DataTypes.TEXT, allowNull: true },
  sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
}, { tableName: 'gallery_categories' });

module.exports = GalleryCategory;
