import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getAuth, signInAnonymously } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyD8T63dMy-7Tl66_0s9iFS58wCDVu3Sp8s',
  authDomain: 'link-burst.firebaseapp.com',
  projectId: 'link-burst',
  storageBucket: 'link-burst.firebasestorage.app',
  messagingSenderId: '1001062618092',
  appId: '1:1001062618092:web:28732d62592406ad3426c9',
  measurementId: 'G-JD23TCY7FD'
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Future online-room code awaits this promise before accessing Firestore.
window.firebaseReady = signInAnonymously(auth)
  .then(({ user }) => {
    window.firebaseServices = { app, auth, db, uid: user.uid };
    console.info('Firebase anonymous sign-in succeeded.', user.uid);
    return window.firebaseServices;
  })
  .catch((error) => {
    console.error('Firebase anonymous sign-in failed.', error);
    throw error;
  });
