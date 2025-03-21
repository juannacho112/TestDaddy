import { Connection, PublicKey } from '@solana/web3.js';
import { findReference } from '@solana/pay';
import dbConnect from './lib/mongodb.ts';
import Payment from './models/Payment.ts';
import { QUICKNODE_ENDPOINT } from './config.ts';

if (!QUICKNODE_ENDPOINT) {
  console.error('Error: QUICKNODE_ENDPOINT is not defined in the environment.');
  process.exit(1);
}

// Connect to MongoDB
dbConnect()
  .then(() => console.log('Worker connected to MongoDB'))
  .catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

const connection = new Connection(QUICKNODE_ENDPOINT, 'confirmed');

// Verify transaction using reference
async function verifyTransactionUsingReference(payment: any): Promise<boolean> {
  try {
    if (!payment.reference) {
      console.error(`[ERROR] Missing reference for payment: ${payment._id}`);
      return false;
    }

    const referencePubkey = new PublicKey(payment.reference);
    console.log(`[INFO] Looking for transaction with reference: ${referencePubkey.toBase58()}`);

    // Use findReference to locate the transaction
    const transaction = await findReference(connection, referencePubkey);

    if (transaction) {
      console.log(`[INFO] Transaction found for reference: ${payment.reference}`);
      return true;
    } else {
      console.warn(`[WARNING] No transaction found for reference: ${payment.reference}`);
      return false;
    }
  } catch (error) {
    if (error.name === 'FindReferenceError') {
      console.warn(`[WARNING] Reference not found for payment: ${payment.reference}, will retry later.`);
      return false;
    }

    console.error(`[ERROR] Unexpected error while checking transaction for reference: ${payment.reference}`, error);
    return false;
  }
}

// Verify all pending payments
async function verifyPayments() {
  console.log('[INFO] Fetching pending payments for verification...');
  const pendingPayments = await Payment.find({ status: 'pending' });

  if (pendingPayments.length === 0) {
    console.log('[INFO] No pending payments found.');
    return;
  }

  for (const payment of pendingPayments) {
    const isValid = await verifyTransactionUsingReference(payment);

    if (isValid) {
      payment.status = 'verified';
      await payment.save();
      console.log(`[INFO] Payment verified for reference: ${payment.reference}`);
    } else {
      console.log(`[INFO] Payment not yet verified for reference: ${payment.reference}`);
    }
  }
}

// Start the worker loop
function startWorker() {
  console.log('[INFO] Payment verification worker started.');
  setInterval(async () => {
    try {
      await verifyPayments();
    } catch (error) {
      console.error('[ERROR] Error during payment verification loop:', error);
    }
  }, 10000); // Run every 60 seconds
}

startWorker();
