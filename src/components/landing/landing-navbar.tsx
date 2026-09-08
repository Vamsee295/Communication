import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { GhostMark } from "@/components/app-shell";
import { Menu, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export function LandingNavbar() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-white/5 bg-slate-900/80 backdrop-blur-md transition-all duration-300">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        {/* Left: Brand */}
        <div className="flex items-center gap-3">
          <Link to="/" className="flex items-center gap-2.5 outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 rounded-xl">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-white shadow-[0_0_15px_rgba(37,135,245,0.4)]">
              <GhostMark className="h-5 w-5" />
            </div>
            <span className="text-[17px] font-extrabold tracking-tight text-white">Ghostline</span>
          </Link>
          <span className="hidden text-sm font-medium text-slate-400 lg:block">
            Private Chats. Real Connections.
          </span>
        </div>

        {/* Center: Desktop Links */}
        <div className="hidden items-center gap-8 md:flex">
          <a href="#features" className="text-sm font-semibold text-slate-300 transition-colors hover:text-white outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm">
            Features
          </a>
          <a href="#how-it-works" className="text-sm font-semibold text-slate-300 transition-colors hover:text-white outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm">
            How it works
          </a>
          <a href="#privacy" className="text-sm font-semibold text-slate-300 transition-colors hover:text-white outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm">
            Privacy
          </a>
        </div>

        {/* Right: Actions */}
        <div className="hidden items-center gap-4 md:flex">
          <Link
            to="/auth"
            search={{ mode: "signin" } as never}
            className="text-sm font-semibold text-slate-300 transition-colors hover:text-white outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm"
          >
            Sign In
          </Link>
          <Link
            to="/auth"
            className="inline-flex h-9 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white shadow-[0_0_15px_rgba(37,135,245,0.3)] transition-all hover:bg-[#1467D8] hover:shadow-[0_0_20px_rgba(37,135,245,0.5)] active:scale-95 outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
          >
            Get Started
          </Link>
        </div>

        {/* Mobile Menu Toggle */}
        <button
          className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-300 transition-colors hover:bg-slate-800 hover:text-white md:hidden outline-none focus-visible:ring-2 focus-visible:ring-primary"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          aria-label="Toggle menu"
          aria-expanded={isMobileMenuOpen}
        >
          {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="absolute left-0 top-16 w-full border-b border-white/10 bg-slate-900/95 px-6 py-6 shadow-2xl backdrop-blur-xl md:hidden"
          >
            <div className="flex flex-col gap-5">
              <a
                href="#features"
                className="text-lg font-semibold text-slate-200 transition-colors hover:text-white"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Features
              </a>
              <a
                href="#how-it-works"
                className="text-lg font-semibold text-slate-200 transition-colors hover:text-white"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                How it works
              </a>
              <a
                href="#privacy"
                className="text-lg font-semibold text-slate-200 transition-colors hover:text-white"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Privacy
              </a>
              <div className="mt-2 flex flex-col gap-3">
                <Link
                  to="/auth"
                  search={{ mode: "signin" } as never}
                  className="flex h-12 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-sm font-bold text-white transition-colors hover:bg-white/10"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  Sign In
                </Link>
                <Link
                  to="/auth"
                  className="flex h-12 items-center justify-center rounded-xl bg-primary text-sm font-bold text-white shadow-[0_0_15px_rgba(37,135,245,0.4)] transition-colors hover:bg-[#1467D8]"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  Get Started
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
