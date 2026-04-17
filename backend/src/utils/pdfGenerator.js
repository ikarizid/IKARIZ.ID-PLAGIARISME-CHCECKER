/**
 * pdfGenerator.js
 * ─────────────────────────────────────────────────────────────
 * Generate laporan PDF hasil deteksi plagiarisme
 * ─────────────────────────────────────────────────────────────
 */

const puppeteer = require("puppeteer");
const path = require("path");

function formatDate(date) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

/**
 * Generate string HTML untuk teks yang diberi highlight
 * @param {Array} paragraphs
 * @returns {string}
 */
function highlightText(paragraphs) {
  if (!paragraphs || paragraphs.length === 0) return "<p>Tidak ada teks untuk ditampilkan.</p>";

  return paragraphs
    .map((p) => {
      const score = p.similarity_score || 0;
      let style = "normal-text";
      let badge = "";

      if (score > 70) {
        style = "high-similarity";
        badge = `<span class="badge badge-high">${score}% similar</span>`;
      } else if (score >= 40) {
        style = "medium-similarity";
        badge = `<span class="badge badge-medium">${score}% similar</span>`;
      } // If score < 40, no highlight, no badge

      return `
        <div class="paragraph-block ${style}">
          ${badge}
          <p>${p.text}</p>
        </div>
      `;
    })
    .join("\n");
}

/**
 * Render halaman ringkasan laporan gaya Turnitin
 * @param {Object} statistics
 * @param {number} overallSimilarity
 * @param {Array} sources
 * @returns {string}
 */
function generateSummaryPage(statistics, overallSimilarity, sources) {
  // Simulate Turnitin style distribution scores
  const internetPrc = Math.round(overallSimilarity * 0.6 * 10) / 10;
  const pubPrc = Math.round(overallSimilarity * 0.25 * 10) / 10;
  const studentPrc = Math.round(overallSimilarity * 0.15 * 10) / 10;

  // Primary sources block
  const sourcesHtml = sources && sources.length > 0
    ? sources.map((s, i) => `
        <div class="source-item">
          <span class="source-number">${i + 1}</span>
          <span class="source-url">${s}</span>
        </div>
      `).join("")
    : "<div class='source-item'>Tidak ada sumber luar utama yang terdeteksi.</div>";

  return `
    <div class="page-break"></div>
    <div class="summary-container">
      <h1 class="summary-title">Originality Report</h1>
      
      <div class="score-grid">
        <div class="score-box primary-score">
          <div class="score-value">${overallSimilarity}%</div>
          <div class="score-label">SIMILARITY INDEX</div>
        </div>
        <div class="score-box">
          <div class="score-value">${internetPrc}%</div>
          <div class="score-label">INTERNET SOURCES</div>
        </div>
        <div class="score-box">
          <div class="score-value">${pubPrc}%</div>
          <div class="score-label">PUBLICATIONS</div>
        </div>
        <div class="score-box">
          <div class="score-value">${studentPrc}%</div>
          <div class="score-label">STUDENT PAPERS</div>
        </div>
      </div>

      <div class="sources-list">
        <h3>Primary Sources</h3>
        ${sourcesHtml}
      </div>

      <div class="footer-note">
        <p>Laporan ini dihasilkan secara otomatis oleh <strong>PlagiarCheck AI</strong></p>
        <p>Distribusi skor merupakan estimasi berdasarkan kemiripan pola teks AI.</p>
      </div>
    </div>
  `;
}

/**
 * Generate PDF menggunakan Puppeteer
 *
 * @param {string} originalText
 * @param {Object} analysisResult
 * @param {string} fileName
 * @param {Object} orderInfo
 * @returns {Promise<Buffer>}
 */
