const express = require('express');
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { protect, authorize } = require('../middleware/auth');
const {
  createListing, getMyListings, getMyListing, updateListing, deleteListing, updateShopProfile,
} = require('../controllers/shopController');

const router = express.Router();

// All shop routes require auth + shopOwner role
router.use(protect);
router.use(authorize('shopOwner'));

// Shop profile
router.put('/profile', updateShopProfile);

// Listings CRUD
router.post(
  '/listings',
  [
    body('title').trim().notEmpty().withMessage('Title is required'),
    body('originalPrice').isFloat({ min: 0 }).withMessage('Original price must be a positive number'),
    body('discountedPrice').isFloat({ min: 0 }).withMessage('Discounted price must be a positive number'),
    body('quantity').optional().isInt({ min: 0 }).withMessage('Quantity must be a non-negative integer'),
    body('maxQuantityPerUser').optional().isInt({ min: 1 }).withMessage('Per-user booking limit must be at least 1'),
    body('category').optional().isIn(['bakery', 'meals', 'snacks', 'beverages', 'dairy', 'fruits', 'vegetables', 'other']),
    body('cuisine').optional().isIn(['indian', 'arabic', 'bakery', 'continental', 'chinese', 'italian', 'desserts', 'beverages', 'other']),
    body('dietaryType').optional().isIn(['veg', 'non-veg']),
    body('availabilityType').optional().isIn(['ready_now', 'pre_order']),
    body('averagePickupMinutes').optional().isInt({ min: 0 }).withMessage('Pickup time must be a non-negative integer'),
    body('readyAt').optional().isISO8601().withMessage('Ready at must be a valid date'),
    body('pickupStartAt').optional().isISO8601().withMessage('Pickup start must be a valid date'),
    body('pickupEndAt').optional().isISO8601().withMessage('Pickup end must be a valid date'),
    body('expiresAt').optional().isISO8601().withMessage('Expiry must be a valid date'),
  ],
  validate,
  createListing
);

router.get('/listings', getMyListings);
router.get('/listings/:id', getMyListing);
router.put('/listings/:id', updateListing);
router.delete('/listings/:id', deleteListing);

module.exports = router;
