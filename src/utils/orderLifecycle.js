const crypto = require('crypto');
const Order = require('../models/Order');

const PICKUP_WINDOW_MS = 60 * 60 * 1000;
const CLOSED_STATUSES = ['completed', 'cancelled', 'rejected', 'disqualified'];

const normalizePickupCode = (code) => String(code || '').trim().toUpperCase();

const createPickupCode = () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code += alphabet[crypto.randomInt(0, alphabet.length)];
  }
  return code;
};

const generateUniquePickupCode = async () => {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const pickupCode = createPickupCode();
    const exists = await Order.exists({ pickupCode });
    if (!exists) return pickupCode;
  }

  throw new Error('Could not generate a unique pickup code');
};

const getPickupExpiresAt = (readyAt = new Date()) => new Date(readyAt.getTime() + PICKUP_WINDOW_MS);

const isReadyOrderExpired = (order, now = new Date()) => {
  if (!order || order.status !== 'ready') return false;
  const pickupExpiresAt = order.pickupExpiresAt || (order.readyAt ? getPickupExpiresAt(order.readyAt) : null);
  return !!pickupExpiresAt && pickupExpiresAt <= now;
};

const disqualifyExpiredReadyOrders = async (filter = {}) => {
  const now = new Date();
  const readyBefore = new Date(now.getTime() - PICKUP_WINDOW_MS);
  return Order.updateMany(
    {
      ...filter,
      status: 'ready',
      $or: [
        { pickupExpiresAt: { $lte: now } },
        { pickupExpiresAt: { $exists: false }, readyAt: { $lte: readyBefore } },
      ],
    },
    {
      status: 'disqualified',
      disqualifiedAt: now,
    }
  );
};

const disqualifyOrderIfExpired = async (order) => {
  if (!isReadyOrderExpired(order)) return false;

  order.status = 'disqualified';
  order.disqualifiedAt = new Date();
  await order.save();
  return true;
};

module.exports = {
  CLOSED_STATUSES,
  PICKUP_WINDOW_MS,
  disqualifyExpiredReadyOrders,
  disqualifyOrderIfExpired,
  generateUniquePickupCode,
  getPickupExpiresAt,
  isReadyOrderExpired,
  normalizePickupCode,
};
