"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";

/* ─── Inline SVG Icons (no lucide dependency needed) ─── */
const IconCheck = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-8 h-8 text-accent" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

const IconX = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-8 h-8 text-danger" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="15" y1="9" x2="9" y2="15" />
    <line x1="9" y1="9" x2="15" y2="15" />
  </svg>
);

const IconDownload = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const IconRefresh = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10" />
    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
  </svg>
);

const IconLogo = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-white" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 12l2 2 4-4" />
    <path d="M12 3c7.2 0 9 1.8 9 9s-1.8 9-9 9-9-1.8-9-9 1.8-9 9-9" />
  </svg>
);

function ResultContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const orderId = searchParams.get("orderId");

  const [status, setStatus] = useState<string>("loading");
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    if (!orderId) {
      setError("Order ID tidak ditemukan.");
      setStatus("error");
      return;
    }

    const savedStatus = localStorage.getItem(`pc_status_${orderId}`);
    if (savedStatus) {
      try {
        const parsed = JSON.parse(savedStatus);
        if (parsed.status === "completed" || parsed.status === "failed") {
          setStatus(parsed.status);
          setData(parsed);
          return;
        }
      } catch (e) {
        // ignore
      }
    }

    let intervalId: NodeJS.Timeout;

    const fetchStatus = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || `http://${window.location.hostname}:5000`;
        const res = await fetch(`${apiUrl}/api/status/${orderId}`);
        const result = await res.json();

        if (result.success) {
          const currentStatus = result.status;
          let uiStatus = "processing";
          if (currentStatus === "completed") uiStatus = "completed";
          else if (currentStatus === "failed" || currentStatus === "cancelled" || currentStatus === "expired") {
            uiStatus = "failed";
          } else if (currentStatus === "pending") {
            uiStatus = "pending_payment";
          }

          setStatus(uiStatus);
          setData(result);

          if (uiStatus === "completed" || uiStatus === "failed") {
            localStorage.setItem(`pc_status_${orderId}`, JSON.stringify(result));
            clearInterval(intervalId);
          }
        } else {
          setError(result.error || "Gagal mengambil status");
          setStatus("error");
          clearInterval(intervalId);
        }
      } catch (err) {
        console.error("Fetch status error:", err);
      }
    };

    fetchStatus();
    intervalId = setInterval(fetchStatus, 5000);
    return () => clearInterval(intervalId);
  }, [orderId]);

  /* ─── Loading / Processing ─── */
  if (status === "loading" || status === "processing" || status === "pending_payment") {
    return (
      <div className="flex flex-col items-center text-center animate-fade-in-up">
        {/* Spinner */}
        <div className="relative w-20 h-20 mb-8">
          <div className="absolute inset-0 rounded-full border-2 border-white/[0.06]" />
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary animate-spin" style={{ animationDuration: "1.2s" }} />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-3 h-3 rounded-full bg-primary/60 animate-pulse" />
          </div>
        </div>

        <h2 className="text-xl sm:text-2xl font-bold text-white mb-2 tracking-tight">
          {status === "pending_payment" ? "Menunggu Pembayaran..." : "Menganalisis Dokumen..."}
        </h2>
        <p className="text-sm text-white/40 max-w-sm leading-relaxed">
          {status === "pending_payment"
            ? "Kami sedang mengecek status pembayaran kamu."
            : "AI kami sedang memindai dokumenmu untuk mengecek plagiarisme. Proses ini memakan waktu 2–3 menit."}
        </p>

        {status === "processing" && (
          <div className="w-full max-w-xs mt-8">
            <div className="h-1 w-full bg-white/[0.04] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary to-secondary"
                style={{
                  animation: "indeterminate 2s ease-in-out infinite",
                  width: "40%",
                }}
              />
            </div>
            <p className="text-[11px] text-white/25 mt-3 animate-pulse">Mohon jangan tutup halaman ini.</p>
          </div>
        )}
      </div>
    );
  }

  /* ─── Completed ─── */
  if (status === "completed" && data) {
    return (
      <div className="flex flex-col items-center w-full max-w-md mx-auto animate-fade-in-up">
        {/* Success icon */}
        <div className="w-16 h-16 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center mb-6">
          <IconCheck />
        </div>

        <h2 className="text-2xl font-extrabold text-white mb-2 tracking-tight">Laporan Siap!</h2>
        <div className="glass rounded-full px-4 py-1.5 mb-8">
          <p className="text-xs text-white/60">
            Similarity Index: <strong className="text-white font-bold">{data.similarity}%</strong>
          </p>
        </div>

        {/* Details card */}
        <div className="glass-strong w-full p-5 sm:p-6 mb-6">
          <div className="space-y-0">
            <div className="flex justify-between items-center py-3.5 border-b border-white/[0.05]">
              <span className="text-xs text-white/35 font-medium">Order ID</span>
              <span className="text-xs text-white/70 font-mono">{data.orderId}</span>
            </div>
            <div className="flex justify-between items-center py-3.5 border-b border-white/[0.05]">
              <span className="text-xs text-white/35 font-medium">Hasil Analisis</span>
              <span className="text-sm text-accent font-bold">{data.similarity}% Kemiripan</span>
            </div>
            <div className="flex justify-between items-center py-3.5">
              <span className="text-xs text-white/35 font-medium">Jumlah Halaman</span>
              <span className="text-xs text-white/70">{data.pageCount} Halaman</span>
            </div>
          </div>
        </div>

        {/* Download button */}
        <a
          href={data.downloadUrl}
          download
          target="_blank"
          rel="noreferrer"
          className="btn-gradient w-full py-3.5 flex items-center justify-center gap-2.5 text-sm font-bold mb-3"
          style={{ background: "linear-gradient(135deg, #06d6a0 0%, #0ea5e9 100%)" }}
        >
          <span className="relative z-10 flex items-center gap-2.5">
            <IconDownload />
            Unduh Laporan PDF
          </span>
        </a>

        <p className="text-[10px] text-white/20 mb-8 text-center">
          ⏳ Link unduh berlaku selama 24 jam.
        </p>

        <Link href="/" className="flex items-center gap-2 text-xs text-primary-light/60 hover:text-primary-light transition-colors no-underline">
          <IconRefresh />
          <span>Cek dokumen lain</span>
        </Link>
      </div>
    );
  }

  /* ─── Error / Failed ─── */
  return (
    <div className="flex flex-col items-center w-full max-w-md mx-auto text-center animate-fade-in-up">
      <div className="w-16 h-16 rounded-2xl bg-danger/10 border border-danger/20 flex items-center justify-center mb-6">
        <IconX />
      </div>

      <h2 className="text-xl font-bold text-white mb-3 tracking-tight">Pemrosesan Gagal</h2>
      <p className="text-sm text-white/40 mb-8 max-w-sm leading-relaxed">
        {error || "Maaf, terjadi kesalahan saat menganalisis dokumenmu. Hal ini mungkin karena format file yang rusak atau masalah koneksi."}
      </p>

      <div className="flex gap-3 w-full max-w-xs">
        <button
          onClick={() => window.location.reload()}
          className="flex-1 py-3 rounded-xl text-xs font-semibold glass glass-hover text-white/70 border border-white/[0.06] transition-colors"
        >
          Muat Ulang
        </button>
        <button
          className="flex-1 py-3 rounded-xl text-xs font-semibold btn-gradient"
          onClick={() => alert("Menghubungi support...")}
        >
          <span className="relative z-10">Hubungi Support</span>
        </button>
      </div>
    </div>
  );
}

