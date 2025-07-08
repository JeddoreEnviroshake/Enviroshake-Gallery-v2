// firebaseAdmin.js

const admin = require("firebase-admin");

// Initialize the default app only once
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}

module.exports = admin;
