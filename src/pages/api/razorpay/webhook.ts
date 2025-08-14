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
      reject(err);
    }
  });
}

const razorpay = new Razorpay({
  key_id: env.RAZORPAY_KEY_ID,
  key_secret: env.RAZORPAY_KEY_SECRET,
});

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

    const event = JSON.parse(rawBody) as {
      event: string;
      payload?: any;
    };

    // Handle only relevant events
    if (event.event === 'payment.captured') {
      const paymentEntity = event.payload?.payment?.entity as {
        id: string;
        order_id?: string;
        amount?: number; // in paise
        notes?: Record<string, string>;
      };

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

      // If we have sufficient context, perform membership update similar to /verify-payment
      if (userId && selectedYears && (baseAmount || paymentEntity.amount)) {
        try {
          const db = getAdminFirestore();
          const membershipStartDate = new Date();
          const currentDate = new Date();
          const currentYear = currentDate.getFullYear();
          const currentMonth = currentDate.getMonth();
          const endYear = currentYear + selectedYears;
          const membershipEndDate = new Date(endYear, currentMonth, currentDate.getDate());

          await db.collection('users').doc(userId).set(
            {
              membershipType: `${selectedYears}-Year Executive Membership (Until April 30, ${membershipEndDate.getFullYear()})`,
              membershipStartDate,
              membershipEndDate,
              paymentDetails: {
                razorpayOrderId: paymentEntity.order_id ?? 'N/A',
                razorpayPaymentId: paymentEntity.id,
                amount: baseAmount ?? Math.round((paymentEntity.amount ?? 0) / 100),
                platformFee: platformFee ?? 0,
                totalAmount: Math.round((paymentEntity.amount ?? 0) / 100),
                currency: 'INR',
                paymentDate: new Date(),
              },
              role: 'EXECUTIVE MEMBER',
              updatedAt: new Date(),
            },
            { merge: true }
          );

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


