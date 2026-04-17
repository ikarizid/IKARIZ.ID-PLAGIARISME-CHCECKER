/**
 * processDocument.js
 * ─────────────────────────────────────────────────────────────
 * Pipeline lengkap pemrosesan dokumen setelah pembayaran
 * 
 * Alur:
 * 1. Ambil data order & file
 * 2. Ekstrak teks dari file
 * 3. Kirim ke Claude API (per paragraf)
 * 4. Aggregate hasil analisis
 * 5. Generate laporan PDF (delegasi ke reportGenerator)
 * 6. Upload hasil ke Supabase Storage
 * 7. Simpan hasil ke database
 * 8. Update status order → completed
 * ─────────────────────────────────────────────────────────────
 */

const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const { detectFileInfo } = require("../utils/detectFileInfo");
const { analyzePlagiarism } = require("../utils/claudeApi");
const {
  getOrder,
  updateOrder,
  createAnalysisJob,
  updateAnalysisJob,
  createResult,
  supabase,
} = require("../utils/database");
const { generateReportPdf } = require("../utils/pdfGenerator");

// ──────────────────────── Logger ────────────────────────

function log(orderId, step, message, type = "info") {
  const timestamp = new Date().toISOString().slice(11, 23);
  const icons = { info: "📋", success: "✅", error: "❌", progress: "⏳", start: "🚀" };
  const icon = icons[type] || "📋";
  console.log(`[${timestamp}] ${icon} [${orderId}] [${step}] ${message}`);
}

// ──────────────────────── Step 1: Get Order Data ────────────────────────

async function getOrderData(orderId) {
  log(orderId, "INIT", "Mengambil data order...", "start");

  const order = await getOrder(orderId);
  if (!order) {
    throw new Error(`Order ${orderId} tidak ditemukan di database.`);
  }

  if (order.status !== "paid") {
    throw new Error(
      `Order ${orderId} belum dibayar (status: ${order.status}). Tidak bisa diproses.`
    );
  }

  log(orderId, "INIT", `Order ditemukan: ${order.plan_name}, ${order.page_count} halaman`);
  return order;
}

// ──────────────────────── Step 2: Get & Extract File ────────────────────────

async function extractText(orderId, order) {
  log(orderId, "EXTRACT", "Mengekstrak teks dari file...", "progress");

  const uploadDir = process.env.UPLOAD_DIR || "./uploads";
  const filePath = path.join(uploadDir, order.file_id);

  // Check if file exists locally
  if (!fs.existsSync(filePath)) {
    // Try to download from Supabase Storage
    log(orderId, "EXTRACT", "File tidak ada di lokal, mengunduh dari storage...");

    try {
      const { data, error } = await supabase.storage
        .from("uploads")
        .download(order.file_id);

      if (error) {
        throw new Error(`Gagal mengunduh file dari storage: ${error.message}`);
      }

      // Save to local temp
      const buffer = Buffer.from(await data.arrayBuffer());
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, buffer);
      log(orderId, "EXTRACT", "File berhasil diunduh dari storage");
    } catch (err) {
      throw new Error(`File ${order.file_id} tidak ditemukan: ${err.message}`);
    }
  }

  // Extract text using detectFileInfo
  const fileInfo = await detectFileInfo(filePath);
  log(
    orderId,
    "EXTRACT",
    `Teks diekstrak: ${fileInfo.wordCount} kata, ${fileInfo.pages} halaman`,
    "success"
  );

  return {
    text: fileInfo.text,
    wordCount: fileInfo.wordCount,
    pages: fileInfo.pages,
    fileType: fileInfo.fileType,
    filePath,
  };
}

// ──────────────────────── Step 3: AI Analysis ────────────────────────

