// Firebase Configuration and Initialization
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyB5uSxd29wVSWt65IQsfVBo86IQG234Nbo",
  authDomain: "smartebm-8ea35.firebaseapp.com",
  projectId: "smartebm-8ea35",
  storageBucket: "smartebm-8ea35.firebasestorage.app",
  messagingSenderId: "94063570937",
  appId: "1:94063570937:web:512243fbd8fcefc1cfd728",
  measurementId: "G-T793ST5F56"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);

console.log('🔥 Firebase initialized successfully');
