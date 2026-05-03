const mongoose = require('mongoose');

const listingSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Please provide a title for the listing'],
      trim: true,
      maxlength: [100, 'Title cannot exceed 100 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
    },
    originalPrice: {
      type: Number,
      required: [true, 'Please provide the original price'],
      min: [0, 'Price cannot be negative'],
    },
    discountedPrice: {
      type: Number,
      required: [true, 'Please provide the discounted price'],
      min: [0, 'Price cannot be negative'],
    },
    quantity: {
      type: Number,
      required: [true, 'Please provide the quantity'],
      min: [0, 'Quantity cannot be negative'],
      default: 1,
    },
    maxQuantityPerUser: {
      type: Number,
      min: [1, 'Per-user booking limit must be at least 1'],
      default: 2,
    },
    category: {
      type: String,
      enum: ['bakery', 'meals', 'snacks', 'beverages', 'dairy', 'fruits', 'vegetables', 'other'],
      default: 'other',
    },
    cuisine: {
      type: String,
      enum: ['indian', 'arabic', 'bakery', 'continental', 'chinese', 'italian', 'desserts', 'beverages', 'other'],
      default: 'other',
    },
    dietaryType: {
      type: String,
      enum: ['veg', 'non-veg'],
      default: 'veg',
    },
    availabilityType: {
      type: String,
      enum: ['ready_now', 'pre_order'],
      default: 'ready_now',
    },
    readyAt: {
      type: Date,
    },
    pickupStartAt: {
      type: Date,
    },
    pickupEndAt: {
      type: Date,
    },
    averagePickupMinutes: {
      type: Number,
      min: [0, 'Pickup time cannot be negative'],
      default: 15,
    },
    shopLocation: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        default: undefined,
      },
    },
    image: {
      type: String, // URL to the image
    },
    shopOwner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    isAvailable: {
      type: Boolean,
      default: true,
    },
    moderationStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'approved',
    },
    moderationNote: {
      type: String,
      trim: true,
    },
    reportCount: {
      type: Number,
      min: 0,
      default: 0,
    },
    reportReasons: [{
      type: String,
      trim: true,
    }],
    expiresAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

listingSchema.index({ shopLocation: '2dsphere' });
listingSchema.index({ isAvailable: 1, moderationStatus: 1, expiresAt: 1, dietaryType: 1, cuisine: 1, availabilityType: 1 });
listingSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Virtual: discount percentage
listingSchema.virtual('discountPercentage').get(function () {
  if (this.originalPrice === 0) return 0;
  return Math.round(((this.originalPrice - this.discountedPrice) / this.originalPrice) * 100);
});

listingSchema.virtual('minutesToExpire').get(function () {
  if (!this.expiresAt) return null;
  return Math.max(0, Math.ceil((this.expiresAt.getTime() - Date.now()) / 60000));
});

listingSchema.virtual('isClosingSoon').get(function () {
  return this.minutesToExpire !== null && this.minutesToExpire <= 60;
});

listingSchema.virtual('dealBadge').get(function () {
  const minutes = this.minutesToExpire;
  const discount = this.discountPercentage;

  if (minutes === null) return `${discount}% OFF`;
  return `${discount}% OFF - expires in ${minutes} mins`;
});

listingSchema.virtual('googleMapsUrl').get(function () {
  const coordinates = this.shopLocation?.coordinates;
  if (!coordinates || coordinates.length !== 2) return null;
  const [longitude, latitude] = coordinates;
  return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
});

// Ensure virtuals are included in JSON output
listingSchema.set('toJSON', { virtuals: true });
listingSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Listing', listingSchema);
