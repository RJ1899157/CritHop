"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Navbar() {
  const pathname = usePathname();

  const navItems = [
    {
      name: "Query",
      href: "/",
      exact: true,
      description: "Ask Multi-hop Questions",
    },
    {
      name: "Results",
      href: "/results",
      exact: false,
      description: "Inspect Graph & Critique",
    },
    {
      name: "Question Bank",
      href: "/questions",
      exact: false,
      description: "Explore 17 Curated Questions",
    },
    {
      name: "Evaluation Showcase",
      href: "/eval",
      exact: false,
      badge: "HopRAG & Self-RAG",
    },
  ];

  return (
    <nav className="sticky top-0 z-50 border-b border-white/10 bg-slate-950/80 px-6 py-3.5 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2 group">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-400/20 border border-emerald-400/40 text-emerald-300 font-black text-sm group-hover:bg-emerald-400 group-hover:text-slate-950 transition">
            CH
          </div>
          <div className="flex flex-col">
            <span className="text-base font-bold tracking-tight text-white leading-none">
              Crit<span className="text-emerald-400">Hop</span>
            </span>
            <span className="text-[10px] text-slate-400 font-mono tracking-wider">
              HopRAG × Self-RAG
            </span>
          </div>
        </Link>

        {/* Distinct Tab Navigation */}
        <div className="flex items-center rounded-2xl border border-white/10 bg-white/[0.04] p-1 shadow-inner">
          {navItems.map((item) => {
            const isActive = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-medium transition ${
                  isActive
                    ? "bg-emerald-400/20 text-emerald-300 border border-emerald-400/40 shadow-sm font-semibold"
                    : "text-slate-400 hover:text-white hover:bg-white/5 border border-transparent"
                }`}
              >
                {isActive && (
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                )}
                <span>{item.name}</span>
                {item.badge && (
                  <span className="hidden sm:inline-block ml-1 rounded-full bg-emerald-400/10 px-1.5 py-0.2 text-[9px] text-emerald-300 font-normal">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
