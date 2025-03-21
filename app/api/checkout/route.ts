import { NextRequest, NextResponse } from 'next/server';
import { Keypair, PublicKey } from '@solana/web3.js';
import { encodeURL } from '@solana/pay';
import BigNumber from 'bignumber.js';
import axios from 'axios';
import dbConnect from '../../../lib/mongodb';
import PaymentExpanded from '../../../models/PaymentExpanded';
import { MY_DESTINATION_WALLET } from '../../../config';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return NextResponse.json({}, { status: 200, headers: corsHeaders });
}

async function getTokenPriceUsd(token: string): Promise<number> {
  try {
    const response = await axios.get(
      `https://api.coingecko.com/api/v3/simple/price?ids=${token}&vs_currencies=usd`
    );
    return response.data[token]?.usd || 0;
  } catch (error) {
    console.error(`Error fetching price for ${token}:`, error);
    throw new Error(`Unable to fetch price for ${token}`);
  }
}

export async function POST(request: NextRequest) {
  const headers = new Headers(corsHeaders);

  try {
    const {
      cartTotal,
      token,
      firstName,
      lastName,
      email,
      phoneNumber,
      addressLine1,
      addressLine2,
      city,
      state,
      zipCode,
      country,
      shippingMethod,
      memo
    } = await request.json();

    if (!cartTotal || !firstName || !lastName || !email || !token) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400, headers });
    }

    await dbConnect();

    // Calculate total price including shipping
    const shippingCost = shippingMethod === 'priority' ? 50 : 10;
    const totalPrice = Number(cartTotal) + shippingCost;

    // Normalize token to uppercase
    const normalizedToken = token.toUpperCase();
    let amountNeeded: BigNumber;
    let splToken: PublicKey | undefined;

    if (normalizedToken === 'DADDY') {
      const daddyPriceUsd = await getTokenPriceUsd('daddy-tate');
      if (!daddyPriceUsd) {
        return NextResponse.json({ error: 'Error fetching DADDY token price' }, { status: 500, headers });
      }
      amountNeeded = new BigNumber(totalPrice).dividedBy(daddyPriceUsd).decimalPlaces(6);
      splToken = new PublicKey('4Cnk9EPnW5ixfLZatCPJjDB1PUtcRpVVgTQukm9epump');
    } else if (normalizedToken === 'SOL') {
      const solPriceUsd = await getTokenPriceUsd('solana');
      if (!solPriceUsd) {
        return NextResponse.json({ error: 'Error fetching SOL price' }, { status: 500, headers });
      }
      amountNeeded = new BigNumber(totalPrice).dividedBy(solPriceUsd).decimalPlaces(9);
      splToken = undefined;
    } else {
      return NextResponse.json({ error: 'Invalid token specified' }, { status: 400, headers });
    }

    const ref = Keypair.generate().publicKey;
    
    // Ensure wallet address is defined
    if (!MY_DESTINATION_WALLET) {
      throw new Error('Destination wallet address is not defined in environment variables');
    }
    
    const recipient = new PublicKey(MY_DESTINATION_WALLET);
    const url = encodeURL({
      recipient,
      amount: amountNeeded,
      reference: ref,
      ...(splToken && { splToken }),
      label: 'Checkout Payment',
      message: `Payment for $${totalPrice} (includes ${shippingMethod} shipping)`,
      memo: memo || `${firstName} ${lastName}'s order with ${shippingMethod} shipping`,
    });

    const paymentRecord = new PaymentExpanded({
      reference: ref.toBase58(),
      recipient: recipient.toBase58(),
      amount: amountNeeded.toString(),
      memo: memo || `${firstName} ${lastName}'s order with ${shippingMethod} shipping`,
      splToken: splToken ? splToken.toBase58() : undefined,
      firstName,
      lastName,
      email,
      phoneNumber,
      addressLine1,
      addressLine2,
      city,
      state,
      zipCode,
      country,
      shippingMethod,
      shippingCost,
      cartTotal: Number(cartTotal),
      token: normalizedToken,
      signature: null,
      status: 'pending',
    });

    await paymentRecord.save();

    return NextResponse.json({
      url: url.toString(),
      reference: ref.toBase58(),
      tokenUsed: normalizedToken,
      totalAmount: totalPrice,
      shipping: {
        method: shippingMethod,
        cost: shippingCost
      }
    }, { status: 200, headers });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error generating payment URL:', errorMessage);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500, headers });
  }
}
