const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ActivityLog = sequelize.define('ActivityLog', {
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    autoIncrement: true,
    primaryKey: true,
  },
  user_id: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
  },
  action: {
    type: DataTypes.STRING(150),
    allowNull: false,
  },
  entity: {
    type: DataTypes.STRING(150),
    allowNull: false,
  },
  entity_id: {
    type: DataTypes.STRING(150),
    allowNull: false,
  },
});

module.exports = ActivityLog;
