import { Connection, PublicKey } from '@solana/web3.js';
import { findReference } from '@solana/pay';
import dbConnect from './lib/mongodb.js';
import Payment from './models/Payment.js';
import PaymentExpanded from './models/PaymentExpanded.js';
import { QUICKNODE_ENDPOINT, ZAPIER_WEBHOOK_URL } from './config.js';
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
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'FindReferenceError') {
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
    // Make sure webhook URL is defined
    if (!ZAPIER_WEBHOOK_URL) {
      throw new Error('ZAPIER_WEBHOOK_URL environment variable is not defined');
    }
    
    // Basic payment details that both models share
    const basePayload = {
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

    // Add additional expanded fields if they exist
    const expandedPayload = {
      ...basePayload,
      // Only include these fields if they exist in the payment object
      ...(payment.phoneNumber && { phoneNumber: payment.phoneNumber }),
      ...(payment.addressLine1 && { addressLine1: payment.addressLine1 }),
      ...(payment.addressLine2 && { addressLine2: payment.addressLine2 }),
      ...(payment.city && { city: payment.city }),
      ...(payment.state && { state: payment.state }),
      ...(payment.zipCode && { zipCode: payment.zipCode }),
      ...(payment.country && { country: payment.country }),
      ...(payment.shippingMethod && { shippingMethod: payment.shippingMethod }),
      ...(payment.shippingCost !== undefined && { shippingCost: payment.shippingCost }),
      ...(payment.cartTotal !== undefined && { cartTotal: payment.cartTotal }),
    };

    await axios.post(ZAPIER_WEBHOOK_URL, expandedPayload, {
      headers: { 'Content-Type': 'application/json' },
    });

    console.log(`[INFO] Successfully sent data to Zapier for reference: ${payment.reference}`);
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[ERROR] Failed to send data to Zapier for reference: ${payment.reference}`, errorMsg);
  }
}

// Function to cancel old payments
async function cancelOldPayments() {
  const cutoffTime = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
  try {
    // Cancel old standard payments
    const standardResult = await Payment.updateMany(
      { status: 'pending', createdAt: { $lt: cutoffTime } },
      { $set: { status: 'cancelled' } }
    );
    
    // Cancel old expanded payments
    const expandedResult = await PaymentExpanded.updateMany(
      { status: 'pending', createdAt: { $lt: cutoffTime } },
      { $set: { status: 'cancelled' } }
    );
    
    const totalCancelled = standardResult.modifiedCount + expandedResult.modifiedCount;
    console.log(`[INFO] Cancelled ${totalCancelled} old pending payments (${standardResult.modifiedCount} standard, ${expandedResult.modifiedCount} expanded).`);
  } catch (error) {
    console.error('[ERROR] Error cancelling old payments:', error);
  }
}

// Verify all pending payments
async function verifyPayments() {
  console.log('[INFO] Fetching pending payments for verification...');
  
  // Get pending payments from both models
  const pendingStandardPayments = await Payment.find({ status: 'pending' });
  const pendingExpandedPayments = await PaymentExpanded.find({ status: 'pending' });
  
  const allPendingPayments = [...pendingStandardPayments, ...pendingExpandedPayments];

  if (allPendingPayments.length === 0) {
    console.log('[INFO] No pending payments found.');
    return;
  }

  console.log(`[INFO] Found ${pendingStandardPayments.length} standard payments and ${pendingExpandedPayments.length} expanded payments pending verification.`);

  for (const payment of allPendingPayments) {
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
  console.log('[INFO] Payment verification worker started (handling both standard and expanded payments).');
  setInterval(async () => {
    try {
      await cancelOldPayments(); // Cancel old payments
      await verifyPayments(); // Verify pending payments
    } catch (error) {
      console.error('[ERROR] Error during payment verification loop:', error);
    }
  }, 60000); // Run every minute
}

startWorker();
