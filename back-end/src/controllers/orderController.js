const { Op } = require('sequelize');
const { sequelize, Order, OrderItem, Product, User, Role } = require('../models');
const { logActivity } = require('../services/activityLogService');
const { hasAnyRole } = require('../utils/roles');

function normalizeOrder(orderInstance) {
  if (!orderInstance) {
    return null;
  }

  return orderInstance.toJSON ? orderInstance.toJSON() : { ...orderInstance };
}

function isStaff(user) {
  return hasAnyRole(user, ['Administrator', 'Manager', 'Employee']);
}

async function loadOrderById(id) {
  return Order.findByPk(id, {
    include: [
      { model: User, as: 'user', include: [{ model: Role, as: 'role' }] },
      { model: OrderItem, as: 'items', include: [{ model: Product, as: 'product' }] },
    ],
  });
}

exports.createOrder = async (req, res) => {
  try {
    const userId = isStaff(req.user) && req.body.user_id ? req.body.user_id : req.user.id;
    const { items, note } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'items doit être un tableau non vide.' });
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur introuvable.' });
    }

    const normalizedItems = [];
    for (const item of items) {
      const product = await Product.findByPk(item.produit_id);
      if (!product) {
        return res.status(404).json({ message: `Produit introuvable: ${item.produit_id}` });
      }

      const quantity = Number(item.quantity || 1);
      if (!Number.isInteger(quantity) || quantity <= 0) {
        return res.status(400).json({ message: 'quantity doit être un entier supérieur à 0.' });
      }

      const unitPrice = Number(product.price);
      const subtotal = unitPrice * quantity;
      normalizedItems.push({
        produit_id: product.id,
        quantity,
        unit_price: unitPrice,
        subtotal,
      });
    }

    const totalAmount = normalizedItems.reduce((sum, item) => sum + Number(item.subtotal), 0);

    const order = await sequelize.transaction(async (transaction) => {
      const createdOrder = await Order.create(
        {
          user_id: user.id,
          status: 'PENDING',
          payment_status: 'UNPAID',
          total_amount: totalAmount,
          note: note || null,
        },
        { transaction }
      );

      await OrderItem.bulkCreate(
        normalizedItems.map((item) => ({
          order_id: createdOrder.id,
          ...item,
        })),
        { transaction }
      );

      return createdOrder;
    });

    const created = await loadOrderById(order.id);

    await logActivity({
      userId: req.user.id,
      action: 'ORDER_CREATED',
      entity: 'Order',
      entityId: order.id,
    });

    return res.status(201).json({
      message: 'Commande créée avec succès.',
      order: normalizeOrder(created),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.getAllOrders = async (req, res) => {
  try {
    if (!isStaff(req.user)) {
      return res.status(403).json({ message: 'Accès refusé.' });
    }

    const orders = await Order.findAll({
      include: [
        { model: User, as: 'user', include: [{ model: Role, as: 'role' }] },
        { model: OrderItem, as: 'items', include: [{ model: Product, as: 'product' }] },
      ],
      order: [['order_date', 'DESC']],
    });

    return res.status(200).json({ orders: orders.map(normalizeOrder) });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.getMyOrders = async (req, res) => {
  try {
    const orders = await Order.findAll({
      where: { user_id: req.user.id },
      include: [{ model: OrderItem, as: 'items', include: [{ model: Product, as: 'product' }] }],
      order: [['order_date', 'DESC']],
    });

    return res.status(200).json({ orders: orders.map(normalizeOrder) });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.getOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    const order = await loadOrderById(id);

    if (!order) {
      return res.status(404).json({ message: 'Commande introuvable.' });
    }

    if (order.user_id !== req.user.id && !isStaff(req.user)) {
      return res.status(403).json({ message: 'Accès refusé.' });
    }

    return res.status(200).json({ order: normalizeOrder(order) });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.updateOrderStatus = async (req, res) => {
  try {
    if (!isStaff(req.user)) {
      return res.status(403).json({ message: 'Accès refusé.' });
    }

    const { id } = req.params;
    const { status, payment_status } = req.body;
    const order = await Order.findByPk(id);

    if (!order) {
      return res.status(404).json({ message: 'Commande introuvable.' });
    }

    if (status) {
      order.status = status;
    }

    if (payment_status) {
      order.payment_status = payment_status;
    }

    await order.save();
    const updated = await loadOrderById(order.id);

    await logActivity({
      userId: req.user.id,
      action: `ORDER_STATUS_UPDATED:${status || order.status}`,
      entity: 'Order',
      entityId: order.id,
    });

    return res.status(200).json({
      message: 'Commande mise à jour.',
      order: normalizeOrder(updated),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.deleteOrder = async (req, res) => {
  try {
    if (!isStaff(req.user)) {
      return res.status(403).json({ message: 'Accès refusé.' });
    }

    const { id } = req.params;
    const order = await Order.findByPk(id);
    if (!order) {
      return res.status(404).json({ message: 'Commande introuvable.' });
    }

    await OrderItem.destroy({ where: { order_id: order.id } });
    await order.destroy();

    await logActivity({
      userId: req.user.id,
      action: 'ORDER_DELETED',
      entity: 'Order',
      entityId: order.id,
    });

    return res.status(200).json({ message: 'Commande supprimée.' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
