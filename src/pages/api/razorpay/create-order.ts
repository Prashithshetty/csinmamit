import type { NextApiRequest, NextApiResponse } from 'next';
import Razorpay from 'razorpay';
import { z } from 'zod';
import { env } from '~/env';
import { verifyFirebaseToken } from '~/server/auth';

// Input validation schema
const createOrderSchema = z.object({
  amount: z.number().positive('Amount must be positive').max(1000000, 'Amount too large'),
  currency: z.string().optional().default('INR'),
  receipt: z.string().min(1, 'Receipt is required').max(40, 'Receipt too long'),
  platformFee: z.number().min(0, 'Platform fee must be non-negative').optional(),
  baseAmount: z.number().positive('Base amount must be positive').optional(),
  // Context for webhook processing
  userId: z.string(),
  selectedYears: z.number().int().positive(),
  userEmail: z.string().email().optional(),
  userName: z.string().optional(),
  userUsn: z.string().optional(),
});

const razorpay = new Razorpay({
  key_id: env.RAZORPAY_KEY_ID,
  key_secret: env.RAZORPAY_KEY_SECRET,
});

/**
 * Create Razorpay order with proper validation and error handling
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Method validation
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      error: 'Method not allowed',
      message: 'Only POST requests are allowed'
    });
  }

  if (process.env.NODE_ENV !== 'production') {
    console.log('🔧 Razorpay API - Environment check:', {
      keyId: env.RAZORPAY_KEY_ID?.substring(0, 10) + '...',
      hasSecret: !!env.RAZORPAY_KEY_SECRET,
      nodeEnv: process.env.NODE_ENV
    });
  }

  // Require authenticated caller and bind to their UID
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
  const decoded = token ? await verifyFirebaseToken(token) : null;
  if (!decoded?.uid) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Input validation
    const validationResult = createOrderSchema.safeParse(req.body);
    
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Invalid input',
        details: validationResult.error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message
        }))
      });
    }

    const { amount, currency, receipt, userId, selectedYears, userEmail, userName, userUsn } = validationResult.data;

    // Ensure the order is being created for the authenticated user
    const authUserId = decoded.uid;
    if (userId !== authUserId) {
      return res.status(403).json({ error: 'Forbidden: user mismatch' });
    }

    // Additional business logic validation
    if (amount < 1) {
      return res.status(400).json({ 
        error: 'Invalid amount',
        message: 'Amount must be at least ₹1'
      });
    }

    // Enforce server-side expected totals based on selectedYears to prevent tampering
    const planPriceMap: Record<number, number> = { 1: 350, 2: 650, 3: 900 };
    const expectedBase = planPriceMap[selectedYears];
    if (!expectedBase) {
      return res.status(400).json({
        error: 'Invalid plan',
        message: 'Unsupported membership duration selected'
      });
    }
    const expectedTotal = Math.ceil(expectedBase / 0.98);
    if (amount !== expectedTotal) {
      return res.status(400).json({
        error: 'Amount mismatch',
        message: `Expected total amount ₹${expectedTotal} for ${selectedYears}-year plan`
      });
    }
    const computedPlatformFee = expectedTotal - expectedBase;

    const options = {
      amount: Math.round(expectedTotal * 100), // Razorpay expects amount in paise
      currency,
      receipt,
      notes: {
        platformFee: computedPlatformFee.toString(),
        baseAmount: expectedBase.toString(),
        userId: authUserId,
        selectedYears: selectedYears.toString(),
        userEmail: userEmail ?? '',
        userName: userName ?? '',
        userUsn: userUsn ?? '',
      },
    };

    if (process.env.NODE_ENV !== 'production') {
      console.log('📋 Creating Razorpay order with options:', {
        amount: options.amount,
        currency: options.currency,
        receipt: options.receipt,
        notes: options.notes
      });
    }

    const order = await razorpay.orders.create(options) as {
      id: string;
      amount: number;
      currency: string;
    };

    if (process.env.NODE_ENV !== 'production') {
      console.log('✅ Razorpay order created successfully:', {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency
      });
    }

    res.status(200).json({
      success: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      platformFee: computedPlatformFee,
      baseAmount: expectedBase,
    });
  } catch (error) {
    console.error('Error creating Razorpay order:', error);
    
    // Better error handling
    if (error instanceof Error) {
      return res.status(500).json({ 
        error: 'Failed to create order',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to create order',
      message: 'An unexpected error occurred'
    });
  }
}
