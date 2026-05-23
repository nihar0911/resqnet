import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyAsMYoxVcXxg7sWANs4kxMSaWobIte6raM",
  authDomain: "solo-5b458.firebaseapp.com",
  databaseURL: "https://solo-5b458-default-rtdb.firebaseio.com",
  projectId: "solo-5b458",
  storageBucket: "solo-5b458.firebasestorage.app",
  messagingSenderId: "567442228309",
  appId: "1:567442228309:web:7406eb04beb0daf7f500dc",
  measurementId: "G-851CFQWRJN"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = typeof window !== 'undefined' ? getAnalytics(app) : null;
export const database = getDatabase(app);
