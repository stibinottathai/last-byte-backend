const Listing = require('../models/Listing');

const DEFAULT_CLEANUP_INTERVAL_MS = 10000;

const cleanupExpiredListings = async () => {
  const result = await Listing.deleteMany({
    expiresAt: { $exists: true, $lte: new Date() },
  });

  if (result.deletedCount > 0) {
    console.log(`🧹 Deleted ${result.deletedCount} expired listing(s)`);
  }

  return result.deletedCount;
};

const startExpiredListingCleanup = () => {
  const intervalMs = Number(process.env.LISTING_EXPIRY_CLEANUP_INTERVAL_MS) || DEFAULT_CLEANUP_INTERVAL_MS;

  cleanupExpiredListings().catch((err) => {
    console.error(`❌ Expired listing cleanup failed: ${err.message}`);
  });

  const timer = setInterval(() => {
    cleanupExpiredListings().catch((err) => {
      console.error(`❌ Expired listing cleanup failed: ${err.message}`);
    });
  }, intervalMs);

  if (timer.unref) timer.unref();
  return timer;
};

module.exports = {
  cleanupExpiredListings,
  startExpiredListingCleanup,
};
