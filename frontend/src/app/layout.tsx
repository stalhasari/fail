import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TriMind - Klinik Karar Destek Sistemi",
  description:
    "XGBoost ve SHAP tabanlı yapay zeka destekli klinik karar destek mekanizması. Hipertansiyon, Tip 2 Diyabet ve Hipotiroidi risk tahmini.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">


        {/* Main Content */}
        <main className="mx-auto max-w-7xl px-6 py-6">{children}</main>

        {/* Footer */}
        <footer className="border-t border-slate-200 mt-8 bg-white text-slate-500">
          <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between text-xs">
            <span className="font-medium text-slate-700">TriMind v0.1.0 - Hackathon Demo</span>
            <span className="hidden sm:inline-block">Açıklanabilir Yapay Zeka ile Klinik Karar Destek</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
