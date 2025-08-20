import type { NextApiRequest, NextApiResponse } from 'next';
import crypto from 'crypto';
import Razorpay from 'razorpay';
import { env } from '~/env';
import { getAdminFirestore } from '~/server/firebase-admin';
import { sendExecutiveMembershipEmail } from '~/utils/email';
import { verifyFirebaseToken } from '~/server/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Enforce authenticated caller using Firebase ID token
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
  const decoded = token ? await verifyFirebaseToken(token) : null;
  if (!decoded?.uid) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { 
      razorpay_order_id, 
      razorpay_payment_id, 
      razorpay_signature, 
      userId, 
      selectedYears, 
      amount, 
      userEmail, 
      userName, 
      userUsn,
      platformFee,
      baseAmount
    } = req.body as {
      razorpay_order_id: string;
      razorpay_payment_id: string;
      razorpay_signature: string;
      userId?: string;
      selectedYears?: number;
      amount?: number;
      userEmail?: string;
      userName?: string;
      userUsn?: string;
      platformFee?: number;
      baseAmount?: number;
    };

    // Get user data for email from request body
    const userData = {
      name: userName ?? '',
      email: userEmail ?? '',
      usn: userUsn ?? '',
    };
    
    console.log('📋 User data from request:', userData);

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: 'Missing payment details' });
    }

    // Verify the payment signature
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
      .update(body.toString())
      .digest('hex');

    const isAuthentic = expectedSignature === razorpay_signature;

    if (isAuthentic) {
      // Hardened verification: fetch order and payment from Razorpay and validate amounts and context
      try {
        const razorpay = new Razorpay({
          key_id: env.RAZORPAY_KEY_ID,
          key_secret: env.RAZORPAY_KEY_SECRET,
        });

        // Fetch order and payment from Razorpay
        const order = await razorpay.orders.fetch(razorpay_order_id) as {
          id: string;
          amount: number; // paise
          currency: string;
          notes?: Record<string, string>;
        };

        const payment = await razorpay.payments.fetch(razorpay_payment_id) as {
          id: string;
          order_id: string;
          status: string;
          amount: number; // paise
          currency: string;
        };

        // Basic consistency checks
        if (!order || !payment) {
          return res.status(400).json({ error: 'Unable to fetch payment/order from Razorpay' });
        }
        if (payment.status !== 'captured') {
          return res.status(400).json({ error: 'Payment not captured' });
        }
        if (payment.order_id !== order.id) {
          return res.status(400).json({ error: 'Payment does not belong to order' });
        }
        if (payment.amount !== order.amount) {
          return res.status(400).json({ error: 'Payment amount mismatch' });
        }

        // Extract trusted context from order notes
        const notes = order.notes ?? {};
        const notesUserId = notes.userId ?? '';
        const notesSelectedYears = notes.selectedYears ? Number(notes.selectedYears) : NaN;
        const notesUserEmail = notes.userEmail ?? userData.email ?? '';
        const notesUserName = notes.userName ?? userData.name ?? '';
        const notesUserUsn = notes.userUsn ?? userData.usn ?? '';

        if (!notesUserId || !notesSelectedYears || Number.isNaN(notesSelectedYears)) {
          return res.status(400).json({ error: 'Missing order context (user/plan) in Razorpay order' });
        }
        // Enforce that the authenticated user matches the order context
        if (notesUserId !== decoded.uid) {
          return res.status(403).json({ error: 'Forbidden: user mismatch' });
        }

        // Server-side price enforcement
        const planPriceMap: Record<number, number> = { 1: 350, 2: 650, 3: 900 };
        const expectedBase = planPriceMap[notesSelectedYears];
        if (!expectedBase) {
          return res.status(400).json({ error: 'Invalid membership duration' });
        }
        const expectedTotal = Math.ceil(expectedBase / 0.98); // rupees
        const expectedTotalPaise = expectedTotal * 100;
        if (order.amount !== expectedTotalPaise) {
          return res.status(400).json({ error: `Amount mismatch: expected ₹${expectedTotal}` });
        }
        const computedPlatformFee = expectedTotal - expectedBase;

        // Update membership in Firestore with idempotency
        const db = getAdminFirestore();
        const paymentsRef = db.collection('membershipPayments').doc(razorpay_payment_id);
        const existingPayment = await paymentsRef.get();
        if (existingPayment.exists) {
          return res.status(200).json({
            success: true,
            message: 'Payment already processed',
            paymentId: razorpay_payment_id,
            orderId: razorpay_order_id,
          });
        }
        const membershipStartDate = new Date();
        const currentDate = new Date();
        const currentYear = currentDate.getFullYear();
        const currentMonth = currentDate.getMonth();
        const endYear = currentYear + notesSelectedYears;
        const membershipEndDate = new Date(endYear, currentMonth, currentDate.getDate());

        await db.collection('users').doc(notesUserId).set(
          {
            membershipType: `${notesSelectedYears}-Year Executive Membership (Until April 30, ${membershipEndDate.getFullYear()})`,
            membershipStartDate,
            membershipEndDate,
            paymentDetails: {
              razorpayOrderId: razorpay_order_id,
              razorpayPaymentId: razorpay_payment_id,
              amount: expectedBase, // base amount without platform fee
              platformFee: computedPlatformFee,
              totalAmount: expectedTotal,
              currency: 'INR',
              paymentDate: new Date(),
            },
            role: 'EXECUTIVE MEMBER',
            updatedAt: new Date(),
          },
          { merge: true }
        );

        // Mark payment as processed (idempotency)
        await db.collection('membershipPayments').doc(razorpay_payment_id).set({
          orderId: razorpay_order_id,
          paymentId: razorpay_payment_id,
          userId: notesUserId,
          selectedYears: notesSelectedYears,
          amountBase: expectedBase,
          amountTotal: expectedTotal,
          currency: 'INR',
          processedAt: new Date(),
          source: 'verify-payment',
        });

        // Send Executive Membership confirmation email
        if (notesUserEmail && notesUserName) {
          try {
            const membershipPlan = `${notesSelectedYears}-Year Executive Membership`;
            const emailResult = await sendExecutiveMembershipEmail(
              notesUserName,
              notesUserEmail,
              membershipPlan,
              notesUserUsn || 'N/A'
            );
            if (emailResult) {
              console.log(`✅ Executive Membership email sent successfully to ${notesUserEmail}`);
            } else {
              console.log(`❌ Executive Membership email failed to send to ${notesUserEmail} - SMTP not configured`);
            }
          } catch (emailError) {
            console.error('❌ Error sending Executive Membership email:', emailError);
            // Do not fail overall verification due to email error
          }
        } else {
          console.log('⚠️ Skipping email send - missing user data:', { email: notesUserEmail, name: notesUserName });
        }

        return res.status(200).json({
          success: true,
          message: 'Payment verified successfully',
          paymentId: razorpay_payment_id,
          orderId: razorpay_order_id,
        });
      } catch (dbError) {
        console.error('Admin membership update failed:', dbError);
        // Continue: acknowledge verification, but include a warning
        return res.status(200).json({
          success: true,
          message: 'Payment verified successfully, but membership update failed. Please contact support.',
          paymentId: razorpay_payment_id,
          orderId: razorpay_order_id,
        });
      }
    } else {
      return res.status(400).json({
        success: false,
        message: 'Payment verification failed',
      });
    }
  } catch (error) {
    console.error('Error verifying payment:', error);
    return res.status(500).json({ error: 'Failed to verify payment' });
  }
} 