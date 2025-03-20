import { Connection, PublicKey } from '@solana/web3.js';
import { findReference } from '@solana/pay';
import dbConnect from './lib/mongodb.ts';
import Payment from './models/Payment.ts';
import { QUICKNODE_ENDPOINT, ZAPIER_WEBHOOK_URL } from './config.ts';
import axios from 'axios';

if (!QUICKNODE_ENDPOINT || !ZAPIER_WEBHOOK_URL) {
  console.error('Error: Required environment variables are not defined.');
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

// Function to verify transaction using reference
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

// Function to send data to Zapier webhook
async function sendToZapier(payment: any): Promise<void> {
  try {
    const payload = {
      reference: payment.reference,
      recipient: payment.recipient,
      amount: payment.amount,
      memo: payment.memo,
      splToken: payment.splToken,
      firstName: payment.firstName,
      lastName: payment.lastName,
      email: payment.email,
      ip: payment.ip,
      token: payment.token,
      status: payment.status,
    };

    await axios.post(ZAPIER_WEBHOOK_URL, payload, {
      headers: { 'Content-Type': 'application/json' },
    });

    console.log(`[INFO] Successfully sent data to Zapier for reference: ${payment.reference}`);
  } catch (error) {
    console.error(`[ERROR] Failed to send data to Zapier for reference: ${payment.reference}`, error);
  }
}

// Function to cancel old payments
async function cancelOldPayments() {
  const cutoffTime = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
  try {
    const result = await Payment.updateMany(
      { status: 'pending', createdAt: { $lt: cutoffTime } },
      { $set: { status: 'cancelled' } }
    );
    console.log(`[INFO] Cancelled ${result.modifiedCount} old pending payments.`);
  } catch (error) {
    console.error('[ERROR] Error cancelling old payments:', error);
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

      // Send the verified payment data to Zapier
      await sendToZapier(payment);
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
      await cancelOldPayments(); // Cancel old payments
      await verifyPayments(); // Verify pending payments
    } catch (error) {
      console.error('[ERROR] Error during payment verification loop:', error);
    }
  }, 60000); // Run every 13 seconds
}

startWorker();

