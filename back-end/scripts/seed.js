const bcrypt = require('bcrypt');
const {
  sequelize,
  User,
  Category,
  Product,
  RestaurantTable,
  RestaurantSettings,
  Order,
  OrderItem,
  Employee,
  Reservation,
  Avis,
  Favorite,
  Notification,
  ActivityLog,
} = require('../src/models');
const { ensureRoleName, findRoleByName } = require('../src/utils/roles');

async function ensureRole(name, description) {
  return ensureRoleName(name, description);
}
const password = 'Younes123!'
async function ensureUser(first_name, last_name, email, password, phone, roleName, is_verified = true) {
  const role = await findRoleByName(roleName);
  const existingUser = await User.findOne({ where: { email } });
  if (existingUser) {
    existingUser.first_name = first_name;
    existingUser.last_name = last_name;
    existingUser.phone = phone || null;
    existingUser.is_verified = is_verified;
    if (role) {
      existingUser.role_id = role.id;
    }
    await existingUser.save();
    return existingUser;
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const user = await User.create({
    first_name,
    last_name,
    email,
    password: hashedPassword,
    phone: phone || null,
    role_id: role ? role.id : null,
    is_verified,
  });

  return user;
}

async function ensureEmployee(user, position, salary, hire_date) {
  const [employee, created] = await Employee.findOrCreate({
    where: { user_id: user.id },
    defaults: {
      position,
      salary,
      hire_date,
    },
  });
  if (!created) {
    employee.position = position;
    employee.salary = salary;
    employee.hire_date = hire_date;
    await employee.save();
  }
  return employee;
}

async function ensureCategory(name, description) {
  const [category, created] = await Category.findOrCreate({
    where: { name },
    defaults: { description },
  });
  if (!created && description) {
    category.description = description;
    await category.save();
  }
  return category;
}

async function ensureTable(table_number, capacity) {
  const [table, created] = await RestaurantTable.findOrCreate({
    where: { table_number },
    defaults: { capacity, status: 'FREE' },
  });
  if (!created) {
    table.capacity = capacity;
    await table.save();
  }
  return table;
}

async function ensureProduct(payload) {
  const [product, created] = await Product.findOrCreate({
    where: { name: payload.name },
    defaults: payload,
  });
  if (!created) {
    Object.assign(product, payload);
    await product.save();
  }
  return product;
}

async function ensureReservation(user, table, reservation_date, number_of_guests, status, special_request) {
  const [reservation, created] = await Reservation.findOrCreate({
    where: {
      user_id: user.id,
      table_id: table.id,
      reservation_date: new Date(reservation_date),
    },
    defaults: {
      number_of_guests,
      status,
      special_request,
    },
  });
  if (!created) {
    reservation.number_of_guests = number_of_guests;
    reservation.status = status;
    reservation.special_request = special_request;
    await reservation.save();
  }
  return reservation;
}

async function ensureReview(user, product, rating, comment, status, is_approved) {
  const [review, created] = await Avis.findOrCreate({
    where: {
      user_id: user.id,
      produit_id: product.id,
    },
    defaults: {
      rating,
      comment,
      status,
      is_approved,
    },
  });
  if (!created) {
    review.rating = rating;
    review.comment = comment;
    review.status = status;
    review.is_approved = is_approved;
    await review.save();
  }
  return review;
}

async function ensureFavorite(user, product) {
  const [favorite] = await Favorite.findOrCreate({
    where: {
      user_id: user.id,
      produit_id: product.id,
    },
  });
  return favorite;
}

async function ensureNotification(user, title, message, type, is_read = false) {
  const [notification, created] = await Notification.findOrCreate({
    where: {
      user_id: user.id,
      title,
      message,
    },
    defaults: {
      type,
      is_read,
    },
  });
  if (!created) {
    notification.type = type;
    notification.is_read = is_read;
    await notification.save();
  }
  return notification;
}

async function ensureActivityLog(user, action, entity, entity_id) {
  const [log] = await ActivityLog.findOrCreate({
    where: {
      user_id: user.id,
      action,
      entity,
      entity_id: String(entity_id),
    },
  });
  return log;
}

async function seedDemoOrder(user, products) {
  const existing = await Order.findOne({ where: { user_id: user.id } });
  if (existing) {
    await OrderItem.destroy({ where: { order_id: existing.id } });
    await existing.destroy();
  }

  if (products.length === 0) {
    return null;
  }

  const totalAmount = products.reduce((sum, product) => sum + Number(product.price), 0);
  const createdOrder = await Order.create({
    user_id: user.id,
    status: 'COMPLETED',
    payment_status: 'PAID',
    total_amount: totalAmount,
    note: 'Commande de démonstration',
  });

  await OrderItem.bulkCreate(
    products.map((product) => ({
      order_id: createdOrder.id,
      produit_id: product.id,
      quantity: 1,
      unit_price: product.price,
      subtotal: product.price,
    }))
  );

  return createdOrder;
}

async function main() {
  await sequelize.authenticate();
  await sequelize.sync({ alter: true });

  // 1. Rôles
  const adminRole = await ensureRole('Administrator', 'Administrateur général du système');
  const managerRole = await ensureRole('Manager', 'Responsable du restaurant');
  const employeeRole = await ensureRole('Employee', 'Personnel du restaurant');
  const customerRole = await ensureRole('Customer', 'Client du restaurant');

  // 2. Utilisateurs de test
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin123!';
  const adminUser = await ensureUser('Jean', 'Dupont', process.env.ADMIN_EMAIL || 'admin@restaurant.local', adminPassword, '0102030405', 'Administrator');
  const managerUser = await ensureUser('Sophie', 'Martin', 'manager@restaurant.local', 'Manager123!', '0203040506', 'Manager');
  const chefUser = await ensureUser('Pierre', 'Dubois', 'chef@restaurant.local', 'Chef123!', '0304050607', 'Employee');
  const waiterUser = await ensureUser('Luc', 'Leroy', 'waiter@restaurant.local', 'Waiter123!', '0405060708', 'Employee');
  const clientUser = await ensureUser('Marie', 'Clerc', 'client@restaurant.local', 'Client123!', '0506070809', 'Customer');

  // 3. Profils employés
  await ensureEmployee(managerUser, 'Manager', 3500.00, '2026-01-01');
  await ensureEmployee(chefUser, 'Cuisinier', 2800.00, '2026-02-15');
  await ensureEmployee(waiterUser, 'Serveur', 1800.00, '2026-03-01');

  // 4. Catégories
  const catEntrees = await ensureCategory('Entrées', 'Les entrées fraîches et chaudes de saison');
  const catPlats = await ensureCategory('Plats', 'Nos plats de résistance signatures');
  const catDesserts = await ensureCategory('Desserts', 'Les douceurs sucrées de notre chef pâtissier');
  const catBoissons = await ensureCategory('Boissons', 'Sélection de boissons fraîches, vins et cafés');

  // 5. Tables
  const t1 = await ensureTable('T1', 2);
  const t2 = await ensureTable('T2', 4);
  const t3 = await ensureTable('T3', 6);
  const t4 = await ensureTable('T4', 8);

  // 6. Produits
  const pSalade = await ensureProduct({
    name: 'Salade fraîche',
    description: 'Salade composée de saison avec crudités biologiques',
    price: 8.50,
    category_id: catEntrees.id,
    preparation_time: 10,
    is_available: true,
  });

  const pPoulet = await ensureProduct({
    name: 'Poulet rôti',
    description: 'Demi-poulet rôti aux herbes de Provence et frites maison',
    price: 18.00,
    category_id: catPlats.id,
    preparation_time: 25,
    is_available: true,
  });

  const pTiramisu = await ensureProduct({
    name: 'Tiramisu',
    description: 'Tiramisu traditionnel au café et mascarpone',
    price: 7.00,
    category_id: catDesserts.id,
    preparation_time: 8,
    is_available: true,
  });

  const pOrange = await ensureProduct({
    name: 'Jus d\'orange',
    description: 'Jus d\'orange pressé minute',
    price: 3.50,
    category_id: catBoissons.id,
    preparation_time: 3,
    is_available: true,
  });

  const pPizza = await ensureProduct({
    name: 'Pizza Margherita',
    description: 'Sauce tomate maison, mozzarella fior di latte, basilic frais',
    price: 12.00,
    category_id: catPlats.id,
    preparation_time: 15,
    is_available: true,
  });

  const pCafe = await ensureProduct({
    name: 'Café Espresso',
    description: 'Café de spécialité fraîchement moulu',
    price: 2.00,
    category_id: catBoissons.id,
    preparation_time: 2,
    is_available: true,
  });

  // 7. Paramètres du restaurant
  await RestaurantSettings.findOrCreate({
    where: { restaurant_name: 'Restaurant Demo' },
    defaults: {
      restaurant_name: 'Restaurant Demo',
      description: 'Une expérience culinaire unique de démonstration',
      phone: '0102030405',
      email: 'demo@restaurant.local',
      address: '123 Rue de la Gastronomie, 75000 Paris',
      opening_hours: 'Midi : 12h00 - 14h30 | Soir : 19h00 - 22h30',
      logo: null,
      banner: null,
    },
  });

  // 8. Réservations
  const res1Date = new Date();
  res1Date.setDate(res1Date.getDate() + 1);
  res1Date.setHours(19, 30, 0, 0);

  const res2Date = new Date();
  res2Date.setDate(res2Date.getDate() + 2);
  res2Date.setHours(20, 0, 0, 0);

  const r1 = await ensureReservation(clientUser, t1, res1Date, 2, 'CONFIRMED', 'Table près de la fenêtre si possible');
  const r2 = await ensureReservation(clientUser, t2, res2Date, 4, 'PENDING', null);

  // 9. Avis (Reviews)
  await ensureReview(clientUser, pSalade, 5, 'Très frais et parfaitement assaisonné !', 'APPROVED', true);
  await ensureReview(clientUser, pPoulet, 4, 'Excellent poulet, mais frites un peu salées.', 'APPROVED', true);

  // 10. Favoris
  await ensureFavorite(clientUser, pTiramisu);
  await ensureFavorite(clientUser, pPizza);

  // 11. Notifications
  await ensureNotification(clientUser, 'Réservation confirmée', `Votre réservation pour le ${res1Date.toLocaleDateString()} à 19h30 a été validée.`, 'RESERVATION', false);
  await ensureNotification(clientUser, 'Nouveau dessert disponible', 'Découvrez notre Tiramisu fait maison !', 'PRODUCT', true);

  // 12. Logs d'activité
  await ensureActivityLog(adminUser, 'LOGIN', 'User', adminUser.id);
  await ensureActivityLog(clientUser, 'CREATE_RESERVATION', 'Reservation', r1.id);
  await ensureActivityLog(clientUser, 'CREATE_RESERVATION', 'Reservation', r2.id);

  // 13. Commande de démonstration
  const demoOrder = await seedDemoOrder(clientUser, [pPizza, pTiramisu, pOrange]);

  if (demoOrder) {
    await ensureActivityLog(clientUser, 'CREATE_ORDER', 'Order', demoOrder.id);
  }

  console.log('Seed terminé avec succès.');
  console.log(`- Administrateur : ${adminUser.email} / ${adminPassword}`);
  console.log(`- Manager : ${managerUser.email} / Manager123!`);
  console.log(`- Cuisinier : ${chefUser.email} / Chef123!`);
  console.log(`- Serveur : ${waiterUser.email} / Waiter123!`);
  console.log(`- Client : ${clientUser.email} / Client123!`);
  console.log(`- Rôles créés/vérifiés : 4`);
  console.log(`- Tables créées/vérifiées : 4`);
  console.log(`- Catégories créées/vérifiées : 4`);
  console.log(`- Produits créés/vérifiés : 6`);
  console.log(`- Réservations créées/vérifiées : 2`);
  console.log(`- Avis créés/vérifiés : 2`);
  console.log(`- Favoris créés/vérifiés : 2`);
  console.log(`- Notifications créées/vérifiés : 2`);
  console.log(`- Logs d'activité créés/vérifiés : 3 ou plus`);
  if (demoOrder) {
    console.log(`- Commande de démonstration créée (ID: ${demoOrder.id}, Montant: ${demoOrder.total_amount} €)`);
  }
  process.exit(0);
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Seed error:', error);
    process.exit(1);
  });
}

module.exports = {
  main,
};
