import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Plagiarisme Checker by Ikariz id — Cek Plagiarisme Otomatis Berbasis AI",
  description:
    "Platform cek plagiarisme berbasis AI. Upload dokumen, bayar otomatis, dan dapatkan laporan PDF dengan teks tersorot beserta persentase kemiripan. Mulai dari Rp 3.000.",
  keywords: [
    "cek plagiarisme",
    "plagiarisme checker",
    "turnitin alternatif",
    "cek similarity",
    "cek kemiripan dokumen",
    "plagiarisme online",
  ],
  openGraph: {
    title: "Plagiarisme Checker by Ikariz id — Cek Plagiarisme Otomatis",
    description:
      "Upload dokumen, bayar, dan dapat laporan plagiarisme lengkap dalam hitungan menit.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col relative">{children}</body>
    </html>
  );
}
