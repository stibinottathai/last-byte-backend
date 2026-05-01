const User = require('../models/User');
const Listing = require('../models/Listing');
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

    if (user.role === 'shopOwner' && (updates.shopLocation || updates.averagePickupMinutes !== undefined)) {
      const listingUpdates = {};
      if (updates.shopLocation) listingUpdates.shopLocation = updates.shopLocation;
      if (updates.averagePickupMinutes !== undefined) listingUpdates.averagePickupMinutes = updates.averagePickupMinutes;
      await Listing.updateMany({ shopOwner: user._id }, listingUpdates);
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
      'shopDescription', 'averagePickupMinutes',
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
      'shopDescription', 'averagePickupMinutes',
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

    if (updates.shopLocation || updates.averagePickupMinutes !== undefined) {
      const listingUpdates = {};
      if (updates.shopLocation) listingUpdates.shopLocation = updates.shopLocation;
      if (updates.averagePickupMinutes !== undefined) listingUpdates.averagePickupMinutes = updates.averagePickupMinutes;
      await Listing.updateMany({ shopOwner: req.params.id }, listingUpdates);
    }

    res.status(200).json({
      success: true,
      message: 'Shop owner updated successfully',
      data: updated,
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
//  DASHBOARD STATS
// =============================================

/**
 * @desc    Get admin dashboard stats
 * @route   GET /api/admin/stats
 * @access  Admin
 */
exports.getStats = async (req, res, next) => {
  try {
    const [totalUsers, totalShopOwners, totalListings, activeListings] = await Promise.all([
      User.countDocuments({ role: 'user' }),
      User.countDocuments({ role: 'shopOwner' }),
      Listing.countDocuments(),
      Listing.countDocuments({ isAvailable: true }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        totalUsers,
        totalShopOwners,
        totalListings,
        activeListings,
      },
    });
  } catch (error) {
    next(error);
  }
};
