import type { NextApiRequest, NextApiResponse } from 'next';
import crypto from 'crypto';

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
      req.on('data', (chunk: string) => {
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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Disable this endpoint outside development to prevent signature oracle exploits
  if (process.env.NODE_ENV !== 'development') {
    return res.status(404).json({ error: 'Not found' });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return res.status(500).json({ error: 'Server misconfiguration: missing RAZORPAY_WEBHOOK_SECRET' });
  }

  try {
    const rawBody = await getRawBody(req);
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex');

    return res.status(200).json({ expectedSignature });
  } catch {
    return res.status(500).json({ error: 'Failed to compute signature' });
  }
}


