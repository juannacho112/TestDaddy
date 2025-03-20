// worker/worker.ts

import { paymentRequests, PaymentData } from '../app/api/pay/route'; // Adjust the path as necessary
import { Connection, PublicKey } from '@solana/web3.js';
import { validateTransfer, findReference } from '@solana/pay';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const RPC_ENDPOINT = process.env.QUICKNODE_ENDPOINT!;
const HIGHLEVEL_WEBHOOK_URL = 'https://services.leadconnectorhq.com/hooks/8RBOdgfyRq9tRvR8pUoM/webhook-trigger/a74100ea-3dfc-4fa9-9a11-208481a0f2d7';

const connection = new Connection(RPC_ENDPOINT, 'confirmed');

async function verifyPayments() {
  for (const [reference, paymentData] of paymentRequests.entries()) {
    try {
      console.log(`[DEBUG] Verifying payment for reference: ${reference}`);
      const referencePubkey = new PublicKey(reference);
      const found = await findReference(connection, referencePubkey);

      if (!found) {
        console.log(`[INFO] No transaction found for reference: ${reference}`);
        continue;
      }

      const isValid = await validateTransfer(
        connection,
        found.signature,
        {
          recipient: paymentData.recipient,
          amount: paymentData.amount,
          reference: referencePubkey,
          splToken: paymentData.splToken,
        },
        { commitment: 'confirmed' }
      );

      if (isValid) {
        console.log(`[INFO] Payment verified for reference: ${reference}`);

        // Prepare payload for HighLevel webhook
        const payload = {
          reference: reference,
          amount: paymentData.amount.toString(),
          currency: paymentData.splToken ? 'DADDY' : 'SOL',
          memo: paymentData.memo,
          firstName: paymentData.firstName,
          lastName: paymentData.lastName,
          email: paymentData.email,
          ip: paymentData.ip,
        };

        // Send data to HighLevel's webhook
        try {
          await axios.post(HIGHLEVEL_WEBHOOK_URL, payload, {
            headers: {
              'Content-Type': 'application/json',
            },
          });
          console.log(`[INFO] Payment data sent to HighLevel webhook for reference: ${reference}`);
        } catch (webhookError) {
          console.error(`[ERROR] Failed to send data to HighLevel webhook for reference: ${reference}`, webhookError);
        }

        // Remove the payment request from the in-memory store
        paymentRequests.delete(reference);
      } else {
        console.log(`[INFO] Payment not yet confirmed for reference: ${reference}`);
      }
    } catch (error) {
      console.error(`[ERROR] Error verifying payment for reference: ${reference}`, error);
    }
  }
}

// Schedule the task to run every 30 seconds
setInterval(verifyPayments, 10000);

console.log('Payment verification worker started and polling every 10 seconds.');
