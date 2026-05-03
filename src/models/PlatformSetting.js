const mongoose = require('mongoose');

const platformSettingSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      unique: true,
      required: true,
      default: 'default',
    },
    platformFeePercent: {
      type: Number,
      min: [0, 'Platform fee cannot be negative'],
      max: [100, 'Platform fee cannot exceed 100%'],
      default: 10,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('PlatformSetting', platformSettingSchema);
