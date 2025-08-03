// Admin Panel Firebase Config
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';

const firebaseConfig = {
  apiKey: "AIzaSyBmUKfd_epflQSVkmvHwXbikE-SPbxlWPk",
  authDomain: "amritulya-spoonfeed.firebaseapp.com",
  projectId: "amritulya-spoonfeed",
  storageBucket: "amritulya-spoonfeed.firebasestorage.app",
  messagingSenderId: "1037457154599",
  appId: "1:1037457154599:web:e74b7f48cdbdbd7e57a402",
  measurementId: "G-PJ9BT7E06N"
};


const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
