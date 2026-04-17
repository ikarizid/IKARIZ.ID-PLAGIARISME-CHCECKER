/**
 * claudeApi.js
 * ─────────────────────────────────────────────────────────────
 * Integrasi Claude API (Anthropic) untuk analisis plagiarisme
 * Model: claude-sonnet-4-20250514
 * ─────────────────────────────────────────────────────────────
 */

const Anthropic = require("@anthropic-ai/sdk");

const CLAUDE_MODEL = "claude-sonnet-4-20250514";

// Inisialisasi client Anthropic
function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.startsWith("sk-ant-xxxx")) {
    throw new Error("ANTHROPIC_API_KEY belum di-set dengan key yang valid di .env");
  }
  return new Anthropic({ apiKey });
}

/**
 * Panggil Claude API dengan retry logic
 * @param {Anthropic} client
 * @param {string} prompt
 * @param {number} retries
 */
async function callClaudeWithRetry(client, prompt, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await client.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      });

      return response.content[0].text;
    } catch (err) {
      if (err.status === 429) {
        console.warn(`[Claude API] Rate limited. Retrying in ${i + 2} seconds...`);
        await new Promise((res) => setTimeout(res, (i + 2) * 1000));
        continue;
      }
      if (err.status === 529 || err.status >= 500) {
        console.warn(`[Claude API] Server error/overload. Retrying in ${i + 2} seconds...`);
        await new Promise((res) => setTimeout(res, (i + 2) * 1000));
        continue;
      }
      // Non-retriable error
      throw err;
    }
  }
  throw new Error("Berulang kali gagal memanggil Claude API");
}

/**
 * Queue management untuk Rate Limiting (max 5 request per detik)
 */
class RateLimiter {
  constructor(requestsPerSecond) {
    this.requestsPerSecond = requestsPerSecond;
    this.interval = 1000 / requestsPerSecond;
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

// Global rate limiter instance (5 per second)
const claudeRateLimiter = new RateLimiter(5);

/**
 * Menganalisis satu paragraf
 */
async function analyzeSingleParagraph(client, paragraph) {
  // Throttle request agar tidak melampaui 5 req/sec
  await claudeRateLimiter.throttle();

  const prompt = `Kamu adalah sistem pendeteksi plagiarisme. Analisis teks berikut dan tentukan:
1. Apakah teks ini kemungkinan besar diambil/disalin dari sumber lain?
2. Berapa persen kemungkinan plagiatnya (0-100%)?
3. Jenis plagiarisme apa (langsung/verbatim, parafrase, mosaic)?

Berikan output dalam format JSON HANYA. Jangan buat opening / closing text:
{
  "similarity_score": 0-100,
  "plagiarism_type": "none|verbatim|paraphrase|mosaic",
  "explanation": "penjelasan singkat",
  "suggested_sources": ["kemungkinan sumber jika ada"]
}

Teks yang dianalisis:
${paragraph}`;

  const responseText = await callClaudeWithRetry(client, prompt);

  let jsonStr = responseText.trim();
  // Membersihkan potensi blok markdown dari response Claude
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
    console.error("[Claude API] Gagal parsing JSON:", jsonStr);
    return {
      success: false,
      error: "Gagal memparse respons dari Claude API",
    };
  }
}

/**
 * Fungsi Utama: analyzePlagiarism
 * Membagi teks menjadi paragraf dan memproses dengan Claude API
 *
 * @param {string} text - Seluruh teks dokumen
 * @param {string} filename - Nama file (opsional, untuk konteks tambahan jika diperlukan)
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

  console.log(`[Claude API] Memulai analisis plagiarisme untuk file ${filename}. Total ${paragraphs.length} paragraf.`);

  const analyzedParagraphs = [];
  let totalScoreSum = 0;
  let highCount = 0;
  let mediumCount = 0;
  let lowCount = 0;

  // 3. Kumpulkan semua hasil analisis per paragraf
  // Gunakan loop berurut (atau Promise.all dengan concurrency control) 
  // Di sini kita gunakan loop agar rate limiter lebih stabil
  for (let i = 0; i < paragraphs.length; i++) {
    const paragraphText = paragraphs[i];
    console.log(`[Claude API] Menganalisis paragraf ${i + 1}/${paragraphs.length}...`);
    
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
  CLAUDE_MODEL,
};
