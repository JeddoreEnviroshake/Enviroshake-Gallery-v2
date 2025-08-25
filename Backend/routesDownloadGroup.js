// Backend/routesDownloadGroup.js
const express = require("express");
const archiver = require("archiver");
const { PassThrough } = require("stream");
const {
  GetObjectCommand,
  HeadObjectCommand,
} = require("@aws-sdk/client-s3");

const { db } = require("./firebaseAdmin");           // Firestore (company project)
const { s3, bucketName } = require("./aws/s3Client"); // Shared S3 v3 client

const router = express.Router();

// Optional: set in .env (defaults to "uploads/")
// e.g., S3_UPLOAD_PREFIX=images/
const RAW_PREFIX = process.env.S3_UPLOAD_PREFIX || "uploads/";
const UPLOAD_PREFIX = RAW_PREFIX.endsWith("/") ? RAW_PREFIX : `${RAW_PREFIX}/`;

// Basic filename sanitization for zip entries
function safeName(str) {
  return String(str).replace(/[\\/:*?"<>|]/g, "_").trim() || "file";
}

// Derive file extension from an S3 key, fallback to jpg
function extFromKey(key) {
  const last = key.split("/").pop() || "";
  const idx = last.lastIndexOf(".");
  if (idx > -1 && idx < last.length - 1) {
    const ext = last.slice(idx + 1).toLowerCase();
    // Guard against absurdly long "extensions"
    if (ext.length <= 10) return ext;
  }
  return "jpg";
}

router.get("/:groupId", async (req, res) => {
  const raw = decodeURIComponent(req.params.groupId || "");
  const candidates = Array.from(
    new Set([raw, raw.replace(/_/g, " "), raw.replace(/\s+/g, "_")])
  );

  try {
    console.log("🔍 Group download requested:", raw);

    // Try direct image queries for each candidate
    let imagesSnap = null,
      matchedId = null,
      resolvedId = null;
    for (const cid of candidates) {
      const snap = await db
        .collection("images")
        .where("groupId", "==", cid)
        .orderBy("timestamp", "asc")
        .get();
      if (!snap.empty) {
        imagesSnap = snap;
        matchedId = cid;
        break;
      }
    }

    // Fallback: look up imageGroups
    if (!imagesSnap) {
      for (const cid of candidates) {
        let grpSnap = await db
          .collection("imageGroups")
          .where("groupId", "==", cid)
          .limit(1)
          .get();
        if (grpSnap.empty) {
          grpSnap = await db
            .collection("imageGroups")
            .where("groupName", "==", cid)
            .limit(1)
            .get();
        }

        if (!grpSnap.empty) {
          resolvedId = grpSnap.docs[0].data().groupId;
          const snap = await db
            .collection("images")
            .where("groupId", "==", resolvedId)
            .orderBy("timestamp", "asc")
            .get();
          if (!snap.empty) {
            imagesSnap = snap;
            break;
          }
        }
      }
    }

    if (!imagesSnap) {
      return res.status(404).json({ message: "No images found for this group." });
    }

    console.log(
      "download-group matched groupId:",
      matchedId || resolvedId
    );

    // 2) Filter to S3-backed images under the configured prefix
    const imageDocs = imagesSnap.docs.filter((d) => {
      const data = d.data();
      return typeof data.s3Key === "string" && data.s3Key.startsWith(UPLOAD_PREFIX);
    });

    if (imageDocs.length === 0) {
      return res.status(404).json({ message: "No downloadable files for this group." });
    }

    // 3) Resolve groupName (prefer imageGroups/<groupId>, fallback to image doc or groupId)
    const finalId = matchedId || resolvedId;
    let groupName = finalId;
    try {
      const grpDoc = await db.collection("imageGroups").doc(finalId).get();
      if (grpDoc.exists && grpDoc.data()?.groupName) {
        groupName = grpDoc.data().groupName;
      } else if (imagesSnap.docs[0].data()?.groupName) {
        groupName = imagesSnap.docs[0].data().groupName;
      }
    } catch (e) {
      // Non-fatal — we can continue with fallback name
      console.warn(
        "⚠️ Could not read imageGroups doc; using fallback name.",
        e?.message
      );
      if (imagesSnap.docs[0].data()?.groupName) {
        groupName = imagesSnap.docs[0].data().groupName;
      }
    }
    groupName = safeName(groupName);

    // 4) Ensure bucket configured
    if (!bucketName) {
      return res.status(500).json({ message: "AWS_S3_BUCKET is not defined in .env" });
    }

    // 5) Prefetch check: ensure at least one S3 object exists before sending headers
    let hasAtLeastOneObject = false;
    for (const doc of imageDocs) {
      const { s3Key } = doc.data();
      try {
        await s3.send(new HeadObjectCommand({ Bucket: bucketName, Key: s3Key }));
        hasAtLeastOneObject = true;
        break;
      } catch {
        // Keep scanning; object might have been deleted
      }
    }

    if (!hasAtLeastOneObject) {
      return res.status(404).json({ message: "No downloadable files for this group." });
    }

    // 6) Prepare ZIP response (send headers AFTER preflight success)
    res.setHeader("Content-Type", "application/zip");
    // Add RFC 5987 filename* to better support special characters
    const filename = `${groupName}.zip`;
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${safeName(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`
    );

    const archive = archiver("zip", { zlib: { level: 9 } });

    // Clean abort if client disconnects
    req.on("aborted", () => {
      console.warn("⚠️ Client aborted download; aborting archive.");
      archive.abort();
    });

    archive.on("error", (err) => {
      console.error("❌ Archiver error:", err);
      // If headers weren't sent yet, try to send a 500; otherwise just end the stream
      if (!res.headersSent) res.status(500).send("Archive error.");
      try { res.end(); } catch (_) {}
    });

    archive.on("finish", () => console.log("✅ Archive stream finished."));
    archive.pipe(res);

    // 7) Stream each S3 object into the ZIP
    let fileIndex = 0;
    for (const doc of imageDocs) {
      const { s3Key } = doc.data();

      // Skip keys that no longer match expectations
      if (typeof s3Key !== "string" || !s3Key.startsWith(UPLOAD_PREFIX)) {
        console.warn("⚠️ Skipping non-S3 or unexpected key:", s3Key);
        continue;
      }

      const ext = extFromKey(s3Key);
      const padded = String(++fileIndex).padStart(3, "0");
      const nameInZip = `${groupName}/${groupName}_${padded}.${ext}`;

      try {
        const obj = await s3.send(new GetObjectCommand({ Bucket: bucketName, Key: s3Key }));
        if (!obj.Body) {
          console.warn("⚠️ Empty S3 body for key:", s3Key);
          continue;
        }

        // Stream S3 object into the zip
        const passthrough = new PassThrough();
        obj.Body.pipe(passthrough);
        archive.append(passthrough, { name: nameInZip });

        console.log("✅ Added to archive:", s3Key, "→", nameInZip);
      } catch (err) {
        console.error(`❌ S3 fetch failed for key: ${s3Key}`, err?.message || err);
        // Continue with the rest
      }
    }

    if (fileIndex === 0) {
      // Nothing was successfully added; abort and end.
      console.warn("⚠️ No files were successfully added to the archive.");
      archive.abort();
      // Can't change status code at this point reliably; end the response.
      try { res.end(); } catch (_) {}
      return;
    }

    // 8) Finalize ZIP
    await archive.finalize();
    console.log("✅ Archive finalized and sent.");
  } catch (err) {
    console.error("❌ Error in download group route:", err);
    if (!res.headersSent) {
      res.status(500).json({ message: "Failed to download group ZIP." });
    } else {
      try { res.end(); } catch (_) {}
    }
  }
});

module.exports = router;
