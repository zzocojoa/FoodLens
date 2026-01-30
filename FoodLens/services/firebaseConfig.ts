import { initializeApp, getApp, getApps } from 'firebase/app';
import { getFirestore, initializeFirestore } from 'firebase/firestore';
import { initializeAuth, getAuth } from 'firebase/auth';

// Your web app's Firebase configuration
// For React Native in Expo Go, we use the JS SDK configuration.
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: `${process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID}.firebaseapp.com`,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: "702927497233", // Hardcoded from plist for now
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

console.log("Found Firebase Config:", !!firebaseConfig.apiKey);

// Initialize Firebase
let app;
if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}

// Use initializeFirestore with settings for better React Native compatibility
export const db = initializeFirestore(app, {
    experimentalForceLongPolling: true, // Fix for hanging requests in Expo Go
});

// Initialize Auth once; fall back to existing instance if already initialized.
let authInstance;
try {
  authInstance = initializeAuth(app);
} catch (_error) {
  authInstance = getAuth(app);
}

export const auth = authInstance;

export default app;
