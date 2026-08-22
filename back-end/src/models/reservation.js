const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Reservation = sequelize.define('Reservation', {
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    autoIncrement: true,
    primaryKey: true,
  },
  user_id: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
  },
  guest_name: {
    type: DataTypes.STRING(150),
    allowNull: true,
  },
  guest_email: {
    type: DataTypes.STRING(150),
    allowNull: true,
  },
  guest_phone: {
    type: DataTypes.STRING(30),
    allowNull: true,
  },
  table_id: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: true,
  },
  zone_id: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: true,
  },
  assigned_tables: {
    type: DataTypes.TEXT('long'),
    allowNull: true,
  },
  reservation_date: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  number_of_guests: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
  },
  status: {
    type: DataTypes.ENUM('PENDING', 'CONFIRMED', 'REFUSED', 'CANCELLED'),
    allowNull: false,
    defaultValue: 'PENDING',
  },
  special_request: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  special_occasion: {
    type: DataTypes.STRING(150),
    allowNull: true,
  },
});

module.exports = Reservation;
