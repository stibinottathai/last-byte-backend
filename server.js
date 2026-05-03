const dotenv = require('dotenv');
const http = require('http');

// Load env vars
dotenv.config();

const app = require('./src/app');
const connectDB = require('./src/config/db');
const seedIfEmpty = require('./src/utils/seeder');
const { startExpiredListingCleanup } = require('./src/utils/expiredListings');
const { startExpiredOrderCleanup } = require('./src/utils/expiredOrders');
const socketModule = require('./src/config/socket');

const PORT = process.env.PORT || 5000;

// Connect to database, seed data, then start server
const startServer = async () => {
  await connectDB();
  await seedIfEmpty();
  startExpiredListingCleanup();
  startExpiredOrderCleanup();

  // Create HTTP server and attach Socket.IO
  const httpServer = http.createServer(app);
  socketModule.init(httpServer);

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`🍔 Last Byte API Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
    console.log(`   http://localhost:${PORT}\n`);
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (err) => {
    console.error(`❌ Unhandled Rejection: ${err.message}`);
    httpServer.close(() => process.exit(1));
  });
};

startServer();
