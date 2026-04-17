/**
 * detectFileInfo.js
 * ─────────────────────────────────────────────────────────────
 * Mendeteksi jumlah halaman, word count, dan mengekstrak teks
 * dari file PDF, DOCX, dan TXT secara akurat.
 * ─────────────────────────────────────────────────────────────
 */

const fs = require("fs");
const path = require("path");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");

// ──────────────────────── Constants ────────────────────────
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
const WORDS_PER_PAGE = 250; // Standard academic page
const CHARS_PER_PAGE = 2000; // For TXT estimation

const SUPPORTED_MIME_TYPES = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "text/plain": "txt",
};

// ──────────────────────── Helpers ────────────────────────

/**
 * Count words in a text string
 * @param {string} text
 * @returns {number}
 */
function countWords(text) {
  if (!text || typeof text !== "string") return 0;
  return text
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0).length;
}

/**
 * Detect file type from extension (fallback for mime type)
 * @param {string} filePath
 * @returns {string} - "pdf" | "docx" | "txt"
 */
function detectTypeFromExtension(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".pdf":
      return "pdf";
    case ".docx":
      return "docx";
    case ".txt":
      return "txt";
    default:
      return null;
  }
}

/**
 * Validate file before processing
 * @param {string} filePath
 * @returns {{ valid: boolean, error?: string, size?: number }}
 */
function validateFile(filePath) {
  // Check file exists
  if (!fs.existsSync(filePath)) {
    return { valid: false, error: "File tidak ditemukan." };
  }

  // Check file stats
  const stats = fs.statSync(filePath);

  // Check if empty
  if (stats.size === 0) {
    return { valid: false, error: "File kosong (0 bytes)." };
  }

  // Check size limit
  if (stats.size > MAX_FILE_SIZE) {
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `File terlalu besar (${sizeMB} MB). Maksimum 50 MB.`,
    };
  }

  return { valid: true, size: stats.size };
}

// ──────────────────────── PDF Parser ────────────────────────

/**
 * Extract info from PDF file
 * @param {string} filePath
 * @returns {Promise<{ pages: number, wordCount: number, text: string }>}
 */
async function parsePDF(filePath) {
  const buffer = fs.readFileSync(filePath);

  try {
    const data = await pdfParse(buffer);

    const pages = data.numpages || 1;
    const text = data.text || "";
    const wordCount = countWords(text);

    // Check if PDF might be encrypted/password-protected
    // pdf-parse will throw on truly locked PDFs, but some are "empty" when encrypted
    if (pages > 0 && text.trim().length === 0) {
      console.warn(
        "[PDF] Peringatan: PDF memiliki halaman tetapi tidak ada teks yang bisa diekstrak. " +
          "File mungkin berisi gambar-only atau terenkripsi."
      );
    }

    return {
      pages,
      wordCount,
      text,
    };
  } catch (err) {
    // Handle encrypted/password-protected PDF
    if (
      err.message &&
      (err.message.includes("password") ||
        err.message.includes("encrypted") ||
        err.message.includes("Password"))
    ) {
      throw new Error(
        "File PDF dilindungi password. Silakan hapus proteksi terlebih dahulu."
      );
    }

    // Handle corrupted PDF
    if (
      err.message &&
      (err.message.includes("Invalid") ||
        err.message.includes("not a PDF") ||
        err.message.includes("stream"))
    ) {
      throw new Error(
        "File PDF rusak atau tidak valid. Silakan upload ulang."
      );
    }

    throw new Error(`Gagal membaca file PDF: ${err.message}`);
  }
}

// ──────────────────────── DOCX Parser ────────────────────────

/**
 * Extract info from DOCX file
 * @param {string} filePath
 * @returns {Promise<{ pages: number, wordCount: number, text: string }>}
 */
