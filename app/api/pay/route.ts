import { NextRequest, NextResponse } from 'next/server';
import { Keypair, PublicKey } from '@solana/web3.js';
import { encodeURL } from '@solana/pay';
import BigNumber from 'bignumber.js';
import axios from 'axios';
import dbConnect from '../../../lib/mongodb';
import Payment from '../../../models/Payment';
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
  const response = await axios.get(
    `https://api.coingecko.com/api/v3/simple/price?ids=${token}&vs_currencies=usd`
  );
  return response.data[token]?.usd || 0;
}

export async function POST(request: NextRequest) {
  const headers = new Headers(corsHeaders);

  try {
    const { 
      price, 
      token, 
      firstName, 
      lastName, 
      email, 
      memo,
      // Support for expanded fields
      phoneNumber,
      addressLine1,
      addressLine2,
      city,
      state,
      zipCode,
      country,
      shippingMethod,
      cartTotal
    } = await request.json();

    if (!price || !firstName || !lastName || !email || !token) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400, headers });
    }

    // Calculate total price including shipping if shipping method is provided
    let totalPrice = Number(price);
    let shippingCost = 0;
    
    if (shippingMethod) {
      shippingCost = shippingMethod === 'priority' ? 50 : 10;
      totalPrice += shippingCost;
    }

    await dbConnect();

    // Normalize token to uppercase
    const normalizedToken = token.toUpperCase();
    let amountNeeded: BigNumber;
    let splToken: PublicKey | undefined;

    if (normalizedToken === 'DADDY') {
      const daddyPriceUsd = await getTokenPriceUsd('daddy-tate');
      amountNeeded = new BigNumber(totalPrice).dividedBy(daddyPriceUsd).decimalPlaces(6);
      splToken = new PublicKey('4Cnk9EPnW5ixfLZatCPJjDB1PUtcRpVVgTQukm9epump');
    } else if (normalizedToken === 'SOL') {
      const solPriceUsd = await getTokenPriceUsd('solana');
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
      label: 'My Store Payment',
      message: `Payment for $${price}`,
      memo: memo || 'Payment from MyStore.com',
    });

    // Check if we have expanded information
    const hasExpandedInfo = addressLine1 || phoneNumber || shippingMethod;
    
    if (hasExpandedInfo) {
      // Create expanded payment record
      const paymentRecord = new PaymentExpanded({
        reference: ref.toBase58(),
        recipient: recipient.toBase58(),
        amount: amountNeeded.toString(),
        memo: memo || 'Payment from MyStore.com',
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
        cartTotal: cartTotal || Number(price),
        token: normalizedToken,
        signature: null,
        status: 'pending',
      });
      await paymentRecord.save();
    } else {
      // Create standard payment record
      const paymentRecord = new Payment({
        reference: ref.toBase58(),
        recipient: recipient.toBase58(),
        amount: amountNeeded.toString(),
        memo: memo || 'Payment from MyStore.com',
        splToken: splToken ? splToken.toBase58() : undefined,
        firstName,
        lastName,
        email,
        token: normalizedToken,
        signature: null,
        status: 'pending',
      });
      await paymentRecord.save();
    }

    return NextResponse.json({ 
      url: url.toString(), 
      reference: ref.toBase58(), 
      tokenUsed: normalizedToken,
      ...(shippingMethod && {
        totalAmount: totalPrice,
        shipping: {
          method: shippingMethod,
          cost: shippingCost
        }
      })
    }, { status: 200, headers });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error generating Solana Pay URL:', errorMessage);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500, headers });
  }
}
