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

  try {
    const snapshot = await db.collection("images").where("groupId", "==", groupId).get();

    if (snapshot.empty) {
      return res.status(404).json({ message: "No images found." });
    }

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename=${groupId}.zip`);

    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.pipe(res);

    for (const doc of snapshot.docs) {
      const { s3Key } = doc.data();
      const s3Stream = s3.getObject({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: s3Key,
      }).createReadStream();

      archive.append(s3Stream, { name: s3Key.split("/").pop() });
    }

    archive.finalize();
  } catch (err) {
    console.error("ZIP download error:", err);
    res.status(500).json({ message: "Failed to download ZIP." });
  }
});

module.exports = router;
