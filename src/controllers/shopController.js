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

exports.createListing = async (req, res, next) => {
  try {
    if (req.user.shopApprovalStatus !== 'approved') {
      return next(new ApiError('Your shop must be approved by admin before creating listings', 403));
    }

    const {
      title,
      description,
      originalPrice,
      discountedPrice,
      quantity,
      maxQuantityPerUser,
      category,
      cuisine,
      dietaryType,
      availabilityType,
      readyAt,
      pickupStartAt,
      pickupEndAt,
      averagePickupMinutes,
      image,
      expiresAt,
    } = req.body;

    if (discountedPrice >= originalPrice) {
      return next(new ApiError('Discounted price must be less than the original price', 400));
    }

    const listing = await Listing.create({
      title, description, originalPrice, discountedPrice,
      quantity, maxQuantityPerUser, category, cuisine, dietaryType, availabilityType,
      readyAt, pickupStartAt, pickupEndAt,
      averagePickupMinutes: averagePickupMinutes ?? req.user.averagePickupMinutes,
      image, expiresAt,
      shopLocation: req.user.shopLocation,
      shopOwner: req.user._id,
      moderationStatus: 'approved',
    });

    res.status(201).json({ success: true, message: 'Listing created successfully', data: listing });
  } catch (error) { next(error); }
};

exports.getMyListings = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;
    const filter = { shopOwner: req.user._id };
    if (req.query.isAvailable !== undefined) filter.isAvailable = req.query.isAvailable === 'true';
    if (req.query.category) filter.category = req.query.category;

    const [listings, total] = await Promise.all([
      Listing.find(filter).skip(skip).limit(limit).sort('-createdAt'),
      Listing.countDocuments(filter),
    ]);

    res.status(200).json({ success: true, count: listings.length, total, page, pages: Math.ceil(total / limit), data: listings });
  } catch (error) { next(error); }
};

exports.getMyListing = async (req, res, next) => {
  try {
    const listing = await Listing.findOne({ _id: req.params.id, shopOwner: req.user._id });
    if (!listing) return next(new ApiError('Listing not found', 404));
    res.status(200).json({ success: true, data: listing });
  } catch (error) { next(error); }
};

exports.updateListing = async (req, res, next) => {
  try {
    let listing = await Listing.findOne({ _id: req.params.id, shopOwner: req.user._id });
    if (!listing) return next(new ApiError('Listing not found', 404));

    const allowedFields = [
      'title', 'description', 'originalPrice', 'discountedPrice', 'quantity', 'category',
      'maxQuantityPerUser', 'cuisine', 'dietaryType', 'availabilityType', 'readyAt', 'pickupStartAt',
      'pickupEndAt', 'averagePickupMinutes', 'image', 'isAvailable', 'expiresAt',
    ];
    const updates = {};
    allowedFields.forEach((f) => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });

    const newOrig = updates.originalPrice || listing.originalPrice;
    const newDisc = updates.discountedPrice || listing.discountedPrice;
    if (newDisc >= newOrig) return next(new ApiError('Discounted price must be less than original price', 400));

    listing = await Listing.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
    res.status(200).json({ success: true, message: 'Listing updated successfully', data: listing });
  } catch (error) { next(error); }
};

exports.deleteListing = async (req, res, next) => {
  try {
    const listing = await Listing.findOne({ _id: req.params.id, shopOwner: req.user._id });
    if (!listing) return next(new ApiError('Listing not found', 404));
    await Listing.findByIdAndDelete(req.params.id);
    res.status(200).json({ success: true, message: 'Listing deleted successfully' });
  } catch (error) { next(error); }
};

exports.updateShopProfile = async (req, res, next) => {
  try {
    const allowedFields = ['name', 'phone', 'shopName', 'shopAddress', 'shopDescription', 'averagePickupMinutes'];
    const updates = {};
    allowedFields.forEach((f) => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
    const shopLocation = buildShopLocation(req.body.shopLatitude, req.body.shopLongitude);
    if (shopLocation) updates.shopLocation = shopLocation;

    const User = require('../models/User');
    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true, runValidators: true });
    if (updates.shopLocation || updates.averagePickupMinutes !== undefined) {
      const listingUpdates = {};
      if (updates.shopLocation) listingUpdates.shopLocation = updates.shopLocation;
      if (updates.averagePickupMinutes !== undefined) listingUpdates.averagePickupMinutes = updates.averagePickupMinutes;
      await Listing.updateMany({ shopOwner: req.user._id }, listingUpdates);
    }
    res.status(200).json({ success: true, message: 'Shop profile updated', data: user });
  } catch (error) { next(error); }
};
