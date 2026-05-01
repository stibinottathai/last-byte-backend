const dotenv = require('dotenv');

// Load env vars
dotenv.config();

const app = require('./src/app');
const connectDB = require('./src/config/db');
const seedIfEmpty = require('./src/utils/seeder');

const PORT = process.env.PORT || 5000;

// Connect to database, seed data, then start server
const startServer = async () => {
  await connectDB();
  await seedIfEmpty();

  const server = app.listen(PORT, () => {
    console.log(`🍔 Last Byte API Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
    console.log(`   http://localhost:${PORT}\n`);
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (err) => {
    console.error(`❌ Unhandled Rejection: ${err.message}`);
    server.close(() => process.exit(1));
  });
};

startServer();
