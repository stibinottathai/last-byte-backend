const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    // Try connecting to the configured MongoDB URI first
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 3000,
    });
    console.log(`✅ MongoDB Connected: ${mongoose.connection.host}`);
  } catch (err) {
    console.log('⚠️  Local MongoDB not found. Starting in-memory MongoDB...');
    try {
      const { MongoMemoryServer } = require('mongodb-memory-server');
      const mongod = await MongoMemoryServer.create();
      const uri = mongod.getUri();
      await mongoose.connect(uri);
      console.log(`✅ In-Memory MongoDB Connected (dev mode)`);
      console.log(`   Data will be lost on server restart.\n`);
    } catch (memErr) {
      console.error(`❌ MongoDB Connection Error: ${memErr.message}`);
      process.exit(1);
    }
  }
};

module.exports = connectDB;

