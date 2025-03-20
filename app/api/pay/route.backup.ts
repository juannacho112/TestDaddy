// app/api/pay/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { encodeURL, findReference, validateTransfer } from '@solana/pay';
import BigNumber from 'bignumber.js';
import axios from 'axios';

// ------------------- ENV VARS -------------------
const MY_WALLET = process.env.MY_DESTINATION_WALLET!;
const RPC_ENDPOINT = process.env.QUICKNODE_ENDPOINT!;
const CG_API_KEY = process.env.COINGECKO_DEMO_API_KEY!;
const ZAPIER_WEBHOOK_URL = process.env.ZAPIER_WEBHOOK_URL!; // Add this to your .env.local

if (!CG_API_KEY) {
  console.warn("Warning: COINGECKO_DEMO_API_KEY not set in env!");
}
if (!ZAPIER_WEBHOOK_URL) {
  console.warn("Warning: ZAPIER_WEBHOOK_URL not set in env!");
}

// ------------------- SPL TOKEN MINT -------------------
const DADDY_MINT = new PublicKey('4Cnk9EPnW5ixfLZatCPJjDB1PUtcRpVVgTQukm9epump');

// ------------------- IN-MEMORY STORE -------------------
export type PaymentData = {
  recipient: PublicKey;
  amount: BigNumber;
  memo: string;
  splToken?: PublicKey;
  firstName: string;
  lastName: string;
  email: string;
  ip: string;
};

export const paymentRequests = new Map<string, PaymentData>();

// ------------------- FETCH SOL PRICE -------------------
async function getSolPriceUsd(): Promise<number> {
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
    if (!res.ok) {
      throw new Error(`Failed to fetch SOL price, HTTP ${res.status}`);
    }
    const data = await res.json();
    if (!data.solana || data.solana.usd == null) {
      throw new Error('SOL price not found in response');
    }
    return data.solana.usd;
  } catch (error) {
    console.error('Error fetching SOL price:', error);
    throw new Error('Could not fetch SOL price');
  }
}

// ------------------- FETCH DADDY PRICE -------------------
async function getDaddyPriceUsd(): Promise<number> {
  const tokenId = 'daddy-tate';
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${tokenId}&vs_currencies=usd&x_cg_demo_api_key=${CG_API_KEY}`;
  console.log('[DEBUG] Fetching DADDY price from:', url);

  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to fetch DADDY price. HTTP ${res.status}`);
    }
    const data = await res.json();
    if (!data[tokenId] || data[tokenId].usd == null) {
      throw new Error(`DADDY price not found in CoinGecko response for ${tokenId}`);
    }
    return data[tokenId].usd;
  } catch (error) {
    console.error('Error fetching DADDY price:', error);
    throw new Error('Could not fetch DADDY price');
  }
}

// ------------------- VERIFY ON-CHAIN -------------------
async function verifyTransaction(referencePubkey: PublicKey) {
  const pd = paymentRequests.get(referencePubkey.toBase58());
  if (!pd) throw new Error('Payment request not found');

  const { recipient, amount, memo, splToken } = pd;
  const conn = new Connection(RPC_ENDPOINT, 'confirmed');
  const found = await findReference(conn, referencePubkey);

  const resp = await validateTransfer(
    conn,
    found.signature,
    {
      recipient,
      amount,
      reference: referencePubkey,
      splToken,
    },
    { commitment: 'confirmed' }
  );

  if (resp) {
    paymentRequests.delete(referencePubkey.toBase58());
  }
  return resp;
}

