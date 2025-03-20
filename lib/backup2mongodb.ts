// lib/mongodb.ts

import mongoose from 'mongoose';
import { MONGODB_URI } from '../config.ts';
// Remove dotenv as it's already configured in worker.ts
// import dotenv from 'dotenv';
// dotenv.config();

//const MONGODB_URI = process.env.MONGODB_URI!;
//const MONGODB_URI="mongodb://soap:Diddlemenasty123$@localhost:27017/solana_pay?authSource=solana_pay";
//const MONGODB_URI="mongodb:";

if (!MONGODB_URI) {
  throw new Error(
    'Please define the MONGODB_URI environment variable inside .env.local'
  );
}

/**
 * Global is used here to maintain a cached connection across hot reloads
 * in development. This prevents connections growing exponentially
 * during API Route usage.
 */
declare global {
  var mongoose: {
    conn: typeof mongoose | null;
    promise: Promise<typeof mongoose> | null;
  };
}

var cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

async function dbConnect() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
    };

    cached.promise = mongoose.connect(MONGODB_URI, opts).then((mongoose) => {
      return mongoose;
    });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}

export default dbConnect;
