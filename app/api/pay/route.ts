import { NextRequest, NextResponse } from 'next/server';
import { Keypair, PublicKey } from '@solana/web3.js';
import { encodeURL } from '@solana/pay';
import BigNumber from 'bignumber.js';
import axios from 'axios';
import dbConnect from '../../../lib/mongodb.ts';
import Payment from '../../../models/Payment.ts';
import { MY_DESTINATION_WALLET, COINGECKO_DEMO_API_KEY } from '../../../config.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS(request: NextRequest) {
  return NextResponse.json({}, { status: 200, headers: corsHeaders });
}

async function getTokenPriceUsd(token: string): Promise<number> {
  const response = await axios.get(
    `https://api.coingecko.com/api/v3/simple/price?ids=${token}&vs_currencies=usd`
  );
  return response.data[token]?.usd || 0;
}

export async function POST(request: NextRequest) {
  const headers = new Headers(corsHeaders);

  try {
    const { price, token, firstName, lastName, email, memo, signature } = await request.json();

    if (!price || !firstName || !lastName || !email || !token) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400, headers });
    }

    await dbConnect();

    // Normalize token to uppercase
    const normalizedToken = token.toUpperCase();
    let amountNeeded: BigNumber;
    let splToken: PublicKey | undefined;

    if (normalizedToken === 'DADDY') {
      const daddyPriceUsd = await getTokenPriceUsd('daddy-tate');
      amountNeeded = new BigNumber(price).dividedBy(daddyPriceUsd).decimalPlaces(6);
      splToken = new PublicKey('4Cnk9EPnW5ixfLZatCPJjDB1PUtcRpVVgTQukm9epump');
    } else if (normalizedToken === 'SOL') {
      const solPriceUsd = await getTokenPriceUsd('solana');
      amountNeeded = new BigNumber(price).dividedBy(solPriceUsd).decimalPlaces(9);
      splToken = undefined;
    } else {
      return NextResponse.json({ error: 'Invalid token specified' }, { status: 400, headers });
    }

    const ref = Keypair.generate().publicKey;
    const recipient = new PublicKey(MY_DESTINATION_WALLET);
    const url = encodeURL({
      recipient,
      amount: amountNeeded,
      reference: ref,
      ...(splToken && { splToken }),
      label: 'My Store Payment',
      message: `Payment for $${price}`,
      memo: memo || 'Payment from MyStore.com',
    });

    const paymentRecord = new Payment({
      reference: ref.toBase58(),
      recipient: recipient.toBase58(),
      amount: amountNeeded.toString(),
      memo: memo || 'Payment from MyStore.com',
      splToken: splToken?.toBase58(),
      firstName,
      lastName,
      email,
      token: normalizedToken, // Use the normalized token
      signature: null,
      status: 'pending',
    });

    await paymentRecord.save();

    return NextResponse.json({ url: url.toString(), reference: ref.toBase58(), tokenUsed: normalizedToken }, { status: 200, headers });
  } catch (error: any) {
    console.error('Error generating Solana Pay URL:', error.message || error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500, headers });
  }
}
