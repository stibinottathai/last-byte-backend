const Listing = require('../models/Listing');
const Order = require('../models/Order');
const PlatformSetting = require('../models/PlatformSetting');
const ApiError = require('../utils/ApiError');
const {
  CLOSED_STATUSES,
  disqualifyExpiredReadyOrders,
  disqualifyOrderIfExpired,
  generateUniquePickupCode,
  getPickupExpiresAt,
  normalizePickupCode,
} = require('../utils/orderLifecycle');

const getPagination = (req) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  return { page, limit, skip: (page - 1) * limit };
};

exports.createOrder = async (req, res, next) => {
  try {
    const quantity = parseInt(req.body.quantity, 10);

    if (!quantity || quantity < 1) {
      return next(new ApiError('Please choose at least 1 item', 400));
    }

    const listing = await Listing.findOne({
      _id: req.body.listingId,
      isAvailable: true,
      moderationStatus: 'approved',
      quantity: { $gte: quantity },
      $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gt: new Date() } }],
    }).populate('shopOwner', 'shopName shopAddress');

    if (!listing) {
      return next(new ApiError('This deal is unavailable or does not have enough quantity', 400));
    }

    const existingOrders = await Order.aggregate([
      {
        $match: {
          user: req.user._id,
          listing: listing._id,
          status: { $nin: ['cancelled', 'rejected'] },
        },
      },
      { $group: { _id: '$listing', totalQuantity: { $sum: '$quantity' } } },
    ]);
    const alreadyBooked = existingOrders[0]?.totalQuantity || 0;
    const maxQuantityPerUser = listing.maxQuantityPerUser || 2;
    const remainingForUser = maxQuantityPerUser - alreadyBooked;

    if (quantity > remainingForUser) {
      return next(new ApiError(`You can book only ${remainingForUser} more item(s) from this deal`, 400));
    }

    const updatedListing = await Listing.findOneAndUpdate(
      { _id: listing._id, quantity: { $gte: quantity } },
      { $inc: { quantity: -quantity } },
      { new: true }
    );

    if (!updatedListing) {
      return next(new ApiError('This deal no longer has enough quantity', 400));
    }

    const settings = await PlatformSetting.findOneAndUpdate(
      { key: 'default' },
      { $setOnInsert: { key: 'default' } },
      { upsert: true, new: true }
    );
    const totalPrice = listing.discountedPrice * quantity;
    const platformFeeAmount = Math.round((totalPrice * settings.platformFeePercent) / 100);

    const order = await Order.create({
      user: req.user._id,
      shopOwner: listing.shopOwner._id,
      listing: listing._id,
      pickupCode: await generateUniquePickupCode(),
      quantity,
      unitPrice: listing.discountedPrice,
      totalPrice,
      platformFeePercent: settings.platformFeePercent,
      platformFeeAmount,
      shopPayoutAmount: totalPrice - platformFeeAmount,
      itemSnapshot: {
        title: listing.title,
        category: listing.category,
        cuisine: listing.cuisine,
        dietaryType: listing.dietaryType,
        expiresAt: listing.expiresAt,
      },
      shopSnapshot: {
        shopName: listing.shopOwner.shopName,
        shopAddress: listing.shopOwner.shopAddress,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Order booked successfully',
      data: order,
    });

    // Real-time notification to shop owner
    try {
      const io = require('../config/socket').getIO();
      if (io) {
        io.to(`shop:${listing.shopOwner._id}`).emit('new-order', {
          orderId: order._id,
          itemTitle: listing.title,
          quantity,
          totalPrice,
          customerName: req.user.name,
        });
      }
    } catch (_) { /* socket not critical */ }
  } catch (error) { next(error); }
};

exports.getMyOrders = async (req, res, next) => {
  try {
    const { page, limit, skip } = getPagination(req);
    await disqualifyExpiredReadyOrders({ user: req.user._id });

    const filter = { user: req.user._id };
    if (req.query.status) filter.status = req.query.status;

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .populate('listing', 'title image expiresAt')
        .populate('shopOwner', 'name shopName shopAddress phone')
        .sort('-createdAt')
        .skip(skip)
        .limit(limit),
      Order.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      count: orders.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      data: orders,
    });
  } catch (error) { next(error); }
};

