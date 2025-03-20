import { Connection, PublicKey } from '@solana/web3.js';
import { validateTransfer, findReference } from '@solana/pay';
import dbConnect from './lib/mongodb.ts';
import Payment from './models/Payment.ts';
import { QUICKNODE_ENDPOINT } from './config.ts';
import BigNumber from 'bignumber.js';

// Check that environment variables are set
if (!QUICKNODE_ENDPOINT) {
  console.error('Error: QUICKNODE_ENDPOINT is not defined in the environment.');
  process.exit(1);
}

// Connect to MongoDB
dbConnect()
  .then(() => console.log('Worker successfully connected to MongoDB'))
  .catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

// Create Solana connection
const connection = new Connection(QUICKNODE_ENDPOINT, 'confirmed');

// Verify a single transaction
async function verifyTransaction(referencePubkey: PublicKey): Promise<boolean> {
  const referenceStr = referencePubkey.toBase58();
  console.log(`[INFO] Verifying transaction for reference: ${referenceStr}`);

  const paymentData = await Payment.findOne({ reference: referenceStr });
  if (!paymentData) {
    console.error(`[ERROR] Payment record not found for reference: ${referenceStr}`);
    return false;
  }

  try {
    const transaction = await findReference(connection, referencePubkey);
    console.log(`[INFO] Found transaction for reference: ${referenceStr}`);

    const isValid = await validateTransfer(
      connection,
      transaction.signature,
      {
        recipient: new PublicKey(paymentData.recipient),
        amount: new BigNumber(paymentData.amount),
        reference: referencePubkey,
        splToken: paymentData.splToken ? new PublicKey(paymentData.splToken) : undefined,
      }
    );

    if (isValid) {
      paymentData.status = 'verified';
      await paymentData.save();
      console.log(`[INFO] Payment verified for reference: ${referenceStr}`);
      return true;
    } else {
      console.error(`[ERROR] Validation failed for reference: ${referenceStr}`);
      return false;
    }
  } catch (error) {
    console.error(`[ERROR] Error verifying transaction for reference: ${referenceStr}`, error);
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
    const reference = new PublicKey(payment.reference);
    await verifyTransaction(reference);
  }
}

// Start a polling loop to verify payments every minute
function startWorker() {
  console.log('[INFO] Payment verification worker started.');

  setInterval(async () => {
    try {
      await verifyPayments();
    } catch (error) {
      console.error('[ERROR] Error during payment verification loop:', error);
    }
  }, 60000); // 60 seconds
}

// Initialize the worker
startWorker();
