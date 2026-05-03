const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please provide a name'],
      trim: true,
      maxlength: [50, 'Name cannot exceed 50 characters'],
    },
    email: {
      type: String,
      required: [true, 'Please provide an email'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        'Please provide a valid email',
      ],
    },
    password: {
      type: String,
      required: [true, 'Please provide a password'],
      minlength: [6, 'Password must be at least 6 characters'],
      select: false, // Don't return password by default in queries
    },
    phone: {
      type: String,
      trim: true,
    },
    role: {
      type: String,
      enum: ['user', 'shopOwner', 'admin'],
      default: 'user',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    banReason: {
      type: String,
      trim: true,
    },

    // Shop owner specific fields
    shopName: {
      type: String,
      trim: true,
    },
    shopAddress: {
      type: String,
      trim: true,
    },
    shopDescription: {
      type: String,
      trim: true,
    },
    shopApprovalStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: function () {
        return this.role === 'shopOwner' ? 'pending' : undefined;
      },
    },
    shopRejectionReason: {
      type: String,
      trim: true,
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
    averagePickupMinutes: {
      type: Number,
      min: [0, 'Pickup time cannot be negative'],
      default: 15,
    },

    // Refresh token for JWT rotation
    refreshToken: {
      type: String,
      select: false,
    },
  },
  {
    timestamps: true,
  }
);

userSchema.index({ shopLocation: '2dsphere' });

// --------------- Pre-save: Hash password ---------------
userSchema.pre('save', async function (next) {
  // Only hash if password was modified
  if (!this.isModified('password')) {
    return next();
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// --------------- Instance method: Compare password ---------------
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
