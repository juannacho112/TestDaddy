// models/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { Keypair, PublicKey } from '@solana/web3.js';
import { encodeURL } from '@solana/pay';
import BigNumber from 'bignumber.js';
import axios from 'axios';
import dbConnect from '../lib/mongodb'; // Correct relative path
import Payment from './Payment'; // Correct relative path
import { MONGODB_URI, QUICKNODE_ENDPOINT, MY_DESTINATION_WALLET, COINGECKO_DEMO_API_KEY, ZAPIER_WEBHOOK_URL } from '../config';
import { cache } from '../lib/cache'; // Correct relative path

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
 * Helper function to fetch Solana or DADDY token prices in USD.
 * Implement caching to minimize API calls.
 */
async function getTokenPriceUsd(token: string): Promise<number> {
  // Check cache first (e.g., cache for 60 seconds)
  const cachedPrice = cache.get<number>(`price_${token}`);
  if (cachedPrice) {
    return cachedPrice;
  }

  // Fetch from CoinGecko or another reliable API
  try {
    const response = await axios.get(
      `https://api.coingecko.com/api/v3/simple/price?ids=${token}&vs_currencies=usd`,
      {
        headers: {
          'Authorization': `Bearer ${COINGECKO_DEMO_API_KEY}`,
        },
      }
    );
    const price = response.data[token].usd;
    cache.set(`price_${token}`, price, 60 * 1000); // Cache for 60 seconds
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
  // Handle CORS
  const response = NextResponse.next();
  Object.entries(corsHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  await dbConnect();

  try {
    const { price, token, firstName, lastName, email, memo } = await request.json();
    if (!price || !firstName || !lastName || !email) {
      return NextResponse.json(
        { error: 'Missing required fields.' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Get client IP address
    let ip =
      request.headers.get('x-forwarded-for') ||
      request.headers.get('x-real-ip') ||
      'unknown';
    if (ip && ip.includes(',')) {
      ip = ip.split(',')[0].trim();
    }

    let amountNeeded: BigNumber;
    let splToken: PublicKey | undefined;
    let message: string;

    if (token === 'daddy') {
      // Fetch DADDY price and convert USD to DADDY tokens
      const daddyPriceUsd = await getTokenPriceUsd('daddy');
      console.log(`[DEBUG] DADDY price USD: ${daddyPriceUsd}`);
      amountNeeded = new BigNumber(price)
        .div(daddyPriceUsd)
        .decimalPlaces(6, BigNumber.ROUND_DOWN); // Assuming DADDY has 6 decimals
      splToken = new PublicKey('4Cnk9EPnW5ixfLZatCPJjDB1PUtcRpVVgTQukm9epump');
      message = `Order for $${price} => ~${amountNeeded.toFixed(2)} DADDY tokens`;
    } else {
      // Fetch SOL price and convert USD to SOL
      const solPriceUsd = await getTokenPriceUsd('solana');
      console.log(`[DEBUG] SOL price USD: ${solPriceUsd}`);
      amountNeeded = new BigNumber(price)
        .div(solPriceUsd)
        .decimalPlaces(9, BigNumber.ROUND_DOWN); // SOL has 9 decimals
      splToken = undefined;
      message = `Order for $${price} (~${amountNeeded.toFixed(4)} SOL)`;
    }

    // Generate a unique reference
    const ref = Keypair.generate().publicKey;
    
    // Check if MY_DESTINATION_WALLET is defined
    if (!MY_DESTINATION_WALLET) {
      throw new Error('Destination wallet address is not defined in environment variables');
    }
    
    const recipient = new PublicKey(MY_DESTINATION_WALLET);

    // Encode the Solana Pay URL
    const url = encodeURL({
      recipient,
      amount: amountNeeded,
      reference: ref,
      ...(splToken ? { splToken } : {}),
      label: 'My Store Payment',
      message,
      memo: memo || 'Payment from MyStore.com',
    });

    // Log the generated URL and splToken status
    console.log(`[DEBUG] Generated URL: ${url.toString()}`);
    console.log(`[DEBUG] splToken: ${splToken ? splToken.toBase58() : 'None'}`);
    console.log(
      `[DEBUG] User Data: ${firstName} ${lastName}, Email: ${email}, IP: ${ip}`
    );

    // Save to database
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

    // Respond with the Solana Pay URL and reference
    return NextResponse.json(
      {
        url: url.toString(),
        reference: ref.toBase58(),
        tokenUsed: token === 'daddy' ? 'DADDY' : 'SOL',
      },
      {
        status: 200,
        headers: corsHeaders,
      }
    );
  } catch (error: any) {
    console.error('Error generating Solana Pay URL:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      {
        status: 500,
        headers: corsHeaders,
      }
    );
  }
}
