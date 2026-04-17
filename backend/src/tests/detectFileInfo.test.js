/**
 * detectFileInfo.test.js
 * ─────────────────────────────────────────────────────────────
 * Unit tests untuk fungsi detectFileInfo
 * Jalankan: npm test (dari folder backend)
 * ─────────────────────────────────────────────────────────────
 */

const fs = require("fs");
const path = require("path");
const {
  detectFileInfo,
  selectPlan,
  countWords,
  validateFile,
} = require("../utils/detectFileInfo");

// ──────────────────────── Test Helpers ────────────────────────

const FIXTURES_DIR = path.join(__dirname, "fixtures");
let passed = 0;
let failed = 0;
let skipped = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ ${message}`);
    passed++;
  } else {
    console.error(`  ❌ ${message}`);
    failed++;
  }
}

function skip(message) {
  console.log(`  ⏭️  ${message} (SKIPPED — fixture not found)`);
  skipped++;
}

function section(title) {
  console.log(`\n${"─".repeat(50)}`);
  console.log(`📋 ${title}`);
  console.log(`${"─".repeat(50)}`);
}

// ──────────────────────── Create Test Fixtures ────────────────────────

function ensureFixturesDir() {
  if (!fs.existsSync(FIXTURES_DIR)) {
    fs.mkdirSync(FIXTURES_DIR, { recursive: true });
  }
}

/**
 * Create a sample TXT file for testing
 */
function createSampleTXT() {
  const filePath = path.join(FIXTURES_DIR, "sample.txt");
  // Create ~3 pages worth of text (6000 chars)
  const paragraph =
    "Lorem ipsum dolor sit amet, consectetur adipiscing elit. " +
    "Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. " +
    "Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris. " +
    "Duis aute irure dolor in reprehenderit in voluptate velit esse cillum. ";

  let text = "";
  while (text.length < 6000) {
    text += paragraph + "\n\n";
  }

  fs.writeFileSync(filePath, text, "utf-8");
  return filePath;
}

/**
 * Create an empty file for testing
 */
function createEmptyFile() {
  const filePath = path.join(FIXTURES_DIR, "empty.txt");
  fs.writeFileSync(filePath, "", "utf-8");
  return filePath;
}

/**
 * Create a short TXT file (1 page)
 */
function createShortTXT() {
  const filePath = path.join(FIXTURES_DIR, "short.txt");
  fs.writeFileSync(
    filePath,
    "Ini adalah dokumen pendek untuk pengujian. Hanya beberapa kalimat saja.",
    "utf-8"
  );
  return filePath;
}

/**
 * Create a large TXT file (simulating 50+ pages)
 */
function createLargeTXT() {
  const filePath = path.join(FIXTURES_DIR, "large.txt");
  const paragraph =
    "Penelitian ini bertujuan untuk menganalisis pengaruh teknologi informasi " +
    "terhadap efisiensi operasional bisnis di era digital. Dengan menggunakan " +
    "metode penelitian kuantitatif, studi ini mengumpulkan data dari 500 " +
    "responden yang berasal dari berbagai sektor industri. Hasil analisis " +
    "menunjukkan korelasi positif yang signifikan antara adopsi teknologi " +
    "dan peningkatan produktivitas perusahaan. ";

  let text = "";
  // Create ~120,000 chars (~60 pages)
  while (text.length < 120000) {
    text += paragraph + "\n\n";
  }

  fs.writeFileSync(filePath, text, "utf-8");
  return filePath;
}

// ──────────────────────── Test: countWords ────────────────────────

async function testCountWords() {
  section("Test countWords()");

  assert(countWords("hello world") === 2, "countWords('hello world') === 2");

  assert(
    countWords("satu dua tiga empat lima") === 5,
    "countWords('satu dua tiga empat lima') === 5"
  );

  assert(countWords("") === 0, "countWords('') === 0 (string kosong)");

  assert(countWords(null) === 0, "countWords(null) === 0");

  assert(countWords(undefined) === 0, "countWords(undefined) === 0");

  assert(
    countWords("  multiple   spaces   here  ") === 3,
    "countWords with multiple spaces === 3"
  );

  assert(
    countWords("kata\ndengan\nnewline") === 3,
    "countWords with newlines === 3"
  );
}

// ──────────────────────── Test: selectPlan ────────────────────────

async function testSelectPlan() {
  section("Test selectPlan()");

  const starter = selectPlan(1);
  assert(
    starter.name === "Starter" && starter.price === 3000,
    "1 halaman → Starter (Rp 3.000)"
  );

  const starter30 = selectPlan(30);
  assert(
    starter30.name === "Starter" && starter30.price === 3000,
    "30 halaman → Starter (Rp 3.000)"
  );

  const standard31 = selectPlan(31);
  assert(
    standard31.name === "Standard" && standard31.price === 12000,
    "31 halaman → Standard (Rp 12.000)"
  );

  const standard100 = selectPlan(100);
  assert(
    standard100.name === "Standard" && standard100.price === 12000,
    "100 halaman → Standard (Rp 12.000)"
  );

  const pro101 = selectPlan(101);
  assert(
    pro101.name === "Pro" && pro101.price === 25000,
    "101 halaman → Pro (Rp 25.000)"
  );

  const pro500 = selectPlan(500);
  assert(
    pro500.name === "Pro" && pro500.price === 25000,
    "500 halaman → Pro (Rp 25.000)"
  );
}

// ──────────────────────── Test: validateFile ────────────────────────

async function testValidateFile() {
  section("Test validateFile()");

  // Non-existent file
  const notFound = validateFile("/path/that/does/not/exist.pdf");
  assert(!notFound.valid, "File tidak ditemukan → invalid");

  // Empty file
  const emptyPath = createEmptyFile();
  const empty = validateFile(emptyPath);
  assert(!empty.valid, "File kosong → invalid");
  assert(
    empty.error.includes("kosong"),
    "Error message menyebut 'kosong'"
  );

  // Valid file
  const validPath = createShortTXT();
  const valid = validateFile(validPath);
  assert(valid.valid === true, "File valid → valid: true");
  assert(valid.size > 0, "File valid memiliki size > 0");
}

// ──────────────────────── Test: TXT Detection ────────────────────────

async function testTXTDetection() {
  section("Test detectFileInfo() — TXT");

  // Short TXT (1 page)
  const shortPath = createShortTXT();
  const shortResult = await detectFileInfo(shortPath, "text/plain");
  assert(shortResult.pages === 1, `Short TXT: ${shortResult.pages} halaman (expected 1)`);
  assert(shortResult.wordCount > 0, `Short TXT: ${shortResult.wordCount} kata`);
  assert(shortResult.fileType === "txt", "fileType === 'txt'");
  assert(shortResult.text.length > 0, "text tidak kosong");

  // Medium TXT (~3 pages)
  const mediumPath = createSampleTXT();
  const mediumResult = await detectFileInfo(mediumPath, "text/plain");
  assert(
    mediumResult.pages >= 2 && mediumResult.pages <= 5,
    `Medium TXT: ${mediumResult.pages} halaman (expected 2-5)`
  );
  assert(
    mediumResult.wordCount > 100,
    `Medium TXT: ${mediumResult.wordCount} kata (expected >100)`
  );

  // Large TXT (~60 pages)
  const largePath = createLargeTXT();
  const largeResult = await detectFileInfo(largePath, "text/plain");
  assert(
    largeResult.pages >= 40 && largeResult.pages <= 80,
    `Large TXT: ${largeResult.pages} halaman (expected 40-80)`
  );

  // Plan for large TXT should be Standard
  const plan = selectPlan(largeResult.pages);
  assert(
    plan.name === "Standard",
    `Large TXT (${largeResult.pages} hal) → Paket ${plan.name}`
  );
}

// ──────────────────────── Test: PDF Detection ────────────────────────

async function testPDFDetection() {
  section("Test detectFileInfo() — PDF");

  const pdfPath = path.join(FIXTURES_DIR, "sample.pdf");
  if (!fs.existsSync(pdfPath)) {
    skip(
      "sample.pdf tidak ditemukan — letakkan file PDF test di backend/src/tests/fixtures/"
    );
    console.log(
      "    💡 Tip: Salin file PDF apapun ke folder fixtures untuk testing:"
    );
    console.log(`    📁 ${FIXTURES_DIR}`);
    return;
  }

  const result = await detectFileInfo(pdfPath, "application/pdf");
  assert(result.pages > 0, `PDF: ${result.pages} halaman terdeteksi`);
  assert(result.wordCount >= 0, `PDF: ${result.wordCount} kata`);
  assert(result.fileType === "pdf", "fileType === 'pdf'");
  assert(typeof result.text === "string", "text adalah string");
  assert(result.fileSize > 0, `fileSize: ${result.fileSize} bytes`);

  const plan = selectPlan(result.pages);
  console.log(
    `    📊 PDF → ${result.pages} hal, ${result.wordCount} kata → Paket ${plan.name} (Rp ${plan.price.toLocaleString()})`
  );
}

// ──────────────────────── Test: DOCX Detection ────────────────────────

async function testDOCXDetection() {
  section("Test detectFileInfo() — DOCX");

  const docxPath = path.join(FIXTURES_DIR, "sample.docx");
  if (!fs.existsSync(docxPath)) {
    skip(
      "sample.docx tidak ditemukan — letakkan file DOCX test di backend/src/tests/fixtures/"
    );
    console.log(
      "    💡 Tip: Salin file DOCX apapun ke folder fixtures untuk testing:"
    );
    console.log(`    📁 ${FIXTURES_DIR}`);
    return;
  }

  const result = await detectFileInfo(docxPath, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  assert(result.pages > 0, `DOCX: ${result.pages} halaman terdeteksi`);
  assert(result.wordCount > 0, `DOCX: ${result.wordCount} kata`);
  assert(result.fileType === "docx", "fileType === 'docx'");
  assert(typeof result.text === "string", "text adalah string");

  const plan = selectPlan(result.pages);
  console.log(
    `    📊 DOCX → ${result.pages} hal, ${result.wordCount} kata → Paket ${plan.name} (Rp ${plan.price.toLocaleString()})`
  );
}

// ──────────────────────── Test: Error Handling ────────────────────────

async function testErrorHandling() {
  section("Test Error Handling");

  // Unsupported file type
  try {
    await detectFileInfo("/fake/file.xlsx", "application/vnd.ms-excel");
    assert(false, "Seharusnya throw untuk file .xlsx");
  } catch (err) {
    assert(
      err.message.includes("tidak ditemukan") || err.message.includes("tidak didukung"),
      `Unsupported type → Error: "${err.message}"`
    );
  }

  // Empty file
  const emptyPath = createEmptyFile();
  try {
    await detectFileInfo(emptyPath, "text/plain");
    assert(false, "Seharusnya throw untuk file kosong");
  } catch (err) {
    assert(
      err.message.includes("kosong"),
      `Empty file → Error: "${err.message}"`
    );
  }

  // Non-existent file
  try {
    await detectFileInfo("/path/that/does/not/exist.pdf", "application/pdf");
    assert(false, "Seharusnya throw untuk file tidak ada");
  } catch (err) {
    assert(
      err.message.includes("tidak ditemukan"),
      `Missing file → Error: "${err.message}"`
    );
  }

  // Extension-based detection (without mime type)
  const txtPath = createShortTXT();
  const result = await detectFileInfo(txtPath); // no mime type
  assert(
    result.fileType === "txt",
    "Auto-detect dari extension (.txt) tanpa mime type"
  );
}

// ──────────────────────── Run All Tests ────────────────────────

async function runAllTests() {
  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║       PlagiarCheck — File Detection Tests        ║");
  console.log("╚══════════════════════════════════════════════════╝");

  ensureFixturesDir();

  await testCountWords();
  await testSelectPlan();
  await testValidateFile();
  await testTXTDetection();
  await testPDFDetection();
  await testDOCXDetection();
  await testErrorHandling();

  // Cleanup fixtures
  try {
    fs.rmSync(FIXTURES_DIR, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }

  console.log(`\n${"═".repeat(50)}`);
  console.log(`📊 Results: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  console.log(`${"═".repeat(50)}\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error("❌ Test runner error:", err);
  process.exit(1);
});
