import { NextRequest, NextResponse } from 'next/server';
import { Keypair, PublicKey } from '@solana/web3.js';
import { encodeURL } from '@solana/pay';
import BigNumber from 'bignumber.js';
import axios from 'axios';
import dbConnect from '../../../lib/mongodb.ts';
import Payment from '../../../models/Payment.ts';
import {
  MONGODB_URI,
  QUICKNODE_ENDPOINT,
  MY_DESTINATION_WALLET,
  COINGECKO_DEMO_API_KEY,
  ZAPIER_WEBHOOK_URL,
} from '../../../config.ts';
import { cache } from '../../../lib/cache.ts';

// Define CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://app.gohighlevel.com',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

/**
 * Handle preflight (OPTIONS) requests for CORS
 */
export async function OPTIONS(request: NextRequest) {
  return NextResponse.json(
    {},
    {
      status: 200,
      headers: corsHeaders,
    }
  );
}

/**
 * Helper function to fetch token prices in USD.
 */
async function getTokenPriceUsd(token: string): Promise<number> {
  const cachedPrice = cache.get<number>(`price_${token}`);
  if (cachedPrice) return cachedPrice;

  try {
    const response = await axios.get(
      `https://api.coingecko.com/api/v3/simple/price?ids=${token}&vs_currencies=usd`,
      {
        headers: { Authorization: `Bearer ${COINGECKO_DEMO_API_KEY}` },
      }
    );
    const price = response.data[token]?.usd;
    cache.set(`price_${token}`, price, 60 * 1000);
    return price;
  } catch (error) {
    console.error(`Error fetching price for ${token}:`, error);
    throw new Error(`Failed to fetch price for ${token}`);
  }
}

/**
 * POST: Generate Payment
 */
export async function POST(request: NextRequest) {
  const response = NextResponse.next();
  Object.entries(corsHeaders).forEach(([key, value]) => response.headers.set(key, value));

  await dbConnect();

  try {
    const { price, token, firstName, lastName, email, memo } = await request.json();

    if (!price || !firstName || !lastName || !email) {
      return NextResponse.json(
        { error: 'Missing required fields.' },
        { status: 400, headers: corsHeaders }
      );
    }

    let ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '';
    if (ip.includes(',')) ip = ip.split(',')[0].trim();
    if (!ip) ip = 'unknown';

    let amountNeeded: BigNumber;
    let splToken: PublicKey | undefined;
    let message: string;

    if (token === 'daddy') {
      const daddyPriceUsd = await getTokenPriceUsd('daddy-tate');
      amountNeeded = new BigNumber(price)
        .div(daddyPriceUsd)
        .decimalPlaces(6, BigNumber.ROUND_DOWN);
      splToken = new PublicKey('4Cnk9EPnW5ixfLZatCPJjDB1PUtcRpVVgTQukm9epump');
      message = `Order for $${price} => ~${amountNeeded.toFixed(2)} DADDY tokens`;
    } else {
      const solPriceUsd = await getTokenPriceUsd('solana');
      amountNeeded = new BigNumber(price)
        .div(solPriceUsd)
        .decimalPlaces(9, BigNumber.ROUND_DOWN);
      splToken = undefined;
      message = `Order for $${price} (~${amountNeeded.toFixed(4)} SOL)`;
    }

    const ref = Keypair.generate().publicKey;
    const recipient = new PublicKey(MY_DESTINATION_WALLET);

    const url = encodeURL({
      recipient,
      amount: amountNeeded,
      reference: ref,
      ...(splToken ? { splToken } : {}),
      label: 'My Store Payment',
      message,
      memo: memo || 'Payment from MyStore.com',
    });

    const paymentRecord = new Payment({
      reference: ref.toBase58(),
      recipient: recipient.toBase58(),
      amount: amountNeeded.toString(),
      memo: memo || 'Payment from MyStore.com',
      splToken: splToken ? splToken.toBase58() : undefined,
      firstName,
      lastName,
      email,
      ip,
      status: 'pending',
    });

    await paymentRecord.save();

    return NextResponse.json(
      { url: url.toString(), reference: ref.toBase58(), tokenUsed: token === 'daddy' ? 'DADDY' : 'SOL' },
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    console.error('Error generating Solana Pay URL:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
