// lib/mongodb.ts

import mongoose from 'mongoose';
import { MONGODB_URI } from '../config';

// Check if MongoDB URI is defined
if (!MONGODB_URI) {
  throw new Error('Please define the MONGODB_URI environment variable inside .env.local');
}

// Define connection cache interface
interface ConnectionCache {
  conn: mongoose.Connection | null;
  promise: Promise<mongoose.Connection> | null;
}

// Create global connection cache
declare global {
  var mongooseConnection: ConnectionCache;
}

// Initialize connection cache
let cached: ConnectionCache = global.mongooseConnection || { conn: null, promise: null };
if (!global.mongooseConnection) {
  global.mongooseConnection = cached;
}

// Connect to MongoDB and return mongoose connection
async function dbConnect(): Promise<mongoose.Connection> {
  // Return existing connection if available
  if (cached.conn) {
    return cached.conn;
  }

  // Create new connection if no promise exists
  if (!cached.promise) {
    const opts: mongoose.ConnectOptions = {
      bufferCommands: false,
    };

    // Ensure MONGODB_URI is a string
    const uri = MONGODB_URI as string;
    
    // Connect and store promise
    cached.promise = mongoose.connect(uri, opts)
      .then(mongoose => mongoose.connection);
  }

  try {
    // Await connection
    cached.conn = await cached.promise;
  } catch (e) {
    // Reset promise on error
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}

export default dbConnect;
