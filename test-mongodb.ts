// test-mongodb.ts

import dbConnect from './lib/mongodb.js';

async function testConnection() {
  try {
    await dbConnect();
    console.log('MongoDB connection successful!');
    process.exit(0);
  } catch (error) {
    console.error('MongoDB connection failed:', error);
    process.exit(1);
  }
}

testConnection();
