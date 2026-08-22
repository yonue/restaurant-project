const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

module.exports = sequelize.define('EmployeeShift', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  employee_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  shift_date: { type: DataTypes.DATEONLY, allowNull: false },
  start_time: { type: DataTypes.STRING(5), allowNull: false },
  end_time: { type: DataTypes.STRING(5), allowNull: false },
  role: { type: DataTypes.STRING(80), allowNull: true },
  notes: { type: DataTypes.STRING(255), allowNull: true },
});
