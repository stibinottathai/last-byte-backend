const User = require('../models/User');
const Listing = require('../models/Listing');
const Order = require('../models/Order');
const PlatformSetting = require('../models/PlatformSetting');
const ApiError = require('../utils/ApiError');

const buildShopLocation = (latitude, longitude) => {
  if (latitude === undefined || longitude === undefined || latitude === '' || longitude === '') return undefined;

  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;

  return {
    type: 'Point',
    coordinates: [lng, lat],
  };
};

const getRestorableListingFilter = (shopOwnerId) => ({
  shopOwner: shopOwnerId,
  isAvailable: true,
  moderationStatus: 'approved',
  quantity: { $gt: 0 },
  $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gt: new Date() } }],
});

// =============================================
//  USER MANAGEMENT
// =============================================

/**
 * @desc    Get all users (with pagination & role filter)
 * @route   GET /api/admin/users
 * @access  Admin
 */
exports.getUsers = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;

    // Optional filters
    const filter = {};
    if (req.query.role) filter.role = req.query.role;
    if (req.query.isActive !== undefined) filter.isActive = req.query.isActive === 'true';
    if (req.query.search) {
      filter.$or = [
        { name: { $regex: req.query.search, $options: 'i' } },
        { email: { $regex: req.query.search, $options: 'i' } },
      ];
    }

    const [users, total] = await Promise.all([
      User.find(filter).skip(skip).limit(limit).sort('-createdAt'),
      User.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      count: users.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      data: users,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get single user by ID
 * @route   GET /api/admin/users/:id
 * @access  Admin
 */
exports.getUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return next(new ApiError('User not found', 404));
    }

    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update a user (change role, activate/deactivate, etc.)
 * @route   PUT /api/admin/users/:id
 * @access  Admin
 */
exports.updateUser = async (req, res, next) => {
  try {
    const allowedFields = [
      'name', 'email', 'phone', 'role', 'isActive', 'shopName', 'shopAddress',
      'shopDescription', 'averagePickupMinutes', 'shopApprovalStatus', 'shopRejectionReason', 'banReason',
    ];
    const updates = {};

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });
    const shopLocation = buildShopLocation(req.body.shopLatitude, req.body.shopLongitude);
    if (shopLocation) updates.shopLocation = shopLocation;

    // Prevent admin from deactivating themselves
    if (req.params.id === req.user._id.toString() && updates.isActive === false) {
      return next(new ApiError('You cannot deactivate your own account', 400));
    }

    const user = await User.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });

    if (!user) {
      return next(new ApiError('User not found', 404));
    }

    if (user.role === 'shopOwner' && (updates.shopLocation || updates.averagePickupMinutes !== undefined)) {
      const listingUpdates = {};
      if (updates.shopLocation) listingUpdates.shopLocation = updates.shopLocation;
      if (updates.averagePickupMinutes !== undefined) listingUpdates.averagePickupMinutes = updates.averagePickupMinutes;
      await Listing.updateMany({ shopOwner: user._id }, listingUpdates);
    }

    res.status(200).json({
      success: true,
      message: 'User updated successfully',
      data: user,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete a user
 * @route   DELETE /api/admin/users/:id
 * @access  Admin
 */
exports.deleteUser = async (req, res, next) => {
  try {
    // Prevent admin from deleting themselves
    if (req.params.id === req.user._id.toString()) {
      return next(new ApiError('You cannot delete your own account', 400));
    }

    const user = await User.findById(req.params.id);

    if (!user) {
      return next(new ApiError('User not found', 404));
    }

    // Also delete all listings by this user if they are a shop owner
    if (user.role === 'shopOwner') {
      await Listing.deleteMany({ shopOwner: user._id });
    }

    await User.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'User deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

// =============================================
//  SHOP OWNER MANAGEMENT
// =============================================

/**
 * @desc    Create a new shop owner account
 * @route   POST /api/admin/shop-owners
 * @access  Admin
 */
exports.createShopOwner = async (req, res, next) => {
  try {
    const {
      name,
      email,
      password,
      phone,
      shopName,
      shopAddress,
      shopDescription,
      shopLatitude,
      shopLongitude,
      averagePickupMinutes,
    } = req.body;

    // Check if email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return next(new ApiError('An account with this email already exists', 400));
    }

    const shopOwner = await User.create({
      name,
      email,
      password,
      phone,
      role: 'shopOwner',
      shopName,
      shopAddress,
      shopDescription,
      shopLocation: buildShopLocation(shopLatitude, shopLongitude),
      averagePickupMinutes,
      shopApprovalStatus: 'approved',
    });

    res.status(201).json({
      success: true,
      message: 'Shop owner account created successfully',
      data: {
        _id: shopOwner._id,
        name: shopOwner.name,
        email: shopOwner.email,
        phone: shopOwner.phone,
        role: shopOwner.role,
        shopName: shopOwner.shopName,
        shopAddress: shopOwner.shopAddress,
        shopDescription: shopOwner.shopDescription,
        shopLocation: shopOwner.shopLocation,
        averagePickupMinutes: shopOwner.averagePickupMinutes,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get all shop owners
 * @route   GET /api/admin/shop-owners
 * @access  Admin
 */
exports.getShopOwners = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;

    const filter = { role: 'shopOwner' };
    if (req.query.isActive !== undefined) filter.isActive = req.query.isActive === 'true';
    if (req.query.shopApprovalStatus) filter.shopApprovalStatus = req.query.shopApprovalStatus;
    if (req.query.search) {
      filter.$or = [
        { name: { $regex: req.query.search, $options: 'i' } },
        { shopName: { $regex: req.query.search, $options: 'i' } },
        { email: { $regex: req.query.search, $options: 'i' } },
      ];
    }

    const [shopOwners, total] = await Promise.all([
      User.find(filter).skip(skip).limit(limit).sort('-createdAt'),
      User.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      count: shopOwners.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      data: shopOwners,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update a shop owner
 * @route   PUT /api/admin/shop-owners/:id
 * @access  Admin
 */
exports.updateShopOwner = async (req, res, next) => {
  try {
    const shopOwner = await User.findById(req.params.id);

    if (!shopOwner) {
      return next(new ApiError('Shop owner not found', 404));
    }

    if (shopOwner.role !== 'shopOwner') {
      return next(new ApiError('This user is not a shop owner', 400));
    }

    const allowedFields = [
      'name', 'email', 'phone', 'isActive', 'shopName', 'shopAddress',
      'shopDescription', 'averagePickupMinutes', 'shopApprovalStatus', 'shopRejectionReason', 'banReason',
    ];
    const updates = {};

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });
    const shopLocation = buildShopLocation(req.body.shopLatitude, req.body.shopLongitude);
    if (shopLocation) updates.shopLocation = shopLocation;

    const updated = await User.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });
    let visibleListingCount;

    if (updates.shopLocation || updates.averagePickupMinutes !== undefined) {
      const listingUpdates = {};
      if (updates.shopLocation) listingUpdates.shopLocation = updates.shopLocation;
      if (updates.averagePickupMinutes !== undefined) listingUpdates.averagePickupMinutes = updates.averagePickupMinutes;
      await Listing.updateMany({ shopOwner: req.params.id }, listingUpdates);
    }

    if (updates.isActive === true && updated.shopApprovalStatus === 'approved') {
      visibleListingCount = await Listing.countDocuments(getRestorableListingFilter(updated._id));
    }

    res.status(200).json({
      success: true,
      message: visibleListingCount !== undefined
        ? `Shop owner updated successfully. ${visibleListingCount} non-expired listing(s) are visible again.`
        : 'Shop owner updated successfully',
      data: updated,
      ...(visibleListingCount !== undefined ? { visibleListingCount } : {}),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete a shop owner (and their listings)
 * @route   DELETE /api/admin/shop-owners/:id
 * @access  Admin
 */
exports.deleteShopOwner = async (req, res, next) => {
  try {
    const shopOwner = await User.findById(req.params.id);

    if (!shopOwner) {
      return next(new ApiError('Shop owner not found', 404));
    }

    if (shopOwner.role !== 'shopOwner') {
      return next(new ApiError('This user is not a shop owner', 400));
    }

    // Delete all their listings
    await Listing.deleteMany({ shopOwner: shopOwner._id });

    // Delete the shop owner account
    await User.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Shop owner and their listings deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

// =============================================
//  MODERATION
// =============================================

exports.updateShopApproval = async (req, res, next) => {
  try {
    const { status, reason } = req.body;
    if (!['pending', 'approved', 'rejected'].includes(status)) {
      return next(new ApiError('Invalid shop approval status', 400));
    }

    const shopOwner = await User.findOneAndUpdate(
      { _id: req.params.id, role: 'shopOwner' },
      {
        shopApprovalStatus: status,
        shopRejectionReason: status === 'rejected' ? reason : '',
        isActive: status !== 'rejected',
      },
      { new: true, runValidators: true }
    );

    if (!shopOwner) return next(new ApiError('Shop owner not found', 404));

    res.status(200).json({ success: true, message: 'Shop approval updated', data: shopOwner });
  } catch (error) { next(error); }
};

exports.getListingsForReview = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 50;
    const skip = (page - 1) * limit;
    const filter = {};
    if (req.query.moderationStatus) filter.moderationStatus = req.query.moderationStatus;
    if (req.query.reported === 'true') filter.reportCount = { $gt: 0 };

    const [listings, total] = await Promise.all([
      Listing.find(filter).populate('shopOwner', 'name email shopName shopAddress').sort('-createdAt').skip(skip).limit(limit),
      Listing.countDocuments(filter),
    ]);

    res.status(200).json({ success: true, count: listings.length, total, page, pages: Math.ceil(total / limit), data: listings });
  } catch (error) { next(error); }
};

exports.updateListingModeration = async (req, res, next) => {
  try {
    const { status, note } = req.body;
    if (!['pending', 'approved', 'rejected'].includes(status)) {
      return next(new ApiError('Invalid listing moderation status', 400));
    }

    const listing = await Listing.findByIdAndUpdate(
      req.params.id,
      {
        moderationStatus: status,
        moderationNote: note || '',
        isAvailable: status !== 'rejected',
      },
      { new: true, runValidators: true }
    ).populate('shopOwner', 'name email shopName');

    if (!listing) return next(new ApiError('Listing not found', 404));

    res.status(200).json({
      success: true,
      message: status === 'rejected' ? 'Listing delisted' : 'Listing relisted',
      data: listing,
    });
  } catch (error) { next(error); }
};

exports.banUser = async (req, res, next) => {
  try {
    if (req.params.id === req.user._id.toString()) {
      return next(new ApiError('You cannot ban your own account', 400));
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isActive: false, banReason: req.body.reason || 'Policy violation' },
      { new: true, runValidators: true }
    );
    if (!user) return next(new ApiError('User not found', 404));

    res.status(200).json({ success: true, message: 'User banned', data: user });
  } catch (error) { next(error); }
};

exports.reportListing = async (req, res, next) => {
  try {
    const listing = await Listing.findByIdAndUpdate(
      req.params.id,
      {
        $inc: { reportCount: 1 },
        $push: { reportReasons: req.body.reason || 'Reported by user' },
      },
      { new: true }
    );
    if (!listing) return next(new ApiError('Listing not found', 404));

    res.status(200).json({ success: true, message: 'Listing reported', data: { reportCount: listing.reportCount } });
  } catch (error) { next(error); }
};

// =============================================
//  DASHBOARD STATS
// =============================================

/**
 * @desc    Get admin dashboard stats
 * @route   GET /api/admin/stats
 * @access  Admin
 */
exports.getStats = async (req, res, next) => {
  try {
    const [
      totalUsers,
      totalShopOwners,
      totalListings,
      activeListings,
      activeUsers,
      inactiveUsers,
      pendingShops,
      delistedListings,
      orderStats,
    ] = await Promise.all([
      User.countDocuments({ role: 'user' }),
      User.countDocuments({ role: 'shopOwner' }),
      Listing.countDocuments(),
      Listing.countDocuments({ isAvailable: true }),
      User.countDocuments({ isActive: true }),
      User.countDocuments({ isActive: false }),
      User.countDocuments({ role: 'shopOwner', shopApprovalStatus: 'pending' }),
      Listing.countDocuments({ moderationStatus: 'rejected' }),
      Order.aggregate([
        {
          $group: {
            _id: null,
            totalOrders: { $sum: 1 },
            revenue: { $sum: '$totalPrice' },
            platformFees: { $sum: '$platformFeeAmount' },
            shopPayouts: { $sum: '$shopPayoutAmount' },
          },
        },
      ]),
    ]);
    const totals = orderStats[0] || { totalOrders: 0, revenue: 0, platformFees: 0, shopPayouts: 0 };

    res.status(200).json({
      success: true,
      data: {
        totalUsers,
        totalShopOwners,
        totalListings,
        activeListings,
        activeUsers,
        inactiveUsers,
        pendingShops,
        delistedListings,
        totalOrders: totals.totalOrders,
        revenue: totals.revenue,
        platformFees: totals.platformFees,
        shopPayouts: totals.shopPayouts,
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.getBusinessInsights = async (req, res, next) => {
  try {
    const [orders, topAreas, userActivity] = await Promise.all([
      Order.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            revenue: { $sum: '$totalPrice' },
            platformFees: { $sum: '$platformFeeAmount' },
          },
        },
      ]),
      Order.aggregate([
        {
          $group: {
            _id: '$shopSnapshot.shopAddress',
            orders: { $sum: 1 },
            revenue: { $sum: '$totalPrice' },
          },
        },
        { $sort: { orders: -1, revenue: -1 } },
        { $limit: 5 },
      ]),
      User.aggregate([
        { $group: { _id: '$isActive', count: { $sum: 1 } } },
      ]),
    ]);

    res.status(200).json({
      success: true,
      data: {
        orders,
        topAreas,
        userActivity,
      },
    });
  } catch (error) { next(error); }
};

exports.getPlatformSettings = async (req, res, next) => {
  try {
    const settings = await PlatformSetting.findOneAndUpdate(
      { key: 'default' },
      { $setOnInsert: { key: 'default' } },
      { upsert: true, new: true }
    );
    res.status(200).json({ success: true, data: settings });
  } catch (error) { next(error); }
};

exports.updatePlatformSettings = async (req, res, next) => {
  try {
    const settings = await PlatformSetting.findOneAndUpdate(
      { key: 'default' },
      { platformFeePercent: req.body.platformFeePercent },
      { upsert: true, new: true, runValidators: true }
    );
    res.status(200).json({ success: true, message: 'Platform fee updated', data: settings });
  } catch (error) { next(error); }
};