exports.getShopOrders = async (req, res, next) => {
  try {
    const { page, limit, skip } = getPagination(req);
    await disqualifyExpiredReadyOrders({ shopOwner: req.user._id });

    const filter = { shopOwner: req.user._id };
    if (req.query.status) filter.status = req.query.status;

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .select('-pickupCode')
        .populate('user', 'name email phone')
        .populate('listing', 'title image expiresAt')
        .sort('-createdAt')
        .skip(skip)
        .limit(limit),
      Order.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      count: orders.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      data: orders,
    });
  } catch (error) { next(error); }
};

exports.updateShopOrderStatus = async (req, res, next) => {
  try {
    const allowedStatuses = ['accepted', 'ready', 'completed', 'rejected'];
    const { status, pickupCode } = req.body;

    if (!allowedStatuses.includes(status)) {
      return next(new ApiError('Invalid order status', 400));
    }

    const order = await Order.findOne({ _id: req.params.id, shopOwner: req.user._id });
    if (!order) return next(new ApiError('Order not found', 404));
    if (CLOSED_STATUSES.includes(order.status)) {
      return next(new ApiError('This order is already closed', 400));
    }

    if (await disqualifyOrderIfExpired(order)) {
      return next(new ApiError('Pickup window expired. This order is disqualified and cannot be refunded.', 400));
    }

    if (status === 'accepted' && order.status !== 'pending') {
      return next(new ApiError('Only pending orders can be accepted', 400));
    }

    if (status === 'ready' && !['pending', 'accepted'].includes(order.status)) {
      return next(new ApiError('Only pending or accepted orders can be marked ready', 400));
    }

    if (status === 'completed' && order.status !== 'ready') {
      return next(new ApiError('Only ready orders can be completed', 400));
    }

    if (status === 'rejected' && !['pending', 'accepted'].includes(order.status)) {
      return next(new ApiError('Only pending or accepted orders can be rejected', 400));
    }

    if (status === 'completed') {
      if (!pickupCode) {
        return next(new ApiError('Pickup code is required before handing over the order', 400));
      }

      if (normalizePickupCode(pickupCode) !== order.pickupCode) {
        return next(new ApiError('Invalid pickup code', 400));
      }

      order.pickupCodeVerifiedAt = new Date();
      order.completedAt = order.pickupCodeVerifiedAt;
    }

    if (status === 'ready') {
      const readyAt = new Date();
      order.status = 'ready';
      order.readyAt = readyAt;
      order.pickupExpiresAt = getPickupExpiresAt(readyAt);
    } else {
      order.status = status;
    }
    await order.save();
    if (status === 'rejected') {
      await Listing.findByIdAndUpdate(order.listing, { $inc: { quantity: order.quantity } });
    }

    res.status(200).json({ success: true, message: 'Order updated successfully', data: order });
  } catch (error) { next(error); }
};

exports.verifyShopPickupCode = async (req, res, next) => {
  try {
    const pickupCode = normalizePickupCode(req.body.pickupCode);
    if (!pickupCode) {
      return next(new ApiError('Pickup code is required', 400));
    }

    const order = await Order.findOne({
      shopOwner: req.user._id,
      pickupCode,
      status: 'ready',
    });

    if (!order) {
      return next(new ApiError('No ready order found for this pickup code', 404));
    }

    if (await disqualifyOrderIfExpired(order)) {
      return next(new ApiError('Pickup window expired. This order is disqualified and cannot be refunded.', 400));
    }

    order.status = 'completed';
    order.pickupCodeVerifiedAt = new Date();
    order.completedAt = order.pickupCodeVerifiedAt;
    await order.save();

    res.status(200).json({
      success: true,
      message: 'Pickup code verified. Order completed successfully.',
      data: order,
    });
  } catch (error) { next(error); }
};

exports.cancelMyOrder = async (req, res, next) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, user: req.user._id });
    if (!order) return next(new ApiError('Order not found', 404));
    if (await disqualifyOrderIfExpired(order)) {
      return next(new ApiError('Pickup window expired. This order is disqualified and cannot be refunded.', 400));
    }

    if (!['pending', 'accepted'].includes(order.status)) {
      return next(new ApiError('This order can no longer be cancelled', 400));
    }

    order.status = 'cancelled';
    await order.save();
    await Listing.findByIdAndUpdate(order.listing, { $inc: { quantity: order.quantity } });

    res.status(200).json({ success: true, message: 'Order cancelled successfully', data: order });
  } catch (error) { next(error); }
};
