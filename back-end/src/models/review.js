const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Avis = sequelize.define('Avis', {
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    autoIncrement: true,
    primaryKey: true,
  },
  user_id: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: true,
  },
  guest_name: {
    type: DataTypes.STRING(150),
    allowNull: true,
  },
  guest_email: {
    type: DataTypes.STRING(150),
    allowNull: true,
  },
  produit_id: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: true,
  },
  rating: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  comment: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM('PENDING', 'APPROVED', 'REFUSED'),
    allowNull: false,
    defaultValue: 'PENDING',
  },
  is_approved: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  admin_reply: { type: DataTypes.TEXT, allowNull: true },
  replied_at: { type: DataTypes.DATE, allowNull: true },
  is_archived: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
});

module.exports = Avis;
