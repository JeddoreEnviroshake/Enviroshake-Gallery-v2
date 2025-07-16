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
    const snapshot = await db
      .collection("images")
      .where("groupId", "==", groupId)
      .orderBy("timestamp", "asc")
      .get();

    if (snapshot.empty) {
      console.log(`No images found for groupId: ${groupId}`);
      return res.status(404).json({ message: "No images found." });
    }

    const groupName = snapshot.docs[0].data().groupName || groupId;

    res.type("zip");
    res.attachment(`${groupName}.zip`);

    const archive = archiver("zip", { zlib: { level: 9 } });

    archive.on("error", (err) => {
      console.error("Archive error:", err);
      if (!res.headersSent) {
        res.status(500).json({ message: "Archive generation failed." });
      }
    });

    archive.pipe(res);

    res.on("error", (err) => {
      console.error("Response stream error:", err);
    });

    const folderName = `${groupName}/`;

    const streamPromises = snapshot.docs.map((doc, index) => {
      const { s3Key } = doc.data();

      if (!s3Key || s3Key.includes("firebasestorage.googleapis.com")) {
        console.log(`Skipping Firebase or invalid S3 key: ${s3Key}`);
        return Promise.resolve();
      }

      const idxStr = String(index + 1).padStart(3, "0");
      const fileName = `${groupName}_${idxStr}.jpg`;
      const filePath = `${folderName}${fileName}`;

      return new Promise((resolve, reject) => {
        console.log(`Adding to archive: ${filePath}`);

        const s3Stream = s3
          .getObject({ Bucket: process.env.AWS_S3_BUCKET, Key: s3Key })
          .createReadStream();

        s3Stream.on("error", (err) => {
          console.error("S3 stream error:", err);
          reject(err);
        });

        s3Stream.on("end", () => {
          console.log("Finished streaming:", filePath);
          resolve();
        });

        archive.append(s3Stream, { name: filePath });
      });
    });

    Promise.all(streamPromises)
      .then(() => {
        console.log("All streams finished. Finalizing archive...");
        return archive.finalize();
      })
      .catch((err) => {
        console.error("Streaming error:", err);
        if (!res.headersSent) {
          res.status(500).json({ message: "Failed to stream images." });
        } else {
          res.end();
        }
      });
  } catch (err) {
    console.error("Download error:", err);
    if (!res.headersSent) {
      res.status(500).json({ message: "Failed to download ZIP." });
    }
  }
});

module.exports = router;
