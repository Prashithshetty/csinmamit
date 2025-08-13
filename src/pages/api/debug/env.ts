import type { NextApiRequest, NextApiResponse } from 'next';
import { env } from '~/env';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Only allow in development
  if (process.env.NODE_ENV !== 'development') {
    return res.status(403).json({ error: 'Not available in production' });
  }

  const debugInfo = {
    nodeEnv: process.env.NODE_ENV,
    razorpay: {
      keyId: env.RAZORPAY_KEY_ID ? `${env.RAZORPAY_KEY_ID.substring(0, 10)}...` : 'NOT_SET',
      hasSecret: !!env.RAZORPAY_KEY_SECRET,
      publicKeyId: env.NEXT_PUBLIC_RAZORPAY_KEY_ID ? `${env.NEXT_PUBLIC_RAZORPAY_KEY_ID.substring(0, 10)}...` : 'NOT_SET',
    },
    firebase: {
      projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      hasAdminProjectId: !!env.FIREBASE_ADMIN_PROJECT_ID,
      hasAdminClientEmail: !!env.FIREBASE_ADMIN_CLIENT_EMAIL,
      hasAdminPrivateKey: !!env.FIREBASE_ADMIN_PRIVATE_KEY,
    },
    membership: {
      enabled: env.NEXT_PUBLIC_MEMBERSHIP_ENABLED,
    }
  };

  res.status(200).json(debugInfo);
}
