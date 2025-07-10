const express = require("express");
const AWS = require("aws-sdk");
const archiver = require("archiver");
const admin = require("firebase-admin");

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
  console.log(`📦 Download group route called for groupId: ${groupId}`);

  try {
    const snapshot = await db
      .collection("images")
      .where("groupId", "==", groupId)
      .orderBy("timestamp", "asc")
      .get();

    if (snapshot.empty) {
      console.log(`⚠️ No images found for groupId: ${groupId}`);
      return res.status(404).json({ message: "No images found." });
    }

    const groupName = snapshot.docs[0].data().groupName || groupId;
    console.log(`✅ Found ${snapshot.size} images for group: ${groupName}`);

    res.type("zip");
    res.attachment(`${groupName}.zip`);

    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.on("error", (archiveErr) => {
      console.error("Archiver error:", archiveErr);
      if (!res.headersSent) {
        res.status(500).json({ message: "Archive generation failed." });
      }
    });
    archive.pipe(res);

    res.on("error", (streamErr) => {
      console.error("Response streaming error:", streamErr);
    });

    const folderName = `${groupName}/`;

    // ✅ Collect all S3 streams as promises
    const streamPromises = snapshot.docs.map((doc, index) => {
      const { s3Key } = doc.data();

      if (!s3Key || s3Key.includes("firebasestorage.googleapis.com")) {
        console.warn(`⏭️ Skipping Firebase image: ${s3Key}`);
        return Promise.resolve(); // skip
      }

      const idxStr = (index + 1).toString().padStart(3, "0");
      const fileName = `${groupName}_${idxStr}.jpg`;

      return new Promise((resolve, reject) => {
        const s3Stream = s3
          .getObject({ Bucket: process.env.AWS_S3_BUCKET, Key: s3Key })
          .createReadStream();

        s3Stream.on("error", (err) => {
          console.error(`S3 stream error for key ${s3Key}:`, err);
          reject(err);
        });

        archive.append(s3Stream, { name: `${folderName}${fileName}` });
        s3Stream.on("end", resolve);
      });
    });

    // ✅ Wait for all streams before finalizing ZIP
    Promise.all(streamPromises)
      .then(() => archive.finalize())
      .catch((err) => {
        console.error("Error during ZIP creation:", err);
        if (!res.headersSent) {
          res.status(500).json({ message: "Failed to stream images." });
        } else {
          res.end();
        }
      });
  } catch (err) {
    console.error("ZIP download error:", err);
    if (!res.headersSent) {
      res.status(500).json({ message: "Failed to download ZIP." });
    }
  }
});

module.exports = router;
