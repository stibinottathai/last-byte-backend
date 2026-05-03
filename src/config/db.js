const mongoose = require('mongoose');

const connectDB = async () => {
  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/lastbyte';

  try {
    await mongoose.connect(mongoUri);
    console.log(`MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}`);
  } catch (err) {
    if (process.env.USE_MEMORY_DB === 'true') {
      try {
        const { MongoMemoryServer } = require('mongodb-memory-server');
        const mongod = await MongoMemoryServer.create();
        const uri = mongod.getUri();
        await mongoose.connect(uri);
        console.log('In-memory MongoDB connected. Data will be lost on restart.');
        return;
      } catch (memErr) {
        console.error(`In-memory MongoDB connection error: ${memErr.message}`);
      }
    }

    console.error(`MongoDB connection error: ${err.message}`);
    console.error(`Checked URI: ${mongoUri}`);
    console.error('Make sure the MongoDB service is running, then restart the server.');
    process.exit(1);
  }
};

module.exports = connectDB;
