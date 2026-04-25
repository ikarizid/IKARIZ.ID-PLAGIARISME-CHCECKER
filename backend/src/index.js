/**
 * index.js — PlagiarCheck Backend Server
 * ─────────────────────────────────────────────────────────────
 * Express REST API server untuk PlagiarCheck
 * ─────────────────────────────────────────────────────────────
 */

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 5000;

// ──────────────────────── Middleware ────────────────────────

// CORS — allow frontend
app.use(
  cors({
    origin: function (origin, callback) {
      if (
        !origin ||
        origin.includes("localhost") ||
        origin.includes("127.0.0.1") ||
        origin.match(/^http:\/\/192\.168\./) ||
        origin.includes("vercel.app") // <-- Izinkan semua Vercel preview domain
      ) {
        callback(null, true);
      } else {
        callback(null, process.env.FRONTEND_URL || "http://localhost:3000");
      }
    },
    methods: ["GET", "POST"],
    credentials: true,
  })
);

// Parse JSON body
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    console.log(
      `${req.method} ${req.originalUrl} → ${res.statusCode} (${duration}ms)`
    );
  });
  next();
});

// ──────────────────────── Routes ────────────────────────

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    service: "PlagiarCheck Backend",
    version: "0.1.0",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
  });
});

// Upload document
const uploadRouter = require("./routes/upload");
app.use("/api", uploadRouter);

// Orders (create-order, get order)
const ordersRouter = require("./routes/orders");
app.use("/api", ordersRouter);

// Webhook (Midtrans notifications)
const webhookRouter = require("./routes/webhook");
app.use("/api", webhookRouter);

// ──────────────────────── Error Handler ────────────────────────

// 404
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Endpoint ${req.method} ${req.originalUrl} tidak ditemukan.`,
  });
});

// Global error handler
app.use((err, req, res, _next) => {
  console.error("[Server] Unhandled error:", err);
  res.status(500).json({
    success: false,
    error: "Internal server error.",
  });
});

// ──────────────────────── Start Server ────────────────────────

app.listen(PORT, () => {
  console.log("");
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║          PlagiarCheck Backend Server             ║");
  console.log("╚══════════════════════════════════════════════════╝");
  console.log("");
  console.log(`  🚀 Server running on http://localhost:${PORT}`);
  console.log(`  📡 Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`  🌐 Frontend URL: ${process.env.FRONTEND_URL || "http://localhost:3000"}`);
  console.log(`  💳 Midtrans: ${process.env.MIDTRANS_IS_PRODUCTION === "true" ? "PRODUCTION" : "SANDBOX"}`);
  console.log("");
  console.log("  Endpoints:");
  console.log("  ──────────────────────────────────────────────");
  console.log("  GET  /api/health              → Health check");
  console.log("  POST /api/create-order        → Buat transaksi");
  console.log("  GET  /api/order/:id           → Cek status order");
  console.log("  POST /api/webhook/midtrans    → Webhook Midtrans (signature verified)");
  console.log("  POST /api/webhook             → Webhook (backward compat)");
  console.log("  GET  /api/jobs/:orderId       → Debug: cek status job");
  console.log("");
});

module.exports = app;