async function runAnalysis(orderId, text, job) {
  log(orderId, "ANALYZE", "Memulai analisis AI...", "start");

  // Update job status
  await updateAnalysisJob(job.id, {
    status: "analyzing",
    started_at: new Date().toISOString(),
  });

  const result = await analyzePlagiarism(text, order.file_name || order.file_id);

  // Update progress to 100 once done
  try {
    await updateAnalysisJob(job.id, {
      progress: 100,
      analyzed_paragraphs: result.statistics.total_paragraphs,
      total_paragraphs: result.statistics.total_paragraphs,
    });
  } catch {
    // ignore
  }

  log(
    orderId,
    "ANALYZE",
    `Analisis selesai: ${result.overall_similarity}% similarity, ` +
      `${result.statistics.high_similarity_count} high, ${result.statistics.medium_similarity_count} medium, ${result.statistics.original_count} low`,
    "success"
  );

  return result;
}

// ──────────────────────── Step 4: Generate Report ────────────────────────

async function generateReport(orderId, analysisResult, extractedData, orderInfo) {
  log(orderId, "REPORT", "Generating laporan PDF...", "progress");

  const reportDir = process.env.UPLOAD_DIR || "./uploads";
  const reportFileName = `report_${orderId}_${Date.now()}.pdf`;
  const reportPath = path.join(reportDir, "reports", reportFileName);

  // Ensure reports directory exists
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });

  const fileName = orderInfo.file_name || orderInfo.file_id;
  const pdfBuffer = await generateReportPdf(
    extractedData.text,
    analysisResult,
    fileName,
    { orderId }
  );

  fs.writeFileSync(reportPath, pdfBuffer);
  log(orderId, "REPORT", `Laporan PDF disimpan: ${reportFileName}`, "success");

  // Extract all suggested sources for database saving
  const allSources = [];
  analysisResult.paragraphs.forEach(p => {
    if (p.suggested_sources && Array.isArray(p.suggested_sources)) {
      p.suggested_sources.forEach(src => {
        if (!allSources.includes(src)) allSources.push(src);
      });
    }
  });

  return { reportPath, reportFileName, sources: allSources };
}

// ──────────────────────── Step 5: Upload to Storage ────────────────────────

