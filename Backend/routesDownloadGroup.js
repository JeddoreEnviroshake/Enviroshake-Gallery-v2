const express = require("express");
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const archiver = require("archiver");
const { PassThrough } = require("stream");
const { db } = require("./firebaseAdmin"); // ✅ Use shared admin/db setup
require("dotenv").config();

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
    console.log("🔍 Group ID requested:", groupId);

    const snapshot = await db
      .collection("images")
      .where("groupId", "==", groupId)
      .orderBy("timestamp", "asc")
      .get();

    if (snapshot.empty) {
      return res.status(404).json({ message: "No images found for this group." });
    }

    const groupName = snapshot.docs[0].data().groupName || groupId;
    const folderName = `${groupName}/`;

    res.set({
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${groupName}.zip"`,
    });

    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.pipe(res);

    const bucketName = process.env.AWS_S3_BUCKET;
    if (!bucketName) {
      throw new Error("❌ AWS_S3_BUCKET is not defined in .env");
    }

    for (let i = 0; i < snapshot.docs.length; i++) {
      const { s3Key } = snapshot.docs[i].data();

      if (!s3Key || typeof s3Key !== "string" || !s3Key.startsWith("uploads/")) {
        console.warn("⚠️ Skipping invalid or non-S3 image:", s3Key);
        continue;
      }

      const fileName = `${groupName}_${String(i + 1).padStart(3, "0")}.${s3Key.split('.').pop()}`;
      const fullPath = `${folderName}${fileName}`;

      try {
        const { Body } = await s3Client.send(
          new GetObjectCommand({ Bucket: bucketName, Key: s3Key })
        );

        const passthrough = new PassThrough();
        Body.pipe(passthrough);

        archive.append(passthrough, { name: fullPath });
        console.log("✅ Added to archive:", s3Key);
      } catch (err) {
        console.error(`❌ S3 fetch failed for key: ${s3Key}`, err);
      }
    }

    archive.on("error", (err) => {
      console.error("❌ Archive error:", err);
      if (!res.headersSent) res.status(500).send("Archive error.");
    });

    res.on("error", (err) => {
      console.error("❌ Response stream error:", err);
    });

    archive.on("finish", () => {
      console.log("✅ Archive stream finished.");
    });

    await archive.finalize();
    console.log("✅ Archive finalized and sent.");
  } catch (err) {
    console.error("❌ Error in download group route:", err);
    if (!res.headersSent) {
      res.status(500).json({ message: "Failed to download group ZIP." });
    } else {
      res.end();
    }
  }
});

module.exports = router;
