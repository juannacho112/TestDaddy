// worker.ts

import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { Connection, PublicKey } from '@solana/web3.js';
import { validateTransfer, findReference } from '@solana/pay';
import axios from 'axios';
import BigNumber from 'bignumber.js';
import pLimit from 'p-limit';

// Import centralized configuration and utilities
import dbConnect from './lib/mongodb.ts';
import Payment, { IPayment } from './models/Payment.ts';
import { QUICKNODE_ENDPOINT, ZAPIER_WEBHOOK_URL } from './config.ts';
import { cache } from './lib/cache.ts'; // Ensure cache.ts is a TypeScript file

// Resolve __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirnameLocal = dirname(__filename);

// Log startup details
console.log('Starting Payment Verification Worker');
console.log('Using QuickNode RPC Endpoint:', QUICKNODE_ENDPOINT);

// Check essential environment variables
if (!QUICKNODE_ENDPOINT) {
  console.error('Error: QUICKNODE_ENDPOINT is not defined in .env.local');
  process.exit(1);
}
if (!ZAPIER_WEBHOOK_URL) {
  console.error('Error: ZAPIER_WEBHOOK_URL is not defined in .env.local');
  process.exit(1);
}

// Connect to MongoDB
dbConnect()
  .then(() => {
    console.log('Worker successfully connected to MongoDB');
  })
  .catch((err) => {
    console.error('Worker MongoDB connection error:', err);
    process.exit(1); // Exit if connection fails
  });

// Initialize Solana RPC connection
const connection = new Connection(QUICKNODE_ENDPOINT, 'confirmed');

// Limit concurrent verifications to 5 to prevent overwhelming the RPC endpoint
const limit = pLimit(5);

/**
 * Verifies a single transaction.
 * @param {PublicKey} referencePubkey - The public key reference of the transaction.
 * @returns {Promise<boolean>} - Whether the verification was successful.
 */
async function verifyTransaction(referencePubkey: PublicKey): Promise<boolean> {
  const referenceStr = referencePubkey.toBase58().trim();
  console.log(`[DEBUG] Looking up payment data for reference: ${referenceStr}`);

  // Fetch payment data from MongoDB
  const paymentData = await Payment.findOne({ reference: referenceStr });

  if (!paymentData) {
    console.error(`[ERROR] Payment request not found for reference: ${referenceStr}`);
    return false;
  }

  const { recipient, amount, memo, splToken } = paymentData;
  console.log(`[DEBUG] Found payment data: Recipient=${recipient}, Amount=${amount}, SPL Token=${splToken || 'None'}, Memo=${memo}`);

  try {
    // Find the transaction on the Solana blockchain using the reference
    console.log(`[DEBUG] Searching for transaction on blockchain for reference: ${referenceStr}`);
    const found = await findReference(connection, referencePubkey);

    if (!found) {
      console.log(`[INFO] No transaction found on blockchain for reference: ${referenceStr}`);
      return false;
    }

    console.log(`[DEBUG] Found transaction with signature: ${found.signature}`);

    // Validate the transfer
    console.log(`[DEBUG] Validating transfer for reference: ${referenceStr}`);
    const resp = await validateTransfer(
      connection,
      found.signature,
      {
        recipient: new PublicKey(recipient),
        amount: new BigNumber(amount),
        reference: referencePubkey,
        splToken: splToken ? new PublicKey(splToken) : undefined,
      },
      { commitment: 'confirmed' }
    );

    if (resp) {
      console.log(`[INFO] Payment verified for reference: ${referenceStr}`);

      // Prepare payload for Zapier webhook
      const payload = {
        reference: paymentData.reference,
        amount: paymentData.amount,
        currency: splToken ? 'DADDY-TATE' : 'SOL',
        memo: paymentData.memo,
        firstName: paymentData.firstName,
        lastName: paymentData.lastName,
        email: paymentData.email,
        ip: paymentData.ip,
      };

      // Send data to Zapier's webhook
      try {
        await axios.post(ZAPIER_WEBHOOK_URL, payload, {
          headers: {
            'Content-Type': 'application/json',
          },
        });
        console.log(`[INFO] Payment data sent to Zapier webhook for reference: ${referenceStr}`);
      } catch (webhookError: any) {
        console.error(`[ERROR] Failed to send data to Zapier webhook for reference: ${referenceStr}`, webhookError.response?.data || webhookError.message);
        // Optionally, decide whether to revert the payment status or handle the failure
        return false;
      }

      // Update payment status to 'verified' in MongoDB
      paymentData.status = 'verified';
      await paymentData.save();
      console.log(`[DEBUG] Updated payment status to 'verified' for reference: ${referenceStr}`);
      return true;
    } else {
      console.log(`[INFO] Payment not yet confirmed for reference: ${referenceStr}`);
      return false;
    }
  } catch (error: any) {
    console.error(`[ERROR] Error during verification for reference: ${referenceStr}`, error.message || error);
    return false;
  }
}

/**
 * Marks payments older than 180 minutes as 'cancelled'.
 * @returns {Promise<void>}
 */
async function markOldPaymentsAsCancelled(): Promise<void> {
  try {
    const cutoffTime = new Date(Date.now() - 60 * 60 * 1000); // 60 minutes ago
    console.log(`[DEBUG] Marking payments as 'cancelled' that are pending and older than ${cutoffTime.toISOString()}`);

    const result = await Payment.updateMany(
      { status: 'pending', createdAt: { $lt: cutoffTime } },
      { $set: { status: 'cancelled' } }
    );

    console.log(`[INFO] Marked ${result.nModified} payments as 'cancelled'`);
  } catch (error: any) {
    console.error('[ERROR] Error marking old payments as cancelled:', error.message || error);
  }
}

/**
 * Verifies all pending payments within the last 180 minutes.
 * @returns {Promise<void>}
 */
async function verifyPayments(): Promise<void> {
  try {
    // Calculate the cutoff time (current time minus 180 minutes)
    const cutoffTime = new Date(Date.now() - 180 * 60 * 1000); // 180 minutes in milliseconds

    console.log('[DEBUG] Fetching all pending payments from MongoDB created after:', cutoffTime.toISOString());

    // Fetch all pending payments created within the last 180 minutes
    const pendingPayments: IPayment[] = await Payment.find({
      status: 'pending',
      createdAt: { $gte: cutoffTime },
    });

    console.log(`[DEBUG] Found ${pendingPayments.length} pending payments to verify`);

    if (pendingPayments.length === 0) {
      console.log('[INFO] No pending payments found within the last 180 minutes');
      return;
    }

    const verificationPromises = pendingPayments.map((paymentData) =>
      limit(() => verifyTransaction(new PublicKey(paymentData.reference)))
    );

    const results = await Promise.all(verificationPromises);

    console.log(`[DEBUG] Verification completed. Success: ${results.filter(r => r).length}, Failed: ${results.filter(r => !r).length}`);

    // Mark old payments as cancelled
    await markOldPaymentsAsCancelled();
  } catch (error: any) {
    console.error('[ERROR] Error fetching pending payments:', error.message || error);
  }
}

// Schedule the verification to run every 60 seconds
setInterval(verifyPayments, 60000);

// Initial run
verifyPayments();

// Log that the worker has started
console.log('Payment verification worker started and polling every 60 seconds.');
