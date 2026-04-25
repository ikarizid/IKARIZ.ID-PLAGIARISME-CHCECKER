/**
 * upload.js — Route: POST /api/upload
 * ─────────────────────────────────────────────────────────────
 * Menerima file upload dan mengembalikan metadata file
 * ─────────────────────────────────────────────────────────────
 */

const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const { detectFileInfo, selectPlan } = require("../utils/detectFileInfo");

const router = express.Router();

// ──────────────────────── Config Multer ────────────────────────
const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOAD_DIR);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    const fileId = `file_${Date.now()}_${uuidv4().substring(0, 8)}${ext}`;
    cb(null, fileId);
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const allowedExtensions = [".pdf", ".docx", ".txt"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Tipe file tidak didukung: ${ext}`), false);
    }
  },
});

// ──────────────────────── Route POST /api/upload ────────────────────────
router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: "File tidak ditemukan" });
    }

    const { filename, originalname, size, path: filepath } = req.file;
    const fileSizeMB = Math.round((size / (1024 * 1024)) * 10) / 10;

    // Detect pages accurately using existing utility
    const fileInfo = await detectFileInfo(filepath, req.file.mimetype);

    const plan = selectPlan(fileInfo.pages);

    res.status(200).json({
      success: true,
      fileId: filename,
      fileName: originalname,
      fileSizeMB,
      pageCount: fileInfo.pages,
      detectedPlan: plan,
    });
  } catch (err) {
    console.error("[Upload] Error:", err.message);
    res.status(500).json({
      success: false,
      error: "Gagal memproses upload file. " + err.message,
    });
  }
});

module.exports = router;
