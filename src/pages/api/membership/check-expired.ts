import type { NextApiRequest, NextApiResponse } from 'next';
import { getAdminFirestore } from '~/server/firebase-admin';
import type { Timestamp } from 'firebase/firestore';
import { verifyFirebaseToken } from '~/server/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Require admin authorization
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
  const decoded = token ? await verifyFirebaseToken(token) : null;
  if (!decoded?.uid) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const dbAuth = getAdminFirestore();
  const userDoc = await dbAuth.collection('users').doc(decoded.uid).get();
  const role = (userDoc.exists ? (userDoc.data() as { role?: string }).role : undefined) ?? 'User';
  if (role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const db = getAdminFirestore();
    const usersRef = db.collection('users');
    const snapshot = await usersRef.where('membershipEndDate', '!=', null).get();

    const now = new Date();
    let updated = 0;
    const batch = db.batch();

    snapshot.forEach((docSnap) => {
      const userData = docSnap.data() as Record<string, unknown>;
      const membershipEndDateRaw = userData.membershipEndDate as Timestamp | Date | undefined;
      const membershipEndDate = membershipEndDateRaw
        ? membershipEndDateRaw instanceof Date
          ? membershipEndDateRaw
          : membershipEndDateRaw.toDate()
        : undefined;

      if (membershipEndDate && now > membershipEndDate && userData.role === 'EXECUTIVE MEMBER') {
        batch.update(docSnap.ref, {
          role: 'User',
          membershipExpired: true,
          membershipExpiredDate: now,
          updatedAt: now,
        });
        updated += 1;
      }
    });

    if (updated > 0) {
      await batch.commit();
    }

    return res.status(200).json({ success: true, updated });
  } catch (error) {
    console.error('Error checking expired memberships (admin):', error);
    return res.status(500).json({ error: 'Failed to check expired memberships' });
  }
}