// ------------------- CORS: OPTIONS -------------------
export async function OPTIONS() {
  return NextResponse.json({}, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': 'https://app.gohighlevel.com', // Use your domain in production
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

// ------------------- POST: Generate Payment -------------------
export async function POST(request: NextRequest) {
  try {
    const { price, token, firstName, lastName, email } = await request.json(); // collect extra data
    if (!price || !firstName || !lastName || !email) {
      return NextResponse.json({ error: 'Missing required fields.' }, { status: 400, headers: { 'Access-Control-Allow-Origin': 'https://app.gohighlevel.com' } });
    }

    // Get client IP address
    let ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    // x-forwarded-for might contain multiple IPs separated by commas
    if (ip && ip.includes(',')) {
      ip = ip.split(',')[0].trim();
    }

    let amountNeeded: BigNumber;
    let splToken: PublicKey | undefined;
    let message: string;

    if (token === 'daddy') {
      // Fetch DADDY price and convert USD to DADDY tokens
      const daddyPriceUsd = await getDaddyPriceUsd();
      console.log(`[DEBUG] DADDY price USD: ${daddyPriceUsd}`);
      amountNeeded = new BigNumber(price).div(daddyPriceUsd).decimalPlaces(6, BigNumber.ROUND_DOWN); // Assuming DADDY has 6 decimals
      splToken = DADDY_MINT;
      message = `Order for $${price} => ~${amountNeeded.toFixed(2)} DADDY tokens`;
    } else {
      // Fetch SOL price and convert USD to SOL
      const solPriceUsd = await getSolPriceUsd();
      console.log(`[DEBUG] SOL price USD: ${solPriceUsd}`);
      amountNeeded = new BigNumber(price).div(solPriceUsd).decimalPlaces(9, BigNumber.ROUND_DOWN); // SOL has 9 decimals
      splToken = undefined;
      message = `Order for $${price} (~${amountNeeded.toFixed(4)} SOL)`;
    }

    // Generate a unique reference
    const ref = Keypair.generate().publicKey;
    const recipient = new PublicKey(MY_WALLET);

    // Encode the Solana Pay URL
    const url = encodeURL({
      recipient,
      amount: amountNeeded,
      reference: ref,
      ...(splToken ? { splToken } : {}),
      label: 'My Store Payment',
      message,
      memo: 'Payment from MyStore.com',
    });

    // Log the generated URL and splToken status
    console.log(`[DEBUG] Generated URL: ${url.toString()}`);
    console.log(`[DEBUG] splToken: ${splToken ? splToken.toBase58() : 'None'}`);
    console.log(`[DEBUG] User Data: ${firstName} ${lastName}, Email: ${email}, IP: ${ip}`);

    // Store in memory for verification
    paymentRequests.set(ref.toBase58(), {
      recipient,
      amount: amountNeeded,
      memo: 'Payment from MyStore.com',
      splToken,
      firstName,
      lastName,
      email,
      ip,
    });

    // Respond with the Solana Pay URL and reference
    return NextResponse.json(
      { url: url.toString(), reference: ref.toBase58(), tokenUsed: token === 'daddy' ? 'DADDY' : 'SOL' },
      {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': 'https://app.gohighlevel.com',
        }
      }
    );

  } catch (error) {
    console.error('Error generating Solana Pay URL:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, {
      status: 500,
      headers: {
        'Access-Control-Allow-Origin': 'https://app.gohighlevel.com',
      },
    });
  }
}

// ------------------- GET: Verify Payment -------------------
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const reference = searchParams.get('reference');
    if (!reference) {
      return NextResponse.json({ error: 'Missing reference' }, {
        status: 400,
        headers: {
          'Access-Control-Allow-Origin': 'https://app.gohighlevel.com',
        },
      });
    }

    const refPubkey = new PublicKey(reference);
    const result = await verifyTransaction(refPubkey);

    if (result) {
      // Retrieve payment data
      const paymentData = paymentRequests.get(reference);
      if (paymentData) {
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
          // Add any other relevant data here, such as customer info
        };

        // Send data to HighLevel's webhook
        try {
          await axios.post(ZAPIER_WEBHOOK_URL, payload, {
            headers: {
              'Content-Type': 'application/json',
            },
          });
          console.log("[DEBUG] Payment data sent to HighLevel webhook successfully.");
        } catch (error) {
          console.error("[ERROR] Failed to send payment data to HighLevel webhook:", error.response?.data || error.message);
          // Optionally handle the error, e.g., retry or alert
        }

        // Optionally, remove the payment request from the in-memory store
        // paymentRequests.delete(reference);
      }

      return NextResponse.json({ status: 'verified' }, {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': 'https://app.gohighlevel.com',
        },
      });
    } else {
      return NextResponse.json({ status: 'not found' }, {
        status: 404,
        headers: {
          'Access-Control-Allow-Origin': 'https://app.gohighlevel.com',
        },
      });
    }
  } catch (err: any) {
    console.error('Error verifying tx:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, {
      status: 500,
      headers: {
        'Access-Control-Allow-Origin': 'https://app.gohighlevel.com',
      },
    });
  }
}
