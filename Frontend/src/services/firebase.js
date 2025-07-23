// src/services/firebase.js

import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyDckK1T3J5YC8jmJynQW4e5KtHftcmRxgY",
  authDomain: "enviroshake-gallery-app.firebaseapp.com",
  projectId: "enviroshake-gallery-app",
  storageBucket: "enviroshake-gallery-app.appspot.com",
  messagingSenderId: "723341861159",
  appId: "1:723341861159:web:dee90443dcb1a598778902"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
