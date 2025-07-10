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
    let index = 1;

    for (const doc of snapshot.docs) {
      const { s3Key } = doc.data();

      // ✅ Skip Firebase-hosted images to avoid 403
      if (!s3Key || s3Key.includes("firebasestorage.googleapis.com")) {
        console.warn(`⏭️ Skipping Firebase image: ${s3Key}`);
        continue;
      }

      console.log(`📂 Zipping S3 key: ${s3Key}`);

      try {
        const s3Stream = s3
          .getObject({ Bucket: process.env.AWS_S3_BUCKET, Key: s3Key })
          .createReadStream();

        s3Stream.on("error", (s3Err) => {
          console.error(`S3 stream error for key ${s3Key}:`, s3Err);
          archive.abort();
          if (!res.headersSent) {
            res.status(500).json({ message: "Failed to read image from S3" });
          } else {
            res.end();
          }
        });

        const idxStr = index.toString().padStart(3, "0");
        const fileName = `${groupName}_${idxStr}.jpg`;

        archive.append(s3Stream, { name: `${folderName}${fileName}` });
        index += 1;
      } catch (err) {
        console.error(`❌ Error appending ${s3Key} to ZIP:`, err);
      }
    }

    try {
      await archive.finalize();
    } catch (finalizeErr) {
      console.error("Archive finalize error:", finalizeErr);
      if (!res.headersSent) {
        res.status(500).json({ message: "Failed to finalize ZIP." });
      }
    }
  } catch (err) {
    console.error("ZIP download error:", err);
    if (!res.headersSent) {
      res.status(500).json({ message: "Failed to download ZIP." });
    }
  }
});

module.exports = router;
