import mongoose, { Schema, Document } from 'mongoose';

export interface IPayment extends Document {
  reference: string;
  recipient: string;
  amount: string;
  memo?: string;
  splToken?: string;
  firstName: string;
  lastName: string;
  email: string;
  ip: string;
  status: 'pending' | 'verified' | 'cancelled';
  token: 'DADDY' | 'SOL'; // Token type
  signature: string; // Added signature field
  createdAt: Date;
  updatedAt: Date;
}

const PaymentSchema: Schema = new Schema(
  {
    reference: { type: String, required: true, unique: true },
    recipient: { type: String, required: true },
    amount: { type: String, required: true },
    memo: { type: String },
    splToken: { type: String },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true },
    ip: { type: String, required: false },
    status: { type: String, enum: ['pending', 'verified', 'cancelled'], default: 'pending' },
    token: {
      type: String,
      enum: ['DADDY', 'SOL'], // Ensure token is always uppercase
      required: true,
      set: (v: string) => v.toUpperCase(), // Automatically convert to uppercase
    },
    signature: { type: String },
  },
  { timestamps: true }
);


export default mongoose.models.Payment || mongoose.model<IPayment>('Payment', PaymentSchema);
