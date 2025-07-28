const { db } = require("./firebaseAdmin");

async function testFirestore() {
  try {
    const snapshot = await db.collection("images").limit(1).get();
    snapshot.forEach((doc) => {
      console.log("✅ Firestore read success:", doc.id, doc.data());
    });
    if (snapshot.empty) {
      console.log("⚠️ Firestore connection is working, but 'images' collection is empty.");
    }
  } catch (error) {
    console.error("❌ Error reading from Firestore:", error.message);
  }
}

testFirestore();
