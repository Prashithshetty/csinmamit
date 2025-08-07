import { useState, useEffect } from 'react';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User as FirebaseUser,
} from 'firebase/auth';
import { initializeApp, getApps, getApp } from 'firebase/app';

// Firebase config using environment variables
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// ✅ Check if the config is using a dummy or missing API key
const isFakeKey =
  !firebaseConfig.apiKey || firebaseConfig.apiKey.includes('DUMMYKEY');

// ✅ Only initialize Firebase and Auth if config is valid
const firebaseApp = !isFakeKey
  ? getApps().length === 0
    ? initializeApp(firebaseConfig)
    : getApp()
  : null;

const auth = firebaseApp ? getAuth(firebaseApp) : null;

export interface User {
  id: string;
  name?: string;
  email?: string;
  image?: string;
}

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(!isFakeKey);

  useEffect(() => {
    if (!auth) {
      console.warn('⚠️ Firebase Auth not initialized. Using dummy config?');
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser: FirebaseUser | null) => {
      if (firebaseUser) {
        setUser({
          id: firebaseUser.uid,
          name: firebaseUser.displayName ?? undefined,
          email: firebaseUser.email ?? undefined,
          image: firebaseUser.photoURL ?? undefined,
        });
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    if (!auth) {
      throw new Error('Auth not initialized');
    }

    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      return result.user;
    } catch (error) {
      console.error('Error signing in with Google:', error);
      throw error;
    }
  };

  const signOut = async () => {
    if (!auth) return;
    try {
      await firebaseSignOut(auth);
    } catch (error) {
      console.error('Error signing out:', error);
      throw error;
    }
  };

  const getIdToken = async () => {
    if (!auth?.currentUser) {
      throw new Error('No user is signed in or Auth not initialized');
    }
    return await auth.currentUser.getIdToken();
  };

  return {
    user,
    loading,
    signInWithGoogle,
    signOut,
    getIdToken,
  };
};
