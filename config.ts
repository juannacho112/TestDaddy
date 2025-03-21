// config.ts

// When running in Node.js ESM environment, dotenv doesn't auto-load .env.local
// so we need to explicitly load it
import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env.local') });

// Export environment variables
export const MONGODB_URI = process.env.MONGODB_URI;
export const QUICKNODE_ENDPOINT = process.env.QUICKNODE_ENDPOINT;
export const MY_DESTINATION_WALLET = process.env.MY_DESTINATION_WALLET;
export const COINGECKO_DEMO_API_KEY = process.env.COINGECKO_DEMO_API_KEY;
export const ZAPIER_WEBHOOK_URL = process.env.ZAPIER_WEBHOOK_URL;

// Optional: Log warnings for missing environment variables
// but don't throw errors as that can break the build process
const warnMissingEnv = (name: string) => {
  if (typeof process.env[name] === 'undefined') {
    console.warn(`Warning: ${name} environment variable is not defined in .env.local`);
    return false;
  }
  return true;
};

// Check required environment variables
warnMissingEnv('MONGODB_URI');
warnMissingEnv('QUICKNODE_ENDPOINT');
warnMissingEnv('MY_DESTINATION_WALLET');
warnMissingEnv('ZAPIER_WEBHOOK_URL');
