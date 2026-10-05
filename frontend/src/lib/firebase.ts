// Firebase client (JS SDK) for TaskMint.
// Config derived from the uploaded google-services.json (project taskmint-cfc5a).
// Only global admin content + user requests live here; personal data stays on device.
import { getApp, getApps, initializeApp } from "firebase/app";
import {
  Firestore,
  initializeFirestore,
  getFirestore,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyA-jfLwkFtOcdZzWxY6RmxKpNYE6H6j0oA",
  authDomain: "taskmint-cfc5a.firebaseapp.com",
  projectId: "taskmint-cfc5a",
  storageBucket: "taskmint-cfc5a.firebasestorage.app",
  messagingSenderId: "462062199992",
  appId: "1:462062199992:android:a44a27da46b68924a7c04d",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

let dbInstance: Firestore;
try {
  // Long polling keeps Firestore reliable on React Native where gRPC streams fail.
  dbInstance = initializeFirestore(app, {
    experimentalAutoDetectLongPolling: true,
  });
} catch {
  dbInstance = getFirestore(app);
}

export const db = dbInstance;
export { app };
