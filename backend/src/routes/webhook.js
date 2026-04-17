/**
 * webhook.js — Route: POST /api/webhook/midtrans
 * ─────────────────────────────────────────────────────────────
 * Menerima dan memverifikasi notifikasi pembayaran Midtrans
 * Memicu pipeline processDocument() secara async setelah bayar
 * ─────────────────────────────────────────────────────────────
 */

const express = require("express");
const crypto = require("crypto");
const { verifyNotification } = require("../utils/midtrans");
const { updateOrder, getOrder } = require("../utils/database");
const { processDocument } = require("../services/processDocument");

const router = express.Router();

// ──────────────────────── Signature Verification ────────────────────────

/**
 * Verifikasi signature key Midtrans
 * Signature = SHA512(orderId + statusCode + grossAmount + serverKey)
 *
 * @param {Object} notification - Body dari webhook
 * @returns {boolean} true jika signature valid
 */
function verifySignature(notification) {
  const serverKey = process.env.MIDTRANS_SERVER_KEY;
  if (!serverKey) {
    console.error("[Webhook] MIDTRANS_SERVER_KEY belum di-set!");
    return false;
  }

  const {
    order_id,
    status_code,
    gross_amount,
    signature_key,
  } = notification;

  if (!order_id || !status_code || !gross_amount || !signature_key) {
    console.warn("[Webhook] Missing fields for signature verification");
    return false;
  }

  // SHA512(orderId + statusCode + grossAmount + serverKey)
  const payload = order_id + status_code + gross_amount + serverKey;
  const expectedSignature = crypto
    .createHash("sha512")
    .update(payload)
    .digest("hex");

  const isValid = expectedSignature === signature_key;

  if (!isValid) {
    console.error("[Webhook] ⚠️ SIGNATURE MISMATCH!");
    console.error(`[Webhook] Expected: ${expectedSignature.slice(0, 20)}...`);
    console.error(`[Webhook] Received: ${signature_key.slice(0, 20)}...`);
  }

  return isValid;
}

// ──────────────────────── Status Mapping ────────────────────────

/**
 * Map Midtrans transaction status ke internal order status
 */
function mapTransactionStatus(transactionStatus, fraudStatus) {
  switch (transactionStatus) {
    case "capture":
      return fraudStatus === "accept" ? "paid" : "challenge";

    case "settlement":
      return "paid";

    case "pending":
      return "pending";

    case "deny":
    case "cancel":
      return "cancelled";

    case "expire":
      return "expired";

    case "refund":
    case "partial_refund":
      return "refunded";

    default:
      console.warn(`[Webhook] Unknown status: ${transactionStatus}`);
      return null;
  }
}

// Status priority — prevent downgrading
const STATUS_PRIORITY = {
  pending: 0,
  challenge: 1,
  paid: 2,
  processing: 3,
  completed: 4,
  failed: -1,
  cancelled: -1,
  expired: -1,
  refunded: -1,
};

// ──────────────────────── Async Job Queue ────────────────────────

// Simple in-memory job tracking (production: gunakan Bull/Redis)
const activeJobs = new Map();

/**
 * Trigger pemrosesan dokumen secara async
 * Non-blocking — webhook langsung return 200
 */
function triggerAsyncProcessing(orderId) {
  // Cegah duplikat processing
  if (activeJobs.has(orderId)) {
    console.log(`[Webhook] Job for ${orderId} already running, skipping.`);
    return;
  }

  activeJobs.set(orderId, {
    startedAt: new Date(),
    status: "running",
  });

  // Fire and forget — processDocument berjalan di background
  processDocument(orderId)
    .then((result) => {
      activeJobs.set(orderId, {
        startedAt: activeJobs.get(orderId)?.startedAt,
        completedAt: new Date(),
        status: result.success ? "completed" : "failed",
        result,
      });

      if (result.success) {
        console.log(
          `[Webhook] ✅ Processing ${orderId} completed: ${result.similarity}% similarity`
        );
      } else {
        console.error(
          `[Webhook] ❌ Processing ${orderId} failed: ${result.error}`
        );
      }

      // Cleanup after 1 hour
      setTimeout(() => activeJobs.delete(orderId), 60 * 60 * 1000);
    })
    .catch((err) => {
      console.error(`[Webhook] ❌ Unhandled error processing ${orderId}:`, err);
      activeJobs.set(orderId, {
        startedAt: activeJobs.get(orderId)?.startedAt,
        completedAt: new Date(),
        status: "failed",
        error: err.message,
      });
      setTimeout(() => activeJobs.delete(orderId), 60 * 60 * 1000);
    });
}

