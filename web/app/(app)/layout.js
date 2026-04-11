"use client";
import { useState } from "react";
import Sidebar from "@/components/Sidebar";

export default function AppLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const close = () => setSidebarOpen(false);

  return (
    <div className="layout">
      {/* ── Mobile top bar ── */}
      <header className="mobile-header">
        <button
          className="hamburger"
          onClick={() => setSidebarOpen(true)}
          aria-label="Open menu"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="5"  x2="17" y2="5" />
            <line x1="3" y1="10" x2="17" y2="10" />
            <line x1="3" y1="15" x2="17" y2="15" />
          </svg>
        </button>
        <span className="mobile-logo">Factory <span>Manager</span></span>
      </header>

      {/* ── Sidebar overlay (tap to close) ── */}
      <div
        className={`sidebar-overlay${sidebarOpen ? " visible" : ""}`}
        onClick={close}
      />

      <Sidebar isOpen={sidebarOpen} onClose={close} />

      <main className="main">
        {children}
      </main>
    </div>
  );
}
