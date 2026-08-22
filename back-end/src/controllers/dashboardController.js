const { Op } = require('sequelize');
const {
  Reservation,
  RestaurantTable,
  Product,
  Category,
  Avis,
  User,
  Role,
  Order,
  OrderItem,
  ActivityLog,
  RestaurantSettings,
} = require('../models');
const { hasAnyRole, hasRoleName } = require('../utils/roles');

function isAdminOrManager(user) {
  return hasAnyRole(user, ['Administrator', 'Manager']);
}

function isAdmin(user) {
  return hasRoleName(user, 'Administrator');
}

function startOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function startOfWeek(date = new Date()) {
  const d = startOfDay(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d;
}

function formatDay(date) {
  return date.toISOString().slice(0, 10);
}

function monthLabel(year, monthIndex) {
  return new Date(year, monthIndex, 1).toLocaleDateString('fr-FR', {
    month: 'short',
    year: 'numeric',
  });
}

exports.getOverview = async (req, res) => {
  try {
    if (!isAdminOrManager(req.user)) {
      return res.status(403).json({ message: 'Accès refusé.' });
    }

    const todayStart = startOfDay();
    const todayEnd = endOfDay();

    const [
      totalUsers,
      totalReservations,
      reservationsToday,
      tables,
      totalProducts,
      totalCategories,
      totalReviews,
      approvedReviews,
      pendingReviews,
      refusedReviews,
      totalOrders,
      revenueRaw,
      orderItems,
      reservationStats,
    ] = await Promise.all([
      User.count(),
      Reservation.count(),
      Reservation.count({ where: { reservation_date: { [Op.between]: [todayStart, todayEnd] } } }),
      RestaurantTable.findAll(),
      Product.count(),
      Category.count(),
      Avis.count(),
      Avis.count({ where: { status: 'APPROVED' } }),
      Avis.count({ where: { status: 'PENDING' } }),
      Avis.count({ where: { status: 'REFUSED' } }),
      Order.count(),
      Order.sum('total_amount', {
        where: {
          status: { [Op.notIn]: ['CANCELLED'] },
          payment_status: 'PAID',
        },
      }),
      OrderItem.findAll({
        include: [
          { model: Product, as: 'product' },
          {
            model: Order,
            as: 'order',
            attributes: ['status'],
            where: { status: { [Op.not]: 'CANCELLED' } },
            required: true,
          },
        ],
      }),
      Promise.all([
        Reservation.count({ where: { status: 'PENDING' } }),
        Reservation.count({ where: { status: 'CONFIRMED' } }),
        Reservation.count({ where: { status: 'REFUSED' } }),
        Reservation.count({ where: { status: 'CANCELLED' } }),
      ]),
    ]);

    const revenueValue = Number(revenueRaw || 0);

    const soldMap = new Map();
    for (const item of orderItems) {
      const current = soldMap.get(item.produit_id) || {
        produit_id: item.produit_id,
        name: item.product?.name || null,
        totalSold: 0,
      };
      current.totalSold += Number(item.quantity || 0);
      soldMap.set(item.produit_id, current);
    }

    const topSellingDishes = Array.from(soldMap.values())
      .sort((a, b) => b.totalSold - a.totalSold)
      .slice(0, 5);

    const tableStats = tables.reduce(
      (acc, table) => {
        const status = String(table.status || '').toUpperCase();
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      },
      { FREE: 0, RESERVED: 0, OCCUPIED: 0 }
    );

    return res.status(200).json({
      overview: {
        totalUsers,
        totalReservations,
        reservationsToday,
        totalProducts,
        totalCategories,
        totalTables: tables.length,
        totalReviews,
        approvedReviews,
        pendingReviews,
        refusedReviews,
        reservationStats: {
          pending: reservationStats[0],
          confirmed: reservationStats[1],
          refused: reservationStats[2],
          cancelled: reservationStats[3],
        },
        tableStats,
        revenue: revenueValue,
        ordersCount: totalOrders,
        topSellingDishes,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.getCharts = async (req, res) => {
  try {
    if (!isAdminOrManager(req.user)) {
      return res.status(403).json({ message: 'Accès refusé.' });
    }

    const now = new Date();
    const weekStart = startOfWeek(now);
    const yearStart = new Date(now.getFullYear(), 0, 1);

    const [reservations, orders] = await Promise.all([
      Reservation.findAll({
        where: {
          reservation_date: {
            [Op.gte]: weekStart,
            [Op.lte]: now,
          },
        },
        order: [['reservation_date', 'ASC']],
      }),
      Order.findAll({
        where: {
          order_date: {
            [Op.gte]: yearStart,
            [Op.lte]: now,
          },
          payment_status: 'PAID',
          status: { [Op.not]: 'CANCELLED' },
        },
        order: [['order_date', 'ASC']],
      }),
    ]);

    const reservationsByDay = {};
    for (let i = 0; i < 7; i += 1) {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + i);
      reservationsByDay[formatDay(date)] = 0;
    }

    for (const reservation of reservations) {
      const dayKey = formatDay(new Date(reservation.reservation_date));
      if (reservationsByDay[dayKey] !== undefined) {
        reservationsByDay[dayKey] += 1;
      }
    }

    const monthlyRevenue = Array.from({ length: 12 }, (_, monthIndex) => ({
      month: monthLabel(now.getFullYear(), monthIndex),
      revenue: 0,
    }));

    for (const order of orders) {
      const orderDate = new Date(order.order_date);
      const monthIndex = orderDate.getMonth();
      if (monthlyRevenue[monthIndex]) {
        monthlyRevenue[monthIndex].revenue += Number(order.total_amount || 0);
      }
    }

    return res.status(200).json({
      charts: {
        reservationsByWeek: Object.entries(reservationsByDay).map(([date, count]) => ({ date, count })),
        salesByMonth: monthlyRevenue.map((row) => ({ month: row.month, revenue: row.revenue })),
        revenueByMonth: monthlyRevenue.map((row) => ({ month: row.month, revenue: row.revenue })),
      },
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.getActivityLogs = async (req, res) => {
  try {
    if (!isAdmin(req.user)) {
      return res.status(403).json({ message: "Accès réservé à l'administrateur." });
    }

    const limit = Math.min(Number(req.query.limit || 50), 200);
    const page = Math.max(Number(req.query.page || 1), 1);
    const offset = (page - 1) * limit;
    const entity = req.query.entity ? String(req.query.entity) : null;

    const where = entity ? { entity } : {};

    const { rows, count } = await ActivityLog.findAndCountAll({
      where,
      include: [{ model: User, as: 'user', include: [{ model: Role, as: 'role' }] }],
      order: [['createdAt', 'DESC']],
      limit,
      offset,
    });

    return res.status(200).json({
      logs: rows,
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.max(Math.ceil(count / limit), 1),
      },
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.getSettings = async (req, res) => {
  try {
    let settings = await RestaurantSettings.findOne();
    if (!settings) {
      settings = await RestaurantSettings.create({
        restaurant_name: "L'Élégance",
        description: "Une expérience culinaire unique",
        website_content: null,
        phone: "+33 1 23 45 67 89",
        email: "contact@elegance.fr",
        address: "123 Rue de Paris, 75001 Paris",
        opening_hours: "Midi : 12h00 - 14h30 | Soir : 19h00 - 22h30",
      });
    }
    return res.status(200).json({ settings });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.updateSettings = async (req, res) => {
  try {
    if (!isAdminOrManager(req.user)) {
      return res.status(403).json({ message: 'Accès refusé.' });
    }

    const {
      restaurant_name,
      description,
      website_content,
      phone,
      email,
      address,
      opening_hours,
      logo,
      banner,
    } = req.body;

    if (description !== undefined && !isAdmin(req.user)) {
      return res.status(403).json({
        message: "La modification du contenu du site web est réservée à l'administrateur.",
      });
    }
    if (website_content !== undefined && !isAdmin(req.user)) {
      return res.status(403).json({
        message: "La modification du contenu du site web est réservée à l'administrateur.",
      });
    }

    let settings = await RestaurantSettings.findOne();
    if (!settings) {
      settings = await RestaurantSettings.create({
        restaurant_name: restaurant_name || "L'Élégance",
        description,
        website_content,
        phone,
        email,
        address,
        opening_hours,
        logo,
        banner,
      });
    } else {
      await settings.update({
        restaurant_name: restaurant_name !== undefined ? restaurant_name : settings.restaurant_name,
        description: description !== undefined ? description : settings.description,
        website_content: website_content !== undefined ? website_content : settings.website_content,
        phone: phone !== undefined ? phone : settings.phone,
        email: email !== undefined ? email : settings.email,
        address: address !== undefined ? address : settings.address,
        opening_hours: opening_hours !== undefined ? opening_hours : settings.opening_hours,
        logo: logo !== undefined ? logo : settings.logo,
        banner: banner !== undefined ? banner : settings.banner,
      });
    }

    return res.status(200).json({ message: 'Paramètres mis à jour avec succès.', settings });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
