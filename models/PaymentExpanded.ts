import mongoose, { Schema, Document } from 'mongoose';

export interface IPaymentExpanded extends Document {
  reference: string;
  recipient: string;
  amount: string;
  memo?: string;
  splToken?: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  shippingMethod?: 'standard' | 'priority';
  shippingCost?: number;
  cartTotal?: number;
  ip: string;
  status: 'pending' | 'verified' | 'cancelled';
  token: 'DADDY' | 'SOL'; 
  signature: string;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentExpandedSchema: Schema = new Schema(
  {
    reference: { type: String, required: true, unique: true },
    recipient: { type: String, required: true },
    amount: { type: String, required: true },
    memo: { type: String },
    splToken: { type: String },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true },
    phoneNumber: { type: String },
    addressLine1: { type: String },
    addressLine2: { type: String },
    city: { type: String },
    state: { type: String },
    zipCode: { type: String },
    country: { type: String },
    shippingMethod: { 
      type: String,
      enum: ['standard', 'priority']
    },
    shippingCost: { type: Number },
    cartTotal: { type: Number },
    ip: { type: String, required: false },
    status: { 
      type: String, 
      enum: ['pending', 'verified', 'cancelled'], 
      default: 'pending' 
    },
    token: {
      type: String,
      enum: ['DADDY', 'SOL'],
      required: true,
      set: (v: string) => v.toUpperCase(),
    },
    signature: { type: String },
  },
  { timestamps: true }
);

export default mongoose.models.PaymentExpanded || 
  mongoose.model<IPaymentExpanded>('PaymentExpanded', PaymentExpandedSchema);
