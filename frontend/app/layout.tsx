import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";

export const metadata: Metadata = {
  title: "CritHop — Multi-hop QA",
  description: "HopRAG and Self-RAG inspired multi-hop question answering.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">
        <nav className="border-b border-white/10 bg-slate-950/80 px-6 py-4 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between">
            <Link href="/" className="text-lg font-semibold tracking-tight text-white">Crit<span className="text-emerald-300">Hop</span></Link>
            <div className="flex items-center gap-4 text-sm">
              <Link
                href="/eval"
                className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-400/15 px-3.5 py-1.5 font-medium text-emerald-300 shadow-sm transition hover:bg-emerald-400/25 hover:border-emerald-300 hover:text-emerald-200"
              >
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                Evaluation Showcase
              </Link>
              <Link href="/" className="px-2 py-1 text-slate-400 hover:text-white transition">
                Query
              </Link>
            </div>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
