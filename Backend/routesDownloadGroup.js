const express = require("express");
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const archiver = require("archiver");
const admin = require("firebase-admin");
const { PassThrough } = require("stream");
require("dotenv").config();

const db = admin.firestore();
const router = express.Router();

const s3Client = new S3Client({
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
        res.status(500).send("Archive generation failed.");
      }
    });

    res.on("error", (err) => {
      console.error("❌ Response stream error:", err);
    });

    for (let i = 0; i < snapshot.docs.length; i++) {
      const { s3Key } = snapshot.docs[i].data();

      if (!s3Key || s3Key.includes("firebasestorage.googleapis.com")) {
        console.log(`⚠️ Skipping invalid or Firebase-based key: ${s3Key}`);
        continue;
      }

      const fileName = `${groupName}_${String(i + 1).padStart(3, "0")}.jpg`;
      const fullPath = `${folderName}${fileName}`;

      let s3Stream;
      try {
        const data = await s3Client.send(
          new GetObjectCommand({
            Bucket: process.env.AWS_S3_BUCKET,
            Key: s3Key,
          })
        );
        s3Stream = data.Body; // data.Body is a readable stream
      } catch (err) {
        console.error(`❌ Failed to fetch object stream for key: ${s3Key}`, err);
        continue;
      }

      const passthrough = new PassThrough();

      s3Stream.on("error", (err) => {
        console.error(`❌ S3 stream error for key: ${s3Key}`, err);
        passthrough.end(); // avoid breaking archive
      });

      s3Stream.pipe(passthrough);
      archive.append(passthrough, { name: fullPath });
    }

    await archive.finalize();
    console.log("✅ Archive finalized and sent.");

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
