const { disqualifyExpiredReadyOrders } = require('./orderLifecycle');

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

const runExpiredOrderCleanup = async () => {
  try {
    await disqualifyExpiredReadyOrders();
  } catch (error) {
    console.error(`Order cleanup failed: ${error.message}`);
  }
};

const startExpiredOrderCleanup = () => {
  runExpiredOrderCleanup();
  return setInterval(runExpiredOrderCleanup, CLEANUP_INTERVAL_MS);
};

module.exports = { startExpiredOrderCleanup };
