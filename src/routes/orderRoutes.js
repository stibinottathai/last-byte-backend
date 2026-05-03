const express = require('express');
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { protect, authorize } = require('../middleware/auth');
const {
  createOrder,
  getMyOrders,
  getShopOrders,
  updateShopOrderStatus,
  verifyShopPickupCode,
  cancelMyOrder,
} = require('../controllers/orderController');

const router = express.Router();

router.use(protect);

router.post(
  '/',
  authorize('user'),
  [
    body('listingId').isMongoId().withMessage('Valid listing id is required'),
    body('quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
  ],
  validate,
  createOrder
);

router.get('/my', authorize('user'), getMyOrders);
router.patch('/my/:id/cancel', authorize('user'), cancelMyOrder);

router.get('/shop', authorize('shopOwner'), getShopOrders);
router.post(
  '/shop/verify-pickup',
  authorize('shopOwner'),
  [body('pickupCode').trim().isLength({ min: 6, max: 8 }).withMessage('Pickup code must be 6 to 8 characters')],
  validate,
  verifyShopPickupCode
);
router.patch(
  '/shop/:id/status',
  authorize('shopOwner'),
  [
    body('status').isIn(['accepted', 'ready', 'completed', 'rejected']).withMessage('Invalid order status'),
    body('pickupCode').optional().trim().isLength({ min: 6, max: 8 }).withMessage('Pickup code must be 6 to 8 characters'),
  ],
  validate,
  updateShopOrderStatus
);

module.exports = router;
