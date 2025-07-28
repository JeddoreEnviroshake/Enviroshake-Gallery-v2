const express = require("express");
const AWS = require("aws-sdk");
const archiver = require("archiver");
const admin = require("firebase-admin");
require("dotenv").config();

const db = admin.firestore();
const router = express.Router();

const s3 = new AWS.S3({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

router.get("/:groupId", async (req, res) => {
  const { groupId } = req.params;

  try {
    const snapshot = await db
      .collection("images")
      .where("groupId", "==", groupId)
      .orderBy("timestamp", "asc")
      .get();

    if (snapshot.empty) {
      console.warn(`⚠️ No images found for groupId: ${groupId}`);
      return res.status(404).json({ message: "No images found." });
    }

    const groupName = snapshot.docs[0].data().groupName || groupId;
    const folderName = `${groupName}/`;

    res.set({
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${groupName}.zip"`
    });

    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.pipe(res);

    archive.on("error", (err) => {
      console.error("❌ Archive error:", err);
      if (!res.headersSent) {
        res.status(500).json({ message: "Archive generation failed." });
      }
    });

    res.on("error", (err) => {
      console.error("❌ Response stream error:", err);
    });

    const streamPromises = snapshot.docs.map((doc, index) => {
      const { s3Key } = doc.data();

      if (!s3Key || s3Key.includes("firebasestorage.googleapis.com")) {
        console.log(`⚠️ Skipping invalid or Firebase-based key: ${s3Key}`);
        return Promise.resolve();
      }

      const fileName = `${groupName}_${String(index + 1).padStart(3, "0")}.jpg`;
      const fullPath = `${folderName}${fileName}`;

      return new Promise((resolve, reject) => {
        const s3Stream = s3
          .getObject({ Bucket: process.env.AWS_S3_BUCKET, Key: s3Key })
          .createReadStream();

        s3Stream.on("error", (err) => {
          console.error(`❌ S3 stream error for key: ${s3Key}`, err);
          reject(err);
        });

        s3Stream.on("end", () => {
          console.log(`✅ Finished streaming: ${fullPath}`);
          resolve();
        });

        archive.append(s3Stream, { name: fullPath });
      });
    });

    await Promise.all(streamPromises);
    console.log("✅ All image streams added. Finalizing ZIP...");
    await archive.finalize();

  } catch (err) {
    console.error("❌ Download route error:", err);
    if (!res.headersSent) {
      res.status(500).json({ message: "Failed to download ZIP." });
    } else {
      res.end();
    }
  }
});

module.exports = router;