async function parseDOCX(filePath) {
  try {
    const result = await mammoth.extractRawText({ path: filePath });
    const text = result.value || "";
    const wordCount = countWords(text);

    // Estimate pages: 250 words per page (standard academic)
    const pages = Math.max(1, Math.ceil(wordCount / WORDS_PER_PAGE));

    // Log any conversion warnings
    if (result.messages && result.messages.length > 0) {
      result.messages.forEach((msg) => {
        console.warn(`[DOCX] Warning: ${msg.message}`);
      });
    }

    return {
      pages,
      wordCount,
      text,
    };
  } catch (err) {
    // Handle corrupted DOCX
    if (
      err.message &&
      (err.message.includes("Could not find") ||
        err.message.includes("corrupt") ||
        err.message.includes("End of data"))
    ) {
      throw new Error(
        "File DOCX rusak atau tidak valid. Silakan upload ulang."
      );
    }

    throw new Error(`Gagal membaca file DOCX: ${err.message}`);
  }
}

// ──────────────────────── TXT Parser ────────────────────────

/**
 * Extract info from TXT file
 * @param {string} filePath
 * @returns {Promise<{ pages: number, wordCount: number, text: string }>}
 */
async function parseTXT(filePath) {
  try {
    const text = fs.readFileSync(filePath, "utf-8");
    const wordCount = countWords(text);
    const charCount = text.length;

    // Estimate pages: 2000 chars per page
    const pages = Math.max(1, Math.ceil(charCount / CHARS_PER_PAGE));

    return {
      pages,
      wordCount,
      text,
    };
  } catch (err) {
    // Handle encoding issues
    if (err.message && err.message.includes("encoding")) {
      throw new Error(
        "File TXT menggunakan encoding yang tidak didukung."
      );
    }

    throw new Error(`Gagal membaca file TXT: ${err.message}`);
  }
}

// ──────────────────────── Main Function ────────────────────────

/**
 * Detect file info (pages, word count, extracted text)
 *
 * @param {string} filePath - Absolute path to the uploaded file
 * @param {string} mimeType - MIME type of the file (optional, will detect from extension)
 * @returns {Promise<{
 *   pages: number,
 *   wordCount: number,
 *   text: string,
 *   fileType: string,
 *   fileSize: number
 * }>}
 */
async function detectFileInfo(filePath, mimeType) {
  // ── Step 1: Validate file ──
  const validation = validateFile(filePath);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  // ── Step 2: Determine file type ──
  let fileType = null;

  // Try mime type first
  if (mimeType && SUPPORTED_MIME_TYPES[mimeType]) {
    fileType = SUPPORTED_MIME_TYPES[mimeType];
  }

  // Fallback to extension detection
  if (!fileType) {
    fileType = detectTypeFromExtension(filePath);
  }

  if (!fileType) {
    throw new Error(
      `Format file tidak didukung. Gunakan PDF, DOCX, atau TXT.`
    );
  }

  // ── Step 3: Parse file based on type ──
  let result;

  switch (fileType) {
    case "pdf":
      result = await parsePDF(filePath);
      break;
    case "docx":
      result = await parseDOCX(filePath);
      break;
    case "txt":
      result = await parseTXT(filePath);
      break;
    default:
      throw new Error(`Parser untuk tipe "${fileType}" belum tersedia.`);
  }

  // ── Step 4: Return enriched result ──
  return {
    ...result,
    fileType,
    fileSize: validation.size,
  };
}

// ──────────────────────── Select Price Plan ────────────────────────

/**
 * Select pricing plan based on page count
 * @param {number} pages
 * @returns {{ name: string, price: number, label: string }}
 */
function selectPlan(pages) {
  if (pages <= 30) {
    return {
      name: "Starter",
      price: 3000,
      label: "1–30 halaman",
    };
  }
  if (pages <= 100) {
    return {
      name: "Standard",
      price: 12000,
      label: "31–100 halaman",
    };
  }
  return {
    name: "Pro",
    price: 25000,
    label: "101+ halaman",
  };
}

// ──────────────────────── Exports ────────────────────────

module.exports = {
  detectFileInfo,
  selectPlan,
  countWords,
  validateFile,
  parsePDF,
  parseDOCX,
  parseTXT,
  MAX_FILE_SIZE,
  SUPPORTED_MIME_TYPES,
};
