const mongoose = require('mongoose');

const PICKUP_CODE_TTL_MINUTES = 60;

const orderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    shopOwner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    listing: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Listing',
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: [1, 'Order quantity must be at least 1'],
    },
    unitPrice: {
      type: Number,
      required: true,
      min: [0, 'Unit price cannot be negative'],
    },
    totalPrice: {
      type: Number,
      required: true,
      min: [0, 'Total price cannot be negative'],
    },
    platformFeePercent: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    platformFeeAmount: {
      type: Number,
      min: 0,
      default: 0,
    },
    shopPayoutAmount: {
      type: Number,
      min: 0,
      default: 0,
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'ready', 'completed', 'cancelled', 'rejected', 'disqualified'],
      default: 'pending',
    },
    pickupCode: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      minlength: 6,
      maxlength: 8,
      select: true,
    },
    readyAt: {
      type: Date,
    },
    pickupExpiresAt: {
      type: Date,
    },
    pickupCodeVerifiedAt: {
      type: Date,
    },
    completedAt: {
      type: Date,
    },
    disqualifiedAt: {
      type: Date,
    },
    itemSnapshot: {
      title: String,
      category: String,
      cuisine: String,
      dietaryType: String,
      expiresAt: Date,
    },
    shopSnapshot: {
      shopName: String,
      shopAddress: String,
    },
  },
  {
    timestamps: true,
  }
);

orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ shopOwner: 1, createdAt: -1 });
orderSchema.index({ status: 1 });
orderSchema.index({ pickupExpiresAt: 1, status: 1 });
orderSchema.index({ pickupCode: 1 }, { unique: true, partialFilterExpression: { pickupCode: { $type: 'string' } } });

orderSchema.methods.markReady = function () {
  const now = new Date();
  this.status = 'ready';
  this.readyAt = now;
  this.pickupExpiresAt = new Date(now.getTime() + PICKUP_CODE_TTL_MINUTES * 60000);
};

module.exports = mongoose.model('Order', orderSchema);
