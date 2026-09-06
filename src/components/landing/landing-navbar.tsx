import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { GhostMark } from "@/components/app-shell";
import { Menu, X } from "lucide-react";

export function LandingNavbar() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-transparent bg-background/80 backdrop-blur-md transition-all duration-300">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        {/* Left: Brand */}
        <div className="flex items-center gap-3">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-white shadow-md shadow-primary/30">
              <GhostMark className="h-5 w-5" />
            </div>
            <span className="text-[17px] font-extrabold tracking-tight text-foreground">Ghostline</span>
          </Link>
          <span className="hidden text-sm text-muted-foreground lg:block">
            Private Chats. Real Connections.
          </span>
        </div>

        {/* Center: Desktop Links */}
        <div className="hidden items-center gap-8 md:flex">
          <a href="#features" className="text-sm font-medium text-muted-foreground transition hover:text-foreground">
            Features
          </a>
          <a href="#privacy" className="text-sm font-medium text-muted-foreground transition hover:text-foreground">
            Privacy
          </a>
          <a href="#how-it-works" className="text-sm font-medium text-muted-foreground transition hover:text-foreground">
            How it works
          </a>
        </div>

        {/* Right: Actions */}
        <div className="hidden items-center gap-3 md:flex">
          <Link
            to="/auth"
            search={{ mode: "signin" } as never}
            className="text-sm font-semibold text-muted-foreground transition hover:text-foreground"
          >
            Sign In
          </Link>
          <Link
            to="/auth"
            className="inline-flex h-9 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white shadow-md shadow-primary/25 transition hover:bg-[#1467D8] active:scale-95"
          >
            Get Started
          </Link>
        </div>

        {/* Mobile Menu Toggle */}
        <button
          className="flex h-9 w-9 items-center justify-center rounded-lg text-foreground md:hidden"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          aria-label="Toggle menu"
        >
          {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="absolute left-0 top-16 w-full border-b border-border bg-background px-6 py-4 shadow-lg md:hidden">
          <div className="flex flex-col gap-4">
            <a
              href="#features"
              className="text-sm font-medium text-foreground"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              Features
            </a>
            <a
              href="#privacy"
              className="text-sm font-medium text-foreground"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              Privacy
            </a>
            <a
              href="#how-it-works"
              className="text-sm font-medium text-foreground"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              How it works
            </a>
            <div className="mt-4 flex flex-col gap-2">
              <Link
                to="/auth"
                search={{ mode: "signin" } as never}
                className="flex h-11 items-center justify-center rounded-xl border border-border bg-surface-2 text-sm font-semibold text-foreground"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Sign In
              </Link>
              <Link
                to="/auth"
                className="flex h-11 items-center justify-center rounded-xl bg-primary text-sm font-semibold text-white shadow-md"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Get Started
              </Link>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
