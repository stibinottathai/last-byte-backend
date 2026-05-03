const Listing = require('../models/Listing');
const User = require('../models/User');

const toNumber = (value) => {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const getDistanceKm = (fromLat, fromLng, location) => {
  const coordinates = location?.coordinates;
  if (!coordinates || coordinates.length !== 2) return null;

  const [toLng, toLat] = coordinates;
  const earthRadiusKm = 6371;
  const dLat = ((toLat - fromLat) * Math.PI) / 180;
  const dLng = ((toLng - fromLng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((fromLat * Math.PI) / 180) *
      Math.cos((toLat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const addDiscoveryMeta = (listing, lat, lng) => {
  const item = listing.toObject({ virtuals: true });

  if (lat !== undefined && lng !== undefined) {
    const distanceKm = getDistanceKm(lat, lng, item.shopLocation);
    item.distanceKm = distanceKm === null ? null : Math.round(distanceKm * 10) / 10;
  }

  item.pickupTimeMinutes = item.averagePickupMinutes;
  item.pickupWindow = {
    startAt: item.pickupStartAt || item.readyAt || null,
    endAt: item.pickupEndAt || item.expiresAt || null,
  };

  return item;
};

/**
 * @desc    Get all available listings (public)
 * @route   GET /api/listings
 * @access  Public
 */
exports.getListings = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;
    const now = new Date();

    const filter = {
      isAvailable: true,
      moderationStatus: 'approved',
      quantity: { $gt: 0 },
      $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gt: now } }],
    };

    const activeShopOwnerIds = await User.find({
      role: 'shopOwner',
      isActive: true,
      shopApprovalStatus: 'approved',
    }).distinct('_id');
    filter.shopOwner = { $in: activeShopOwnerIds };

    if (req.query.category) filter.category = req.query.category;
    if (req.query.dietaryType) filter.dietaryType = req.query.dietaryType;
    if (req.query.cuisine) filter.cuisine = req.query.cuisine;
    if (req.query.availabilityType) filter.availabilityType = req.query.availabilityType;
    if (req.query.readyNow === 'true') {
      filter.availabilityType = 'ready_now';
      filter.$and = [
        ...(filter.$and || []),
        { $or: [{ readyAt: { $exists: false } }, { readyAt: { $lte: now } }] },
      ];
    }
    if (req.query.closingSoon === 'true') {
      const closingSoonMinutes = parseInt(req.query.closingSoonMinutes, 10) || 60;
      filter.expiresAt = { $gt: now, $lte: new Date(now.getTime() + closingSoonMinutes * 60000) };
      delete filter.$or;
    }
    if (req.query.search) {
      const searchFilter = [
        { title: { $regex: req.query.search, $options: 'i' } },
        { description: { $regex: req.query.search, $options: 'i' } },
      ];
      filter.$and = [...(filter.$and || []), { $or: searchFilter }];
    }

    const minPrice = toNumber(req.query.minPrice);
    const maxPrice = toNumber(req.query.maxPrice);
    if (minPrice !== undefined || maxPrice !== undefined) {
      filter.discountedPrice = {};
      if (minPrice !== undefined) filter.discountedPrice.$gte = minPrice;
      if (maxPrice !== undefined) filter.discountedPrice.$lte = maxPrice;
    }

    // Sort options
    let sort = '-createdAt';
    if (req.query.sort === 'price_asc') sort = 'discountedPrice';
    if (req.query.sort === 'price_desc') sort = '-discountedPrice';
    if (req.query.sort === 'expires_soon') sort = 'expiresAt';
    if (req.query.sort === 'pickup_time') sort = 'averagePickupMinutes';

    const [listingDocs, totalBeforeDistanceFilter] = await Promise.all([
      Listing.find(filter)
        .populate('shopOwner', 'name shopName shopAddress shopLocation averagePickupMinutes isActive shopApprovalStatus')
        .sort(sort),
      Listing.countDocuments(filter),
    ]);

    const lat = toNumber(req.query.lat);
    const lng = toNumber(req.query.lng);
    const maxDistanceKm = toNumber(req.query.maxDistanceKm);
    const minDiscount = toNumber(req.query.minDiscount);

    let listings = listingDocs.map((listing) => addDiscoveryMeta(listing, lat, lng));

    if (minDiscount !== undefined) {
      listings = listings.filter((listing) => listing.discountPercentage >= minDiscount);
    }
    if (lat !== undefined && lng !== undefined && maxDistanceKm !== undefined) {
      listings = listings.filter((listing) => listing.distanceKm !== null && listing.distanceKm <= maxDistanceKm);
    }

    if (req.query.sort === 'nearby' && lat !== undefined && lng !== undefined) {
      listings.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
    }
    if (req.query.sort === 'discount') {
      listings.sort((a, b) => b.discountPercentage - a.discountPercentage);
    }

    const total = listings.length;
    const paginatedListings = listings.slice(skip, skip + limit);

    res.status(200).json({
      success: true,
      count: paginatedListings.length,
      total,
      totalBeforeDistanceFilter,
      page,
      pages: Math.ceil(total / limit),
      data: paginatedListings,
    });
  } catch (error) { next(error); }
};

/**
 * @desc    Get single listing details
 * @route   GET /api/listings/:id
 * @access  Public
 */
exports.getListing = async (req, res, next) => {
  try {
    const listing = await Listing.findById(req.params.id)
      .populate('shopOwner', 'name shopName shopAddress shopDescription shopLocation averagePickupMinutes isActive shopApprovalStatus');

    if (!listing) {
      return res.status(404).json({ success: false, error: 'Listing not found' });
    }
    if (
      !listing.isAvailable ||
      listing.moderationStatus !== 'approved' ||
      listing.quantity <= 0 ||
      (listing.expiresAt && listing.expiresAt <= new Date()) ||
      !listing.shopOwner ||
      listing.shopOwner.isActive !== true ||
      listing.shopOwner.shopApprovalStatus !== 'approved'
    ) {
      return res.status(404).json({ success: false, error: 'Listing not found' });
    }

    const lat = toNumber(req.query.lat);
    const lng = toNumber(req.query.lng);

    res.status(200).json({ success: true, data: addDiscoveryMeta(listing, lat, lng) });
  } catch (error) { next(error); }
};
