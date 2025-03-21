// /pages/api/pay.ts

import { NextApiRequest, NextApiResponse } from 'next';
import { PublicKey, Transaction, SystemProgram } from '@solana/web3.js';
import { encodeURL, createQR } from '@solana/pay';
import { v4 as uuidv4 } from 'uuid';
import BigNumber from 'bignumber.js';
import dbConnect from './lib/mongodb';
import Payment, { IPayment } from './models/Payment';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { amount, email, firstName, lastName } = req.body;

    if (!amount || !email || !firstName || !lastName) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Generate a unique reference using UUID
    const uuid = uuidv4().replace(/-/g, ''); // Remove dashes
    const reference = new PublicKey(Buffer.from(uuid.slice(0, 32), 'hex'));

    const recipientAddress = 'bfHB68f9hMUp1vJUYf4BDjTr4aVCX8ZPqjsVVtT72of'; // Replace with your recipient address
    const splTokenAddress = '4Cnk9EPnW5ixfLZatCPJjDB1PUtcRpVVgTQukm9epump'; // DADDY-TATE SPL Token Mint Address

    const url = encodeURL({
      recipient: new PublicKey(recipientAddress),
      amount: new BigNumber(amount), // Amount in standard units
      reference: reference,
      label: 'My Store Payment',
      message: `Order for $1 => ~${amount} DADDY tokens`,
      memo: 'Payment from MyStore.com',
      splToken: new PublicKey(splTokenAddress),
    });

    // Connect to MongoDB
    await dbConnect();

    // Create a new payment record
    const payment = new Payment({
      reference: reference.toBase58(),
      recipient: recipientAddress,
      amount: amount,
      splToken: splTokenAddress,
      memo: 'Payment from MyStore.com',
      status: 'pending',
      email,
      firstName,
      lastName,
      ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
      createdAt: new Date(),
    });

    await payment.save();

    res.status(200).json({ url });
  } catch (error: any) {
    console.error('Error creating payment:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
