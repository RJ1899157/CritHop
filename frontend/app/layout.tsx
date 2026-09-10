import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CritHop — Multi-hop QA",
  description: "HopRAG and Self-RAG inspired multi-hop question answering.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">{children}</body>
    </html>
  );
}
