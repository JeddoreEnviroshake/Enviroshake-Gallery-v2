const express = require("express");
const router = express.Router();
const { DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { s3Client } = require("../utils/s3"); // Adjust if needed
const admin = require("firebase-admin");

router.delete("/delete-image", async (req, res) => {
  const { s3Key, docId } = req.body;

  if (!s3Key || !docId) {
    return res.status(400).json({ error: "Missing s3Key or docId" });
  }

  try {
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME,
        Key: s3Key,
      })
    );

    await admin.firestore().collection("images").doc(docId).delete();

    res.status(200).json({ message: "Image deleted successfully" });
  } catch (err) {
    console.error("Error deleting image:", err);
    res.status(500).json({ error: "Failed to delete image" });
  }
});

module.exports = router;
