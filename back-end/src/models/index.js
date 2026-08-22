const sequelize = require('../config/database');

const Role = require('./role');
const User = require('./user');
const Category = require('./category');
const Product = require('./product');
const RestaurantTable = require('./restaurantTable');
const Reservation = require('./reservation');
const Avis = require('./review');
const Favorite = require('./favorite');
const Notification = require('./notification');
const ActivityLog = require('./activityLog');
const Employee = require('./employee');
const EmployeeShift = require('./employeeShift');
const RestaurantSettings = require('./restaurantSettings');
const Otp = require('./otpCodes');
const Order = require('./order');
const OrderItem = require('./orderItem');
const GalleryCategory = require('./galleryCategory');
const GalleryMedia = require('./galleryMedia');
const SiteMedia = require('./siteMedia');
const BusinessHour = require('./businessHour');
const BusinessHourPeriod = require('./businessHourPeriod');
const SpecialOpening = require('./specialOpening');
const RestaurantZone = require('./restaurantZone');

User.belongsTo(Role, { foreignKey: 'role_id', as: 'role' });
Role.hasMany(User, { foreignKey: 'role_id', as: 'users' });

Category.hasMany(Product, { foreignKey: 'category_id', as: 'products' });
Product.belongsTo(Category, { foreignKey: 'category_id', as: 'category' });

User.hasMany(Reservation, { foreignKey: 'user_id', as: 'reservations' });
RestaurantTable.hasMany(Reservation, { foreignKey: 'table_id', as: 'reservations' });
Reservation.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
Reservation.belongsTo(RestaurantTable, { foreignKey: 'table_id', as: 'table' });
RestaurantZone.hasMany(RestaurantTable, { foreignKey: 'zone_id', as: 'tables' });
RestaurantTable.belongsTo(RestaurantZone, { foreignKey: 'zone_id', as: 'room' });
RestaurantZone.hasMany(Reservation, { foreignKey: 'zone_id', as: 'reservations' });
Reservation.belongsTo(RestaurantZone, { foreignKey: 'zone_id', as: 'room' });

User.hasMany(Avis, { foreignKey: 'user_id', as: 'avis' });
Product.hasMany(Avis, { foreignKey: 'produit_id', as: 'avis' });
Avis.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
Avis.belongsTo(Product, { foreignKey: 'produit_id', as: 'product' });

User.hasMany(Favorite, { foreignKey: 'user_id', as: 'favorites' });
Product.hasMany(Favorite, { foreignKey: 'produit_id', as: 'favorites' });
Favorite.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
Favorite.belongsTo(Product, { foreignKey: 'produit_id', as: 'product' });

User.hasMany(Notification, { foreignKey: 'user_id', as: 'notifications' });
Notification.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

User.hasMany(ActivityLog, { foreignKey: 'user_id', as: 'activity_logs' });
ActivityLog.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

User.hasOne(Employee, { foreignKey: 'user_id', as: 'employee' });
Employee.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
Employee.hasMany(EmployeeShift, { foreignKey: 'employee_id', as: 'shifts' });
EmployeeShift.belongsTo(Employee, { foreignKey: 'employee_id', as: 'employee' });

User.hasMany(Otp, { foreignKey: 'user_id', as: 'otps' });
Otp.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

User.hasMany(Order, { foreignKey: 'user_id', as: 'orders' });
Order.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
Order.hasMany(OrderItem, { foreignKey: 'order_id', as: 'items' });
OrderItem.belongsTo(Order, { foreignKey: 'order_id', as: 'order' });
Product.hasMany(OrderItem, { foreignKey: 'produit_id', as: 'order_items' });
OrderItem.belongsTo(Product, { foreignKey: 'produit_id', as: 'product' });

GalleryCategory.hasMany(GalleryMedia, { foreignKey: 'category_id', as: 'media', onDelete: 'RESTRICT' });
GalleryMedia.belongsTo(GalleryCategory, { foreignKey: 'category_id', as: 'category' });
  GalleryMedia.belongsTo(User, { foreignKey: 'created_by', as: 'author' });
User.hasMany(SiteMedia, { foreignKey: 'created_by', as: 'site_media' });
SiteMedia.belongsTo(User, { foreignKey: 'created_by', as: 'author' });
BusinessHour.hasMany(BusinessHourPeriod, { foreignKey: 'business_hour_id', as: 'periods', onDelete: 'CASCADE' });
BusinessHourPeriod.belongsTo(BusinessHour, { foreignKey: 'business_hour_id', as: 'business_hour' });

const models = {
  sequelize,
  Role,
  User,
  Category,
  Product,
  RestaurantTable,
  Reservation,
  Avis,
  Review: Avis,
  Favorite,
  Notification,
  ActivityLog,
  Employee,
  EmployeeShift,
  RestaurantSettings,
  Otp,
  Order,
  OrderItem,
  GalleryCategory,
  GalleryMedia,
  SiteMedia,
  BusinessHour,
  BusinessHourPeriod,
  SpecialOpening,
  RestaurantZone,
};

module.exports = models;