export default function ResultPage() {
  return (
    <main className="relative z-10 flex flex-col items-center w-full min-h-screen px-5 sm:px-6 py-8 sm:py-12">
      {/* ─── Header ─── */}
      <header className="w-full max-w-xl flex items-center justify-center mb-12 sm:mb-16 animate-fade-in-up">
        <Link href="/" className="flex items-center gap-3 no-underline group">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-lg shadow-primary/25 flex-shrink-0 group-hover:shadow-primary/40 transition-shadow">
            <IconLogo />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold tracking-tight text-white/90">Plagiarisme Checker</p>
            <p className="text-[10px] text-white/25 font-medium tracking-wide">by Ikariz id</p>
          </div>
        </Link>
      </header>

      {/* ─── Content ─── */}
      <div className="w-full max-w-xl flex-1 flex items-start justify-center">
        <Suspense fallback={
          <div className="flex items-center gap-3 animate-fade-in-up">
            <div className="w-4 h-4 spinner" />
            <span className="text-xs text-white/30">Memuat...</span>
          </div>
        }>
          <ResultContent />
        </Suspense>
      </div>

      {/* ─── Footer ─── */}
      <footer className="w-full max-w-xl mt-auto pt-12 pb-4">
        <div className="section-divider mb-5" />
        <div className="flex items-center justify-center text-white/15 text-[11px]">
          <span>© 2024 Plagiarisme Checker by Ikariz id — Powered by AI</span>
        </div>
      </footer>
    </main>
  );
}
