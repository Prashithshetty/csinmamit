import type { NextApiRequest, NextApiResponse } from 'next';
import crypto from 'crypto';
import Razorpay from 'razorpay';
import { getAdminFirestore } from '~/server/firebase-admin';
import { sendExecutiveMembershipEmail } from '~/utils/email';
import { env } from '~/env';

export const config = {
  api: {
    bodyParser: false,
  },
};

async function getRawBody(req: NextApiRequest): Promise<string> {
  return await new Promise((resolve, reject) => {
    try {
      let data = '';
      req.setEncoding('utf8');
      req.on('data', (chunk) => {
        data += chunk;
      });
      req.on('end', () => {
        resolve(data);
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to read request body';
      reject(new Error(message));
    }
  });
}

const razorpay = new Razorpay({
  key_id: env.RAZORPAY_KEY_ID,
  key_secret: env.RAZORPAY_KEY_SECRET,
});

type RazorpayPaymentEntity = {
  id: string;
  order_id?: string;
  amount?: number; // in paise
};

type RazorpayPaymentCapturedEvent = {
  event: 'payment.captured';
  payload?: {
    payment?: {
      entity?: RazorpayPaymentEntity;
    };
  };
};

function isPaymentCapturedEvent(input: unknown): input is RazorpayPaymentCapturedEvent {
  if (!input || typeof input !== 'object') return false;
  const evt = (input as { event?: unknown }).event;
  if (evt !== 'payment.captured') return false;
  return true;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('Missing RAZORPAY_WEBHOOK_SECRET');
    return res.status(500).json({ error: 'Server misconfiguration' });
  }

  try {
    const rawBody = await getRawBody(req);
    const receivedSignature = req.headers['x-razorpay-signature'] as string | undefined;
    if (!receivedSignature) {
      return res.status(400).json({ error: 'Missing webhook signature' });
    }

    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex');

    if (receivedSignature !== expectedSignature) {
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const parsed: unknown = JSON.parse(rawBody);

    // Handle only relevant events
    if (isPaymentCapturedEvent(parsed)) {
      const paymentEntity: RazorpayPaymentEntity | undefined = parsed.payload?.payment?.entity;

      if (!paymentEntity) {
        return res.status(200).json({ received: true });
      }

      // Attempt to fetch order to read notes/receipt for user context
      let userId: string | undefined;
      let selectedYears: number | undefined;
      let userEmail: string | undefined;
      let userName: string | undefined;
      let userUsn: string | undefined;
      let platformFee: number | undefined;
      let baseAmount: number | undefined;

      try {
        if (paymentEntity.order_id) {
          const order = await razorpay.orders.fetch(paymentEntity.order_id) as {
            id: string;
            receipt?: string;
            notes?: Record<string, string>;
            amount?: number; // paise
          };

          const notes = order.notes ?? {};
          userId = notes.userId ?? undefined;
          userEmail = notes.userEmail ?? undefined;
          userName = notes.userName ?? undefined;
          userUsn = notes.userUsn ?? undefined;
          selectedYears = notes.selectedYears ? Number(notes.selectedYears) : undefined;
          platformFee = notes.platformFee ? Number(notes.platformFee) : undefined;
          baseAmount = notes.baseAmount ? Number(notes.baseAmount) : undefined;
        }
      } catch (fetchErr) {
        console.warn('Failed to fetch order for webhook context:', fetchErr);
      }

      // Additionally, fetch payment to assert status and linkage
      try {
        const payment = await razorpay.payments.fetch(paymentEntity.id) as {
          id: string;
          order_id: string;
          status: string;
          amount: number; // paise
          currency: string;
        };
        if (payment.status !== 'captured') {
          // Not a captured payment; acknowledge without side effects
          return res.status(200).json({ received: true });
        }
        if (paymentEntity.order_id && payment.order_id !== paymentEntity.order_id) {
          // Payment not linked to the expected order
          return res.status(200).json({ received: true });
        }
      } catch (paymentFetchErr) {
        console.warn('Webhook: Failed to fetch payment for validation', paymentFetchErr);
        return res.status(200).json({ received: true });
      }

      // If we have sufficient context, perform membership update with strict server-side validation
      if (userId && selectedYears && paymentEntity.amount) {
        // Idempotency: skip if this payment was already processed
        const db = getAdminFirestore();
        try {
          const existing = await db.collection('membershipPayments').doc(paymentEntity.id).get();
          if (existing.exists) {
            return res.status(200).json({ received: true });
          }
        } catch (idempErr) {
          console.warn('Webhook: Failed to check idempotency', idempErr);
          // Continue cautiously; downstream write will still be merge-safe
        }
        try {
          // Server-side enforcement of expected pricing
          const planPriceMap: Record<number, number> = { 1: 350, 2: 650, 3: 900 };
          const expectedBase = planPriceMap[selectedYears];
          if (!expectedBase) {
            console.warn('Webhook: Invalid selectedYears in notes:', selectedYears);
            return res.status(200).json({ received: true });
          }
          const expectedTotal = Math.ceil(expectedBase / 0.98);
          const expectedTotalPaise = expectedTotal * 100;

          // Verify the paid amount equals expected and matches order amount if available
          if (paymentEntity.amount !== expectedTotalPaise) {
            console.warn('Webhook: Amount mismatch', {
              paidPaise: paymentEntity.amount,
              expectedTotalPaise,
              selectedYears
            });
            return res.status(200).json({ received: true });
          }

          try {
            if (paymentEntity.order_id) {
              const order = await razorpay.orders.fetch(paymentEntity.order_id) as { amount?: number };
              if (order.amount !== undefined && order.amount !== expectedTotalPaise) {
                console.warn('Webhook: Order amount mismatch', { orderAmount: order.amount, expectedTotalPaise });
                return res.status(200).json({ received: true });
              }
            }
          } catch (orderCheckErr) {
            console.warn('Webhook: Failed to re-fetch order for amount check', orderCheckErr);
          }

          const db = getAdminFirestore();
          const membershipStartDate = new Date();
          const currentDate = new Date();
          const currentYear = currentDate.getFullYear();
          const currentMonth = currentDate.getMonth();
          const endYear = currentYear + selectedYears;
          const membershipEndDate = new Date(endYear, currentMonth, currentDate.getDate());
          const computedPlatformFee = expectedTotal - expectedBase;

          await db.collection('users').doc(userId).set(
            {
              membershipType: `${selectedYears}-Year Executive Membership (Until April 30, ${membershipEndDate.getFullYear()})`,
              membershipStartDate,
              membershipEndDate,
              paymentDetails: {
                razorpayOrderId: paymentEntity.order_id ?? 'N/A',
                razorpayPaymentId: paymentEntity.id,
                amount: expectedBase,
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

          // Mark payment as processed for idempotency
          await db.collection('membershipPayments').doc(paymentEntity.id).set({
            orderId: paymentEntity.order_id ?? 'N/A',
            paymentId: paymentEntity.id,
            userId,
            selectedYears,
            amountBase: expectedBase,
            amountTotal: expectedTotal,
            currency: 'INR',
            processedAt: new Date(),
            source: 'webhook',
          });

          if (userEmail && userName) {
            await sendExecutiveMembershipEmail(
              userName,
              userEmail,
              `${selectedYears}-Year Executive Membership`,
              userUsn ?? 'N/A'
            );
          }
        } catch (err) {
          console.error('Webhook membership update failed:', err);
          // Acknowledge to avoid retries loop; failures can be retried manually
        }
      }

      return res.status(200).json({ received: true });
    }

    // For other events, just acknowledge
    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
}