async function uploadReport(orderId, reportPath, reportFileName) {
  log(orderId, "UPLOAD", "Mengupload laporan ke storage...", "progress");

  try {
    const fileBuffer = fs.readFileSync(reportPath);

    const storagePath = `reports/${orderId}/${reportFileName}`;
    const { error } = await supabase.storage
      .from("reports")
      .upload(storagePath, fileBuffer, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (error) {
      console.warn(`[Upload] Storage upload warning: ${error.message}`);
      // Don't throw — file is saved locally as fallback
      return { url: null, storagePath: null, localPath: reportPath };
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("reports")
      .getPublicUrl(storagePath);

    const publicUrl = urlData?.publicUrl || null;
    log(orderId, "UPLOAD", `Laporan diupload: ${storagePath}`, "success");

    return { url: publicUrl, storagePath, localPath: reportPath };
  } catch (err) {
    console.warn(`[Upload] Storage upload failed: ${err.message}`);
    return { url: null, storagePath: null, localPath: reportPath };
  }
}

// ──────────────────────── Step 6: Save Results ────────────────────────

async function saveResults(orderId, analysisResult, reportInfo, job) {
  log(orderId, "SAVE", "Menyimpan hasil ke database...", "progress");

  const downloadToken = uuidv4();
  const overallSimilarity = analysisResult.overall_similarity;

  // Update analysis job
  await updateAnalysisJob(job.id, {
    status: "completed",
    progress: 100,
    similarity_score: overallSimilarity,
    completed_at: new Date().toISOString(),
  });

  // Collect sources
  const allSources = reportInfo.sources || [];

  // Create result record
  const resultRecord = await createResult({
    order_id: orderId,
    job_id: job.id,
    original_file_url: null, // Set if we want to serve the original file
    report_file_url: reportInfo.url || reportInfo.localPath,
    download_token: downloadToken,
    similarity_score: overallSimilarity,
    internet_score: Math.round(overallSimilarity * 0.6 * 10) / 10,
    publication_score: Math.round(overallSimilarity * 0.25 * 10) / 10,
    student_paper_score: Math.round(overallSimilarity * 0.15 * 10) / 10,
    sources_found: allSources.length,
    sources_json: allSources,
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
  });

  // Update order status to completed
  await updateOrder(orderId, {
    status: "completed",
    completed_at: new Date().toISOString(),
  });

  log(
    orderId,
    "SAVE",
    `Hasil disimpan! Download token: ${downloadToken.slice(0, 8)}...`,
    "success"
  );

  return { downloadToken, resultId: resultRecord.id };
}

// ──────────────────────── Main Pipeline ────────────────────────

/**
 * Proses dokumen setelah pembayaran berhasil
 * Fungsi ini dipanggil secara async dari webhook
 *
 * @param {string} orderId - ID order yang sudah dibayar
 * @returns {Promise<Object>} Hasil pemrosesan
 */
async function processDocument(orderId) {
  const startTime = Date.now();
  let job = null;

  console.log("");
  console.log("═".repeat(60));
  log(orderId, "PIPELINE", "🚀 MEMULAI PIPELINE PEMROSESAN DOKUMEN", "start");
  console.log("═".repeat(60));

  try {
    // ── Step 1: Get order data ──
    const order = await getOrderData(orderId);

    // ── Update order status to processing ──
    await updateOrder(orderId, {
      status: "processing",
      processed_at: new Date().toISOString(),
    });

    // ── Create analysis job ──
    job = await createAnalysisJob({
      order_id: orderId,
      file_id: order.file_id,
      status: "processing",
      progress: 0,
    });

    log(orderId, "PIPELINE", `Analysis job created: ${job.id}`);

    // ── Step 2: Extract text ──
    const extractedData = await extractText(orderId, order);

    if (!extractedData.text || extractedData.text.trim().length < 50) {
      throw new Error(
        "Teks yang diekstrak terlalu pendek. File mungkin berisi gambar saja."
      );
    }

    // ── Step 3: AI Analysis ──
    const analysisResult = await runAnalysis(orderId, extractedData.text, job);

    // ── Step 4: Generate Report ──
    const reportInfo = await generateReport(orderId, analysisResult, extractedData, order);

    // ── Step 5: Upload to Storage ──
    const storageInfo = await uploadReport(
      orderId,
      reportInfo.reportPath,
      reportInfo.reportFileName
    );

    // ── Step 6: Save Results ──
    const savedResult = await saveResults(
      orderId,
      analysisResult,
      storageInfo,
      job
    );

    // ── Done! ──
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log("═".repeat(60));
    log(
      orderId,
      "PIPELINE",
      `✅ PIPELINE SELESAI dalam ${duration} detik`,
      "success"
    );
    log(
      orderId,
      "PIPELINE",
      `Similarity: ${analysisResult.overall_similarity}% | Token: ${savedResult.downloadToken.slice(0, 8)}...`,
      "success"
    );
    console.log("═".repeat(60));
    console.log("");

    return {
      success: true,
      orderId,
      downloadToken: savedResult.downloadToken,
      similarity: analysisResult.overall_similarity,
      duration: parseFloat(duration),
    };
  } catch (err) {
    // ── Handle pipeline failure ──
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error("═".repeat(60));
    log(orderId, "PIPELINE", `❌ PIPELINE GAGAL setelah ${duration} detik: ${err.message}`, "error");
    console.error("═".repeat(60));

    // Update job status to failed
    if (job) {
      try {
        await updateAnalysisJob(job.id, {
          status: "failed",
          error_message: err.message,
          completed_at: new Date().toISOString(),
        });
      } catch {
        // Ignore update errors during failure handling
      }
    }

    // Update order status to failed
    try {
      await updateOrder(orderId, { status: "failed" });
    } catch {
      // Ignore
    }

    return {
      success: false,
      orderId,
      error: err.message,
      duration: parseFloat(duration),
    };
  }
}

module.exports = { processDocument };