// ──────────────────────── POST /api/webhook/midtrans ────────────────────────

router.post("/webhook/midtrans", async (req, res) => {
  const startTime = Date.now();

  try {
    const notification = req.body;

    // ── Log received notification ──
    console.log("\n" + "─".repeat(60));
    console.log("[Webhook] 📩 Notifikasi diterima:", {
      order_id: notification.order_id,
      transaction_status: notification.transaction_status,
      payment_type: notification.payment_type,
      fraud_status: notification.fraud_status || "N/A",
    });

    // ── Step 1: Verify signature ──
    const signatureValid = verifySignature(notification);
    if (!signatureValid) {
      console.error("[Webhook] ⛔ Signature invalid! Possible tampering.");
      // Still return 200 to not leak info, but don't process
      return res.status(200).json({
        status: "error",
        message: "Invalid signature",
      });
    }
    console.log("[Webhook] ✅ Signature verified");

    // ── Step 2: Verify with Midtrans API (double verification) ──
    let statusResponse;
    try {
      statusResponse = await verifyNotification(notification);
    } catch (err) {
      console.error("[Webhook] Midtrans API verification failed:", err.message);
      // Fallback to notification data if API verification fails
      statusResponse = notification;
    }

    const orderId = statusResponse.order_id;
    const transactionStatus = statusResponse.transaction_status;
    const fraudStatus = statusResponse.fraud_status;
    const paymentType = statusResponse.payment_type;
    const transactionId = statusResponse.transaction_id;

    console.log(
      `[Webhook] Status: ${transactionStatus} | Fraud: ${fraudStatus || "N/A"} | Payment: ${paymentType}`
    );

    // ── Step 3: Map to internal status ──
    const newStatus = mapTransactionStatus(transactionStatus, fraudStatus);
    if (!newStatus) {
      console.warn(`[Webhook] Unmapped status, ignoring.`);
      return res.status(200).json({ status: "ok" });
    }

    // ── Step 4: Check existing order ──
    const existingOrder = await getOrder(orderId);
    if (!existingOrder) {
      console.warn(`[Webhook] Order ${orderId} not found in database`);
      return res.status(200).json({ status: "ok", message: "Order not found" });
    }

    // ── Step 5: Check status priority (prevent downgrade) ──
    const currentPriority = STATUS_PRIORITY[existingOrder.status] ?? 0;
    const newPriority = STATUS_PRIORITY[newStatus] ?? 0;

    if (newPriority < currentPriority && newPriority >= 0) {
      console.log(
        `[Webhook] ⏭️ Skip downgrade: ${existingOrder.status} → ${newStatus}`
      );
      return res.status(200).json({ status: "ok" });
    }

    // ── Step 6: Build update data ──
    const updateData = {
      status: newStatus,
      midtrans_transaction_id: transactionId,
      payment_type: paymentType,
    };

    if (newStatus === "paid") {
      updateData.paid_at = new Date().toISOString();
    }
    if (newStatus === "expired") {
      updateData.expired_at = new Date().toISOString();
    }

    // ── Step 7: Update database ──
    await updateOrder(orderId, updateData);
    const duration = Date.now() - startTime;
    console.log(
      `[Webhook] 📝 Order ${orderId}: ${existingOrder.status} → ${newStatus} (${duration}ms)`
    );

    // ── Step 8: Trigger processing if newly paid ──
    if (newStatus === "paid" && existingOrder.status !== "paid") {
      console.log(
        `[Webhook] 🚀 PAYMENT CONFIRMED for ${orderId}! Triggering async processing...`
      );
      triggerAsyncProcessing(orderId);
    }

    console.log("─".repeat(60));

    // ── Always return 200 to Midtrans ──
    return res.status(200).json({ status: "ok" });
  } catch (err) {
    console.error("[Webhook] ❌ Error:", err.message);
    console.error(err.stack);

    // ALWAYS return 200 to Midtrans to prevent infinite retries
    return res.status(200).json({
      status: "error",
      message: "Internal error (logged)",
    });
  }
});

// ──────────────────────── GET /api/jobs/:orderId — Debug ────────────────────────

router.get("/jobs/:orderId", (req, res) => {
  const job = activeJobs.get(req.params.orderId);
  if (!job) {
    return res.json({ active: false, message: "No active job found" });
  }
  return res.json({ active: true, ...job });
});

// Keep backward compatibility with old webhook endpoint
router.post("/webhook", async (req, res) => {
  // Redirect to the new endpoint
  req.url = "/webhook/midtrans";
  router.handle(req, res);
});

module.exports = router;
