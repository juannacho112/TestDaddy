// config.ts

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Resolve __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirnameLocal = dirname(__filename);

// Load environment variables from .env.local
dotenv.config({ path: join(__dirnameLocal, '.env.local') });

// Export environment variables
export const MONGODB_URI = process.env.MONGODB_URI;
export const QUICKNODE_ENDPOINT = process.env.QUICKNODE_ENDPOINT;
export const MY_DESTINATION_WALLET = process.env.MY_DESTINATION_WALLET;
export const COINGECKO_DEMO_API_KEY = process.env.COINGECKO_DEMO_API_KEY;
export const ZAPIER_WEBHOOK_URL = process.env.ZAPIER_WEBHOOK_URL;

// Optional: Validate required environment variables
if (!MONGODB_URI) {
  throw new Error('Please define the MONGODB_URI environment variable inside .env.local');
}
if (!QUICKNODE_ENDPOINT) {
  throw new Error('Please define the QUICKNODE_ENDPOINT environment variable inside .env.local');
}
if (!MY_DESTINATION_WALLET) {
  throw new Error('Please define the MY_DESTINATION_WALLET environment variable inside .env.local');
}
if (!ZAPIER_WEBHOOK_URL) {
  throw new Error('Please define the ZAPIER_WEBHOOK_URL environment variable inside .env.local');
}
