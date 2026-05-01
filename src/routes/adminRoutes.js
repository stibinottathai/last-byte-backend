const express = require('express');
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { protect, authorize } = require('../middleware/auth');
const {
  getUsers,
  getUser,
  updateUser,
  deleteUser,
  createShopOwner,
  getShopOwners,
  updateShopOwner,
  deleteShopOwner,
  getStats,
} = require('../controllers/adminController');

const router = express.Router();

// All admin routes require authentication + admin role
router.use(protect);
router.use(authorize('admin'));

// --------------- User Management ---------------
router.get('/users', getUsers);
router.get('/users/:id', getUser);
router.put('/users/:id', updateUser);
router.delete('/users/:id', deleteUser);

// --------------- Shop Owner Management ---------------
router.post(
  '/shop-owners',
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Please provide a valid email'),
    body('password')
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters'),
    body('shopName').trim().notEmpty().withMessage('Shop name is required'),
    body('shopAddress').trim().notEmpty().withMessage('Shop address is required'),
    body('phone').optional().trim(),
    body('shopDescription').optional().trim(),
    body('shopLatitude').optional().isFloat({ min: -90, max: 90 }).withMessage('Shop latitude must be between -90 and 90'),
    body('shopLongitude').optional().isFloat({ min: -180, max: 180 }).withMessage('Shop longitude must be between -180 and 180'),
    body('averagePickupMinutes').optional().isInt({ min: 0 }).withMessage('Pickup time must be a non-negative integer'),
  ],
  validate,
  createShopOwner
);
router.get('/shop-owners', getShopOwners);
router.put('/shop-owners/:id', updateShopOwner);
router.delete('/shop-owners/:id', deleteShopOwner);

// --------------- Dashboard Stats ---------------
router.get('/stats', getStats);

module.exports = router;
