// Backend/downloadMultipleGroups.js
// Download multiple image groups as a single ZIP

const express = require("express");
const archiver = require("archiver");
const { PassThrough } = require("stream");
const {
  GetObjectCommand,
  HeadObjectCommand,
} = require("@aws-sdk/client-s3");

const { db } = require("./firebaseAdmin");            // Firestore (company project)
const { s3, bucketName } = require("./aws/s3Client"); // Shared S3 v3 client

const router = express.Router();

// Optional: override in .env (default 'uploads/')
const RAW_PREFIX = process.env.S3_UPLOAD_PREFIX || "uploads/";
const UPLOAD_PREFIX = RAW_PREFIX.endsWith("/") ? RAW_PREFIX : `${RAW_PREFIX}/`;

// Basic name sanitizer for files/folders inside the zip
function safeName(str) {
  return String(str).replace(/[\\/:*?"<>|]/g, "_").trim() || "file";
}

// Derive file extension from an S3 key, fallback to jpg
function extFromKey(key) {
  const last = (key.split("/").pop() || "").trim();
  const dot = last.lastIndexOf(".");
  if (dot > -1 && dot < last.length - 1) {
    const ext = last.slice(dot + 1).toLowerCase();
    if (ext.length <= 10) return ext;
  }
  return "jpg";
}

router.post("/", async (req, res) => {
  try {
    const { groupIds } = req.body || {};
    if (!Array.isArray(groupIds) || groupIds.length === 0) {
      return res.status(400).json({ error: "Invalid groupIds" });
    }
    if (!bucketName) {
      return res.status(500).json({ error: "AWS_S3_BUCKET is not configured" });
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // 1) Build a plan: for each group, gather S3 keys + a sanitized group name
    // ─────────────────────────────────────────────────────────────────────────────
    const groupsPlan = [];
    for (const groupId of groupIds) {
      // Fetch images for this group (ordered)
      const imageSnap = await db
        .collection("images")
        .where("groupId", "==", groupId)
        .orderBy("timestamp", "asc")
        .get();

      if (imageSnap.empty) {
        console.warn(`ℹ️ No images for group ${groupId}, skipping.`);
        continue;
      }

      // Determine group display name: imageGroups/<id>.groupName, else first image.groupName, else id
      let displayName = groupId;
      try {
        const metaDoc = await db.collection("imageGroups").doc(groupId).get();
        if (metaDoc.exists && metaDoc.data()?.groupName) {
          displayName = metaDoc.data().groupName;
        } else if (imageSnap.docs[0].data()?.groupName) {
          displayName = imageSnap.docs[0].data().groupName;
        }
      } catch (e) {
        console.warn(`⚠️ Could not read imageGroups doc for ${groupId}:`, e?.message);
        if (imageSnap.docs[0].data()?.groupName) {
          displayName = imageSnap.docs[0].data().groupName;
        }
      }
      const groupName = safeName(displayName);

      // Collect S3 keys under the configured prefix
      const keys = imageSnap.docs
        .map((d) => d.data()?.s3Key)
        .filter((k) => typeof k === "string" && k.startsWith(UPLOAD_PREFIX));

      if (!keys.length) {
        console.warn(`ℹ️ No valid S3 keys for group ${groupId}, skipping.`);
        continue;
      }

      groupsPlan.push({ groupId, groupName, keys });
    }

    if (groupsPlan.length === 0) {
      return res.status(404).json({ error: "No downloadable files for the selected groups." });
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // 2) Preflight check: ensure at least one S3 object exists before sending headers
    // ─────────────────────────────────────────────────────────────────────────────
    let hasAtLeastOneObject = false;
    outer: for (const g of groupsPlan) {
      for (const key of g.keys) {
        try {
          await s3.send(new HeadObjectCommand({ Bucket: bucketName, Key: key }));
          hasAtLeastOneObject = true;
          break outer;
        } catch {
          // continue scanning
        }
      }
    }
    if (!hasAtLeastOneObject) {
      return res.status(404).json({ error: "No downloadable files for the selected groups." });
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // 3) Prepare ZIP response (send headers only after preflight success)
    // ─────────────────────────────────────────────────────────────────────────────
    const zipName = "enviroshake_selected_groups.zip";
    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${safeName(zipName)}"; filename*=UTF-8''${encodeURIComponent(zipName)}`
    );

    const archive = archiver("zip", { zlib: { level: 9 } });

    // Clean abort if client disconnects
    req.on("aborted", () => {
      console.warn("⚠️ Client aborted multi-group download; aborting archive.");
      archive.abort();
    });

    archive.on("error", (err) => {
      console.error("❌ Archiver error:", err);
      if (!res.headersSent) res.status(500).send("Archive error.");
      try { res.end(); } catch (_) {}
    });

    archive.on("finish", () => console.log("✅ Multi-group archive stream finished."));
    archive.pipe(res);

    // ─────────────────────────────────────────────────────────────────────────────
    // 4) Stream each group's S3 objects into the ZIP
    // ─────────────────────────────────────────────────────────────────────────────
    let totalAdded = 0;

    for (const g of groupsPlan) {
      let idx = 0;

      for (const s3Key of g.keys) {
        try {
          const obj = await s3.send(
            new GetObjectCommand({ Bucket: bucketName, Key: s3Key })
          );

          if (!obj.Body) {
            console.warn("⚠️ Empty S3 body for key:", s3Key);
            continue;
          }

          const ext = extFromKey(s3Key);
          const padded = String(++idx).padStart(3, "0");
          const nameInZip = `${g.groupName}/${g.groupName}_${padded}.${ext}`;

          const passthrough = new PassThrough();
          obj.Body.pipe(passthrough);
          archive.append(passthrough, { name: nameInZip });

          totalAdded++;
          console.log("✅ Added:", s3Key, "→", nameInZip);
        } catch (err) {
          console.error(`❌ S3 fetch failed for key ${s3Key}:`, err?.message || err);
          // continue with others
        }
      }
    }

    if (totalAdded === 0) {
      console.warn("⚠️ No files were successfully added to the multi-group archive.");
      archive.abort();
      try { res.end(); } catch (_) {}
      return;
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // 5) Finalize ZIP
    // ─────────────────────────────────────────────────────────────────────────────
    await archive.finalize();
  } catch (err) {
    console.error("❌ Error generating multi-group ZIP:", err);
    if (!res.headersSent) res.status(500).send("Error generating ZIP");
    else {
      try { res.end(); } catch (_) {}
    }
  }
});

module.exports = router;
