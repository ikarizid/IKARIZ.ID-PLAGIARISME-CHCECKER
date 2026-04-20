/**
 * geminiApi.js
 * ─────────────────────────────────────────────────────────────
 * Integrasi Google Gemini API untuk analisis plagiarisme
 * Model: gemini-1.5-flash
 * ─────────────────────────────────────────────────────────────
 */

const { GoogleGenerativeAI } = require("@google/generative-ai");

const GEMINI_MODEL = "gemini-1.5-flash";

// Inisialisasi client Gemini
function getClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY belum di-set di environment variables.");
  }
  return new GoogleGenerativeAI(apiKey);
}

/**
 * Panggil Gemini API dengan retry logic
 */
async function callGeminiWithRetry(client, prompt, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const model = client.getGenerativeModel({ model: GEMINI_MODEL });
      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (err) {
      if (err.status === 429) {
        console.warn(`[Gemini API] Rate limited. Retrying in ${i + 2} seconds...`);
        await new Promise((res) => setTimeout(res, (i + 2) * 1000));
        continue;
      }
      if (err.status === 500 || err.status === 503) {
        console.warn(`[Gemini API] Server error/overload. Retrying in ${i + 2} seconds...`);
        await new Promise((res) => setTimeout(res, (i + 2) * 1000));
        continue;
      }
      throw err;
    }
  }
  throw new Error("Berulang kali gagal memanggil Gemini API");
}

/**
 * Queue management untuk Rate Limiting
 */
class RateLimiter {
  constructor(requestsPerMinute) {
    this.interval = (60 * 1000) / requestsPerMinute;
    this.lastRequestTime = 0;
  }

  async throttle() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.interval) {
      const delay = this.interval - timeSinceLastRequest;
      await new Promise((r) => setTimeout(r, delay));
    }
    this.lastRequestTime = Date.now();
  }
}

// Global rate limiter instance (14 per minute, leave 1 for buffer in free tier)
const geminiRateLimiter = new RateLimiter(14);

/**
 * Menganalisis satu paragraf
 */
async function analyzeSingleParagraph(client, paragraph) {
  // Throttle request agar tidak melampaui limit gratis Gemini
  await geminiRateLimiter.throttle();

  const prompt = `Kamu adalah sistem pendeteksi plagiarisme profesional. Analisis teks berikut dan tentukan:
1. Apakah teks ini kemungkinan besar diambil/disalin dari sumber lain?
2. Berapa persen kemungkinan plagiatnya (0-100%)?
3. Jenis plagiarisme apa (none, verbatim, paraphrase, mosaic)?

Berikan output HANYA dalam format JSON. Jangan buat opening / closing text:
{
  "similarity_score": <angka_0_sampai_100>,
  "plagiarism_type": "<none/verbatim/paraphrase/mosaic>",
  "explanation": "<penjelasan_singkat_berbahasa_indonesia>",
  "suggested_sources": ["<kemungkinan_sumber_seperti_wikipedia_atau_jurnal_jika_ada_jika_tidak_kosongkan>"]
}

Teks yang dianalisis:
${paragraph}`;

  const responseText = await callGeminiWithRetry(client, prompt);

  let jsonStr = responseText.trim();
  // Membersihkan potensi blok markdown dari response Gemini
  if (jsonStr.startsWith("```json")) jsonStr = jsonStr.slice(7);
  else if (jsonStr.startsWith("```")) jsonStr = jsonStr.slice(3);
  if (jsonStr.endsWith("```")) jsonStr = jsonStr.slice(0, -3);
  jsonStr = jsonStr.trim();

  try {
    const result = JSON.parse(jsonStr);
    return {
      success: true,
      data: result,
    };
  } catch (error) {
    console.error("[Gemini API] Gagal parsing JSON:", jsonStr);
    return {
      success: false,
      error: "Gagal memparse respons dari Gemini API",
    };
  }
}

/**
 * Fungsi Utama: analyzePlagiarism
 * Membagi teks menjadi paragraf dan memproses dengan Gemini API
 *
 * @param {string} text - Seluruh teks dokumen
 * @param {string} filename - Nama file (opsional)
 * @returns {Promise<Object>}
 */
async function analyzePlagiarism(text, filename = "") {
  const client = getClient();
  
  // 1. Bagi teks menjadi paragraf-paragraf
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    // Hanya analisa paragraf yang bermakna (menghindari header/footer yang sangat pendek)
    .filter((p) => p.length >= 30);

  if (paragraphs.length === 0) {
    throw new Error("Tidak ada paragraf yang cukup panjang untuk dianalisis.");
  }

  console.log(`[Gemini API] Memulai analisis plagiarisme untuk file ${filename}. Total ${paragraphs.length} paragraf.`);

  const analyzedParagraphs = [];
  let totalScoreSum = 0;
  let highCount = 0;
  let mediumCount = 0;
  let lowCount = 0;

  // 3. Kumpulkan semua hasil analisis per paragraf
  for (let i = 0; i < paragraphs.length; i++) {
    const paragraphText = paragraphs[i];
    console.log(`[Gemini API] Menganalisis paragraf ${i + 1}/${paragraphs.length}...`);
    
    const analysisResult = await analyzeSingleParagraph(client, paragraphText);
    
    let simScore = 0;
    let type = "none";
    let highlight = "none";

    if (analysisResult.success && analysisResult.data) {
      simScore = analysisResult.data.similarity_score || 0;
      type = analysisResult.data.plagiarism_type || "none";
    }

    // 5. Tandai paragraf dengan label color
    if (simScore > 70) {
      highlight = "red";
      highCount++;
    } else if (simScore >= 40) {
      highlight = "yellow";
      mediumCount++;
    } else {
      highlight = "none";
      lowCount++;
    }

    totalScoreSum += simScore;

    analyzedParagraphs.push({
      text: paragraphText,
      similarity_score: simScore,
      plagiarism_type: type,
      highlight_color: highlight,
      explanation: analysisResult.success ? analysisResult.data.explanation : "Error menganalisis",
      suggested_sources: analysisResult.success ? analysisResult.data.suggested_sources || [] : []
    });
  }

  // 4. Hitung similarity index keseluruhan
  const overallSimilarity = 
    paragraphs.length > 0 
      ? Math.round((totalScoreSum / paragraphs.length) * 10) / 10 
      : 0;

  return {
    overall_similarity: overallSimilarity,
    paragraphs: analyzedParagraphs,
    statistics: {
      total_paragraphs: paragraphs.length,
      high_similarity_count: highCount,
      medium_similarity_count: mediumCount,
      original_count: lowCount
    }
  };
}

module.exports = {
  analyzePlagiarism,
  GEMINI_MODEL,
};
