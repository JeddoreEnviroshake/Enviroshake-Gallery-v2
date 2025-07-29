const { db } = require("./firebaseAdmin");

async function testFirestore() {
  try {
    const snapshot = await db.collection("imageGroups").limit(1).get();
    snapshot.forEach((doc) => {
      console.log("Document ID:", doc.id, "Data:", doc.data());
    });

    if (snapshot.empty) {
      console.log("No documents found in imageGroups.");
    }
  } catch (error) {
    console.error("❌ Error reading from Firestore:", error.message);
  }
}

testFirestore();
