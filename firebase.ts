// Import the functions you need from the SDKs you need
/*import { initializeApp, getApps, getApp } from "firebase/app";
import { getStorage } from "firebase/storage";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Initialize Firebase only if it hasn't been initialized already
const firebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Get a reference to the storage service, which is used to create references in your storage bucket
export const storage = getStorage(firebaseApp);

// Get a reference to the Firestore database
export const db = getFirestore(firebaseApp);*/


import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getStorage } from "firebase/storage";
import { getFirestore } from "firebase/firestore";

// Firebase config using env variables
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// ✅ Detect fake or missing keys
const isFakeKey =
  !firebaseConfig.apiKey || firebaseConfig.apiKey.includes("DUMMYKEY");

let firebaseApp: FirebaseApp | null = null;

if (!isFakeKey) {
  firebaseApp = getApps().length === 0
    ? initializeApp(firebaseConfig)
    : getApp();
} else {
  console.warn("🚫 Firebase not initialized due to missing or dummy config.");
}

// ✅ Export firebaseApp (null-safe), storage, db
export { firebaseApp };
export const storage = firebaseApp ? getStorage(firebaseApp) : null;
export const db = firebaseApp ? getFirestore(firebaseApp) : null;

