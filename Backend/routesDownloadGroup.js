const express = require("express");
const archiver = require("archiver");
const { PassThrough } = require("stream");
const { GetObjectCommand, HeadObjectCommand } = require("@aws-sdk/client-s3");

const { db } = require("./firebaseAdmin");
const { s3, bucketName } = require("./aws/s3Client");

const router = express.Router();

// Optional: S3_UPLOAD_PREFIX=images/ (defaults to uploads/)
const RAW_PREFIX = process.env.S3_UPLOAD_PREFIX || "uploads/";
const UPLOAD_PREFIX = RAW_PREFIX.endsWith("/") ? RAW_PREFIX : `${RAW_PREFIX}/`;
const ACCEPT_PREFIXES = Array.from(new Set([UPLOAD_PREFIX, "images/"]));

const IMAGE_FIELDS = ["groupId", "groupID", "group", "groupName", "name"]; // common variations seen in historical data

function ciIncludes(hay, needle) {
  return String(hay || "").toLowerCase().includes(String(needle || "").toLowerCase());
}

/* ------------------------------ helpers ------------------------------ */
function safeName(str) {
  return String(str).replace(/[\\/:*?"<>|]/g, "_").trim() || "file";
}

function extFromKey(key) {
  const last = (key || "").split("/").pop() || "";
  const i = last.lastIndexOf(".");
  if (i > -1 && i < last.length - 1) {
    const ext = last.slice(i + 1).toLowerCase();
    if (ext.length <= 10) return ext;
  }
  return "jpg";
}

// Accept raw keys and full S3 URLs; return a normalized key
function normalizeS3Key(k) {
  if (!k || typeof k !== "string") return null;
  k = k.trim(); // removes stray \n, spaces, etc.

  if (/^https?:\/\//i.test(k)) {
    try {
      const u = new URL(k);
      const host = (u.host || "").toLowerCase();
      const isAmazon = host.includes(".s3.") || host === "s3.amazonaws.com" || host.startsWith("s3.");
      if (!isAmazon) return null; // not our S3

      let path = (u.pathname || "/").trim();
      path = path.startsWith("/") ? path.slice(1) : path;
      const parts = path.split("/");
      if (parts[0] && bucketName && parts[0].toLowerCase() === bucketName.toLowerCase()) {
        parts.shift(); // strip "<bucket>/"
      }
      return parts.join("/");
    } catch {
      return null;
    }
  }
  return k;
}

function s3KeyEligible(k) {
  const key = normalizeS3Key(k);
  if (!key) return false;
  const wasUrl = /^https?:\/\//i.test(String(k));
  return wasUrl ? true : ACCEPT_PREFIXES.some((p) => key.startsWith(p));
}

function normalizeId(str) {
  return String(str || "")
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

// Generate candidate strings for matching group ids/names robustly
function makeCandidates(raw) {
  const base = String(raw || "").trim();
  const plusToSpace = base.replace(/\+/g, " ");

  const stripTrailingCounter = (s) => s.replace(/([ _-])\d{1,4}$/, ""); // "_001", "-02", " 7"
  const toUnderscore = (s) => s.replace(/\s+/g, "_");
  const toSpace = (s) => s.replace(/_/g, " ");
  const compact = (s) => s.replace(/[\s_]+/g, "");

  const seeds = [base, plusToSpace, toSpace(base), toUnderscore(base), compact(base)];
  const stripped = seeds.flatMap((s) => [
    stripTrailingCounter(s),
    toSpace(stripTrailingCounter(s)),
    toUnderscore(stripTrailingCounter(s)),
    compact(stripTrailingCounter(s)),
  ]);

  const all = [...seeds, ...stripped].filter(Boolean);
  const map = new Map();
  for (const s of all) {
    const n = normalizeId(s);
    if (!n) continue;
    if (!map.has(n)) map.set(n, s);
  }
  const out = new Set([...map.values(), ...map.keys()]);
  return Array.from(out);
}

// fetch docs where a field == value from both top-level images and any subcollection named "images"
async function queryImagesByFieldAndValue(field, value) {
  const out = [];
  try {
    const snap = await db.collection("images").where(field, "==", value).get();
    out.push(...snap.docs);
  } catch {}
  try {
    const cg = await db.collectionGroup("images").where(field, "==", value).get();
    out.push(...cg.docs);
  } catch {}
  return out;
}

async function unionDocsForValue(value) {
  const map = new Map(); // key: doc.ref.path
  for (const f of IMAGE_FIELDS) {
    const docs = await queryImagesByFieldAndValue(f, value);
    for (const d of docs) {
      const key = d.ref?.path || d.id;
      if (!map.has(key)) map.set(key, d);
    }
  }
  return Array.from(map.values());
}

// Get imageGroups by id or matching fields; we'll also use them to read subcollection images
async function getGroupDocsByCandidates(cands) {
  const hits = [];
  for (const cid of cands) {
    // 1) try direct doc id
    try {
      const byId = await db.collection("imageGroups").doc(cid).get();
      if (byId.exists) hits.push(byId);
    } catch {}

    // 2) try fields (groupId / groupName)
    try {
      let snap = await db.collection("imageGroups").where("groupId", "==", cid).limit(1).get();
      if (snap.empty) {
        snap = await db.collection("imageGroups").where("groupName", "==", cid).limit(1).get();
      }
      if (!snap.empty) hits.push(snap.docs[0]);
    } catch {}
  }
  return hits;
}

async function readSubcollectionImages(groupDoc) {
  const ref = db.collection("imageGroups").doc(groupDoc.id).collection("images");
  const snap = await ref.get();
  return snap.docs;
}

function dedupeByNormalizedKey(docs) {
  const out = [];
  const seen = new Set();
  for (const d of docs) {
    const data = d.data() || {};
    const nk = normalizeS3Key(data.s3Key);
    const key = nk || `path:${d.ref.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(d);
  }
  return out;
}

async function unionDocsForCandidates(cands) {
  const map = new Map();
  // 1) Top-level images (and any subcollections where field==value)
  for (const c of cands) {
    const docs = await unionDocsForValue(c);
    for (const d of docs) if (!map.has(d.ref.path)) map.set(d.ref.path, d);
  }
  // 2) PLUS: images subcollection under matched imageGroups (no field filter)
  const groups = await getGroupDocsByCandidates(cands);
  for (const g of groups) {
    const sub = await readSubcollectionImages(g);
    for (const d of sub) if (!map.has(d.ref.path)) map.set(d.ref.path, d);
  }
  return Array.from(map.values());
}

function sortImageDocs(docs) {
  return docs.slice().sort((a, b) => {
    const da = a.data() || {};
    const dbb = b.data() || {};
    const ta = da.timestamp?.seconds ?? da.timestamp?._seconds ?? 0;
    const tb = dbb.timestamp?.seconds ?? dbb.timestamp?._seconds ?? 0;
    if (ta !== tb) return ta - tb;
    const ka = (da.s3Key || "").toString();
    const kb = (dbb.s3Key || "").toString();
    if (ka !== kb) return ka.localeCompare(kb);
    return (a.ref?.path || a.id).localeCompare(b.ref?.path || b.id);
  });
}

/* ----------------------------- diagnostics ----------------------------- */
// GET /download-group/check/:groupId
router.get("/check/:groupId", async (req, res) => {
  try {
    const raw = decodeURIComponent(req.params.groupId || "").trim();
    const candidates = makeCandidates(raw);

    let docs = await unionDocsForCandidates(candidates);
    const before = docs.length;
    docs = dedupeByNormalizedKey(docs);

    if (docs.length === 0) return res.json({ ok: false, reason: "no images matched" });

    const results = [];
    for (const d of docs) {
      const data = d.data() || {};
      const rawKey = data.s3Key ?? null;
      const key = normalizeS3Key(rawKey);
      const eligible = s3KeyEligible(rawKey);
      let exists = false, contentLength = null, err = null;
      if (key && eligible) {
        try {
          const head = await s3.send(new HeadObjectCommand({ Bucket: bucketName, Key: key }));
          exists = true;
          contentLength = head.ContentLength ?? null;
        } catch (e) {
          err = e?.name || e?.message || String(e);
        }
      } else {
        err = key ? "ineligible key (filtered by prefix or non-s3)" : "invalid/empty/non-S3 key";
      }
      results.push({
        path: d.ref.path,
        groupId: data.groupId ?? data.groupID ?? data.group ?? null,
        groupName: data.groupName ?? null,
        s3Key: rawKey,
        normalizedKey: key,
        eligible,
        exists,
        contentLength,
        err,
      });
    }
    res.json({
      ok: true,
      bucket: bucketName,
      foundBeforeDedupe: before,
      count: results.length,
      results,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* ------------------------------- DEBUG (temporary) ------------------------------ */
// GET /download-group/debug/:groupId
router.get("/debug/:groupId", async (req, res) => {
  const raw0 = decodeURIComponent(req.params.groupId || "");
  const raw = raw0.trim();
  const candidates = makeCandidates(raw);
  try {
    let imageDocs = await unionDocsForCandidates(candidates);
    const before = imageDocs.length;
    imageDocs = dedupeByNormalizedKey(imageDocs);
    const after = imageDocs.length;
    const elig = imageDocs.filter((d) => s3KeyEligible((d.data() || {}).s3Key));
    res.json({
      raw,
      candidates,
      counts: { before, after, eligible: elig.length },
      samples: elig.slice(0, 5).map((d) => ({ id: d.id, ...d.data() })),
    });
  } catch (e) {
    res.status(500).json({ error: e.message, raw, candidates });
  }
});

/* ------------------------------- ZIP route ------------------------------ */
// GET /download-group/find?q=...
router.get("/find", async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    if (!q) return res.status(400).json({ error: "missing q" });

    const snap = await db.collection("images").limit(500).get(); // small scan for dev
    const hits = [];
    for (const doc of snap.docs) {
      const data = doc.data() || {};
      for (const f of IMAGE_FIELDS) {
        if (ciIncludes(data[f], q)) {
          hits.push({
            id: doc.id,
            matchedField: f,
            groupId: data.groupId ?? data.groupID ?? data.group ?? null,
            groupName: data.groupName ?? null,
            name: data.name ?? null,
            s3Key: data.s3Key ?? null,
            timestamp: data.timestamp ?? null,
          });
          break;
        }
      }
      if (hits.length >= 25) break;
    }
    res.json({ q, count: hits.length, hits });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /download-group/:groupId
router.get("/:groupId", async (req, res) => {
  const raw0 = decodeURIComponent(req.params.groupId || "");
  const raw = raw0.trim();
  const candidates = makeCandidates(raw);

  try {
    console.log("🔍 Group download requested:", raw);
    console.log("🔎 Candidates to check:", candidates);

    let imageDocs = await unionDocsForCandidates(candidates);
    console.log("🧮 Docs found before dedupe:", imageDocs.length);

    imageDocs = dedupeByNormalizedKey(imageDocs);
    console.log("🧮 Docs after dedupe:", imageDocs.length);

    if (imageDocs.length === 0) {
      return res.status(404).json({ message: "No images found for this group." });
    }

    imageDocs = imageDocs.filter((d) => s3KeyEligible((d.data() || {}).s3Key));
    console.log("🧮 Docs after S3-eligibility filter:", imageDocs.length);

    if (imageDocs.length === 0) {
      return res.status(404).json({ message: "No downloadable files for this group." });
    }

    imageDocs = sortImageDocs(imageDocs);

    // Resolve a nice groupName for the ZIP
    const first = imageDocs[0].data() || {};
    const groupDocs = await getGroupDocsByCandidates(candidates);
    const canonicalIds = new Set(groupDocs.map((d) => d.data()?.groupId || d.id));

    const groupIdCandidate = first.groupId ?? first.groupID ?? first.group ?? [...canonicalIds][0] ?? raw;
    let groupName = first.groupName || groupIdCandidate;
    if (groupDocs.length) {
      const gd = groupDocs[0].data() || {};
      groupName = gd.groupName || groupName;
    } else {
      try {
        const grpDoc = await db.collection("imageGroups").doc(groupIdCandidate).get();
        if (grpDoc.exists && grpDoc.data()?.groupName) groupName = grpDoc.data().groupName;
      } catch {}
    }
    groupName = safeName(groupName);

    if (!bucketName) {
      return res.status(500).json({ message: "AWS_S3_BUCKET is not defined in .env" });
    }

    // preflight: ensure at least one object exists
    let ok = false;
    for (const d of imageDocs) {
      const key = normalizeS3Key((d.data() || {}).s3Key);
      if (!key) continue;
      try {
        await s3.send(new HeadObjectCommand({ Bucket: bucketName, Key: key }));
        ok = true; break;
      } catch {}
    }
    if (!ok) {
      return res.status(404).json({ message: "No downloadable files for this group." });
    }

    // ZIP headers
    const filename = `${groupName}.zip`;
    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${safeName(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`
    );

    const archive = archiver("zip", { zlib: { level: 9 } });
    req.on("aborted", () => { console.warn("⚠️ Client aborted download."); archive.abort(); });
    archive.on("error", (err) => {
      console.error("❌ Archiver error:", err);
      if (!res.headersSent) res.status(500).send("Archive error.");
      try { res.end(); } catch {}
    });
    archive.on("finish", () => console.log("✅ Archive stream finished."));
    archive.pipe(res);

    let fileIndex = 0;
    for (const d of imageDocs) {
      const data = d.data() || {};
      const key = normalizeS3Key(data.s3Key);
      if (!key) { console.warn("⚠️ Skipping invalid/non-S3 key:", data.s3Key); continue; }

      try {
        const obj = await s3.send(new GetObjectCommand({ Bucket: bucketName, Key: key }));
        if (!obj.Body) { console.warn("⚠️ Empty S3 body for:", key); continue; }

        const nameInZip = `${groupName}/${groupName}_${String(++fileIndex).padStart(3, "0")}.${extFromKey(key)}`;
        const passthrough = new PassThrough();
        obj.Body.pipe(passthrough);
        archive.append(passthrough, { name: nameInZip });
        console.log("🧩 Added to archive:", key, "→", nameInZip);
      } catch (err) {
        console.error("❌ S3 fetch failed:", key, err?.message || err);
      }
    }

    if (fileIndex === 0) {
      console.warn("⚠️ Nothing was added to the archive.");
      archive.abort();
      try { res.end(); } catch {}
      return;
    }

    await archive.finalize();
    console.log("✅ Archive finalized and sent.");
  } catch (err) {
    console.error("❌ Error in download group route:", err);
    if (!res.headersSent) res.status(500).json({ message: "Failed to download group ZIP." });
    else try { res.end(); } catch {}
  }
});

module.exports = router;