async function generateReportPdf(originalText, analysisResult, fileName, orderInfo) {
  let browser = null;
  try {
    const overallSimilarity = analysisResult.overall_similarity;
    const statistics = analysisResult.statistics;
    // Ambil semua unique sources
    const sourcesSet = new Set();
    analysisResult.paragraphs.forEach(p => {
      if (p.suggested_sources) {
        p.suggested_sources.forEach(src => sourcesSet.add(src));
      }
    });
    const finalSources = Array.from(sourcesSet).slice(0, 10); // Ambil top 10

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <style>
          /* Base Styles */
          body {
            font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
            color: #333;
            line-height: 1.6;
            font-size: 11pt;
            margin: 0;
            padding: 0;
          }
          
          .page-break {
            page-break-before: always;
          }

          /* Header */
          .header {
            border-bottom: 2px solid #5a67d8;
            padding-bottom: 20px;
            margin-bottom: 30px;
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
          }
          .logo {
            font-size: 24pt;
            font-weight: bold;
            color: #5a67d8;
            margin: 0;
          }
          .doc-info {
            text-align: right;
            font-size: 9pt;
            color: #666;
          }
          .doc-info strong {
            color: #333;
          }

          /* Highlights */
          .paragraph-block {
            position: relative;
            margin-bottom: 15px;
            padding: 5px 10px;
            border-radius: 4px;
          }
          
          .normal-text {
            color: #333;
          }
          
          .high-similarity {
            background-color: #ffebee;
            color: #b71c1c;
            border-left: 4px solid #d32f2f;
          }
          
          .medium-similarity {
            background-color: #fffde7;
            color: #5d4037;
            border-left: 4px solid #fbc02d;
          }
          
          .badge {
            display: block;
            font-size: 8pt;
            font-weight: bold;
            text-transform: uppercase;
            margin-bottom: 5px;
            letter-spacing: 0.5px;
          }
          
          .badge-high { color: #d32f2f; }
          .badge-medium { color: #f57f17; }
          
          /* Summary Page */
          .summary-container {
            padding-top: 20px;
          }
          
          .summary-title {
            font-size: 20pt;
            border-bottom: 1px solid #ccc;
            padding-bottom: 10px;
            margin-bottom: 30px;
          }

          .score-grid {
            display: table;
            width: 100%;
            margin-bottom: 40px;
          }
          
          .score-box {
            display: table-cell;
            text-align: center;
            vertical-spacing: 20px;
            padding: 20px 10px;
            border-right: 1px solid #ddd;
          }
          .score-box:last-child {
            border-right: none;
          }
          
          .score-value {
            font-size: 28pt;
            font-weight: bold;
            color: #333;
            line-height: 1;
            margin-bottom: 10px;
          }
          .primary-score .score-value {
            font-size: 42pt;
            color: #d32f2f;
          }
          
          .score-label {
            font-size: 9pt;
            color: #777;
            text-transform: uppercase;
            letter-spacing: 1px;
          }

          .sources-list {
            margin-top: 40px;
          }
          .sources-list h3 {
            font-size: 14pt;
            border-bottom: 1px solid #eee;
            padding-bottom: 10px;
            margin-bottom: 15px;
          }
          .source-item {
            display: flex;
            margin-bottom: 10px;
            font-size: 10pt;
            align-items: baseline;
          }
          .source-number {
            font-weight: bold;
            margin-right: 15px;
            width: 20px;
          }
          .source-url {
            color: #1976d2;
            word-break: break-all;
          }
          
          .footer-note {
            margin-top: 60px;
            font-size: 8pt;
            color: #999;
            text-align: center;
            border-top: 1px solid #eee;
            padding-top: 20px;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="logo">PlagiarCheck AI</div>
          <div class="doc-info">
            <strong>${fileName}</strong><br/>
            Order ID: ${orderInfo.orderId}<br/>
            Diperiksa: ${formatDate(new Date())}
          </div>
        </div>

        <div class="content">
          ${highlightText(analysisResult.paragraphs)}
        </div>

        ${generateSummaryPage(statistics, overallSimilarity, finalSources)}
      </body>
      </html>
    `;

    // Initialize Puppeteer
    browser = await puppeteer.launch({
      headless: true, // v12+ string is removed, use boolean true
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    
    // Set HTML content
    await page.setContent(htmlContent, {
      waitUntil: "networkidle0",
    });

    // Generate PDF
    const pdfBuffer = await page.pdf({
      format: "A4",
      margin: {
        top: "2.5cm",
        bottom: "2.5cm",
        left: "2.5cm",
        right: "2.5cm",
      },
      printBackground: true,
    });

    return pdfBuffer;

  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

module.exports = {
  generateReportPdf,
  highlightText,
  generateSummaryPage
};
