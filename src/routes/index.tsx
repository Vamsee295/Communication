import { useEffect, useState, useRef } from "react";
import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import {
  ArrowRight,
  Lock,
  Users,
  Zap,
  Search,
  ChevronLeft,
  Phone,
  MoreVertical,
  Plus,
  Smile,
  Mic,
  CheckCheck,
  Menu,
  X,
  ShieldCheck,
  Sparkles,
  Info,
  LogIn,
  MessageSquare,
  Flame,
  Radio,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { authService } from "@/lib/auth/session";
import { GhostMark } from "@/components/app-shell";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data } = await authService.getSession();
    if (data.session) {
      throw redirect({ to: "/chats" });
    }
  },
  component: LandingPage,
});

function LandingPage() {
  const navigate = useNavigate();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    authService.getSession().then(({ data }) => {
      if (data.session) {
        navigate({ to: "/chats", replace: true });
      }
    });
  }, [navigate]);

  // Click outside & escape to close menu
  useEffect(() => {
    if (!isMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isMenuOpen]);

  const scrollToSection = (id: string) => {
    setIsMenuOpen(false);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <main className="min-h-screen w-full bg-[#FFFFFF] font-sans flex flex-col relative overflow-x-hidden selection:bg-primary/20">
      {/* Top Navigation */}
      <header className="sticky top-0 w-full bg-white/85 backdrop-blur-md border-b border-[#DCE8F5]/50 z-50">
        <div className="flex w-full items-center justify-between px-6 py-4 max-w-[1200px] mx-auto">
          <div 
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="flex items-center gap-3 cursor-pointer select-none"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#2587F5] text-white shadow-sm">
              <GhostMark className="h-5 w-5" />
            </div>
            <span className="text-[22px] font-bold tracking-tight text-[#0B1B33]">Ghostline</span>
          </div>

          {/* Menu Anchor Container */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setIsMenuOpen((prev) => !prev)}
              className="text-[#0B1B33] p-2 rounded-xl transition-all hover:bg-[#F5FAFF] active:scale-95 flex items-center justify-center cursor-pointer"
              aria-label="Toggle Navigation Menu"
              aria-expanded={isMenuOpen}
            >
              {isMenuOpen ? (
                <X className="h-6 w-6 text-[#2587F5]" strokeWidth={2} />
              ) : (
                <Menu className="h-7 w-7" strokeWidth={1.75} />
              )}
            </button>

            {/* Animated Dropdown Menu */}
            <AnimatePresence>
              {isMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.94, y: -6 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.94, y: -6 }}
                  transition={{ duration: 0.16, ease: "easeOut" }}
                  className="absolute right-0 top-12 z-50 w-[260px] sm:w-[280px] rounded-2xl border border-[#DCE8F5] bg-white/95 p-2.5 shadow-xl shadow-slate-200/80 backdrop-blur-xl"
                >
                  <div className="flex flex-col gap-0.5">
                    <button
                      onClick={() => scrollToSection("features")}
                      className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-[#0B1B33] transition-colors hover:bg-[#F5FAFF] hover:text-[#2587F5] cursor-pointer"
                    >
                      <Sparkles className="h-4 w-4 text-[#2587F5]" />
                      <span>Features</span>
                    </button>

                    <button
                      onClick={() => scrollToSection("privacy")}
                      className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-[#0B1B33] transition-colors hover:bg-[#F5FAFF] hover:text-[#2587F5] cursor-pointer"
                    >
                      <ShieldCheck className="h-4 w-4 text-[#2587F5]" />
                      <span>Privacy & Security</span>
                    </button>

                    <button
                      onClick={() => scrollToSection("about")}
                      className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-[#0B1B33] transition-colors hover:bg-[#F5FAFF] hover:text-[#2587F5] cursor-pointer"
                    >
                      <Info className="h-4 w-4 text-[#2587F5]" />
                      <span>About Ghostline</span>
                    </button>

                    <div className="my-2 border-t border-[#DCE8F5]" />

                    <button
                      onClick={() => {
                        setIsMenuOpen(false);
                        navigate({ to: "/auth", search: { mode: "signup" } as never });
                      }}
                      className="flex items-center justify-center gap-2 rounded-xl bg-[#2587F5] px-4 py-2.5 text-sm font-bold text-white shadow-sm shadow-[#2587F5]/25 transition-all hover:bg-[#1467D8] active:scale-[0.98] cursor-pointer"
                    >
                      <span>Get Started</span>
                      <ArrowRight className="h-4 w-4" />
                    </button>

                    {/* Single-line sign in button on all mobile widths */}
                    <button
                      onClick={() => {
                        setIsMenuOpen(false);
                        navigate({ to: "/auth", search: { mode: "signin" } as never });
                      }}
                      className="mt-1.5 flex items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-center text-xs font-semibold text-[#64748B] transition-colors hover:bg-[#F5FAFF] hover:text-[#0B1B33] cursor-pointer whitespace-nowrap overflow-hidden"
                    >
                      <LogIn className="h-3.5 w-3.5 shrink-0" />
                      <span className="whitespace-nowrap">Already have an account? <span className="text-[#2587F5] font-bold">Sign In</span></span>
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="flex flex-col items-center pt-8 md:pt-12 pb-6 px-6 max-w-[1200px] mx-auto w-full z-10">
        {/* Headline with refined vertical breathing room */}
        <h1 className="text-center text-[44px] sm:text-[56px] md:text-[68px] font-black tracking-[-0.03em] text-[#0B1B33]">
          <span className="block leading-[1.08]">Real</span>
          <span className="block leading-[1.08]">Conversations</span>
          <span className="block leading-[1.12] bg-gradient-to-r from-[#2587F5] via-[#1467D8] to-[#2587F5] bg-clip-text text-transparent">
            Without Noise.
          </span>
        </h1>
        
        <p className="mt-4 text-center text-[16px] sm:text-[18px] text-[#64748B] max-w-[420px] leading-relaxed font-medium">
          A private, modern messaging app built for real connections. Direct, fast, and noise-free.
        </p>

        {/* CTA Button */}
        <button 
          id="landing-get-started"
          onClick={() => navigate({ to: "/auth", search: { mode: "signup" } as never })}
          className="mt-7 flex items-center justify-center gap-2 rounded-xl bg-[#2587F5] px-8 py-3.5 text-[16px] sm:text-[17px] font-bold text-white shadow-lg shadow-[#2587F5]/25 transition-all hover:bg-[#1467D8] hover:shadow-[#2587F5]/35 active:scale-95 cursor-pointer"
        >
          <span>Get Started</span>
          <ArrowRight className="h-5 w-5" strokeWidth={2.5} />
        </button>

        {/* Hero Highlights */}
        <div className="mt-9 flex items-start justify-center gap-6 sm:gap-14 w-full max-w-[460px]">
          <div className="flex flex-col items-center text-center gap-1.5 flex-1">
            <Lock className="h-5 w-5 text-[#2587F5]" strokeWidth={2} />
            <span className="text-[13px] text-[#64748B] font-semibold leading-tight">End-to-End<br/>Privacy</span>
          </div>
          <div className="flex flex-col items-center text-center gap-1.5 flex-1">
            <Users className="h-5 w-5 text-[#2587F5]" strokeWidth={2} />
            <span className="text-[13px] text-[#64748B] font-semibold leading-tight">Private<br/>Groups</span>
          </div>
          <div className="flex flex-col items-center text-center gap-1.5 flex-1">
            <Zap className="h-5 w-5 text-[#2587F5]" strokeWidth={2} />
            <span className="text-[13px] text-[#64748B] font-semibold leading-tight">Instant<br/>Realtime</span>
          </div>
        </div>
      </section>

      {/* Product Preview Section (Alternating #F8FAFC background) */}
      <section className="relative isolate w-full bg-[#F8FAFC] border-y border-[#DCE8F5]/60 py-12 sm:py-16 overflow-hidden select-none">
        {/* Soft subtle radial ambient glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] sm:w-[680px] h-[360px] sm:h-[480px] rounded-full bg-[#EBF4FE]/80 blur-2xl -z-10 pointer-events-none" />
        
        {/* Section Header */}
        <div className="text-center max-w-xl mx-auto px-6 mb-8 sm:mb-10">
          <span className="text-xs font-bold tracking-widest text-[#2587F5] uppercase">
            Ghostline Mobile Experience
          </span>
          <h2 className="mt-1.5 text-2xl sm:text-3xl font-extrabold text-[#0B1B33] tracking-tight">
            Designed for intimate, focused chat.
          </h2>
        </div>

        {/* Phones cluster container */}
        <div className="relative w-full max-w-[620px] h-[520px] sm:h-[590px] flex justify-center mx-auto px-4">
          
          {/* Left Phone (Chats List) */}
          <div className="absolute left-3 sm:left-6 top-8 sm:top-10 w-[240px] sm:w-[280px] md:w-[295px] h-[465px] sm:h-[530px] rounded-[38px] sm:rounded-[42px] border-[9px] sm:border-[11px] border-[#1E293B] bg-white shadow-2xl overflow-hidden flex flex-col z-10 shadow-slate-300/60">
            {/* Notch */}
            <div className="flex justify-between items-center px-4 pt-2.5 text-[10px] sm:text-[11px] font-bold text-black z-20 relative bg-white pb-1.5">
              <span>9:41</span>
              <div className="flex gap-1 items-center">
                <div className="w-3 h-2 bg-black rounded-[2px]" />
                <div className="w-3 h-2 bg-black rounded-[2px]" />
                <div className="w-4 h-2 border border-black rounded-[2px] relative"><div className="absolute inset-0.5 bg-black rounded-[1px]" /></div>
              </div>
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[76px] sm:w-[88px] h-[18px] bg-[#1E293B] rounded-b-[12px]" />
            </div>

            <div className="bg-white px-3.5 pb-2">
              <div className="flex items-center justify-between">
                <h3 className="text-[19px] sm:text-[21px] font-black text-[#0B1B33]">Chats</h3>
                <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" title="Connected" />
              </div>
              <div className="mt-2 flex items-center gap-2 bg-[#F1F5F9] rounded-xl px-2.5 py-1.5 text-[#94A3B8]">
                <Search className="w-3.5 h-3.5" />
                <span className="text-[12px]">Search conversations...</span>
              </div>
            </div>

            <div className="flex-1 bg-white flex flex-col px-2.5 pt-0.5 divide-y divide-slate-50 overflow-hidden">
              <ChatRow avatar="V" name="Vamsee" message="Typing..." time="" isTyping active />
              <ChatRow avatar="D" name="Alex" message="Locked the repo keys." time="10:18 AM" />
              <ChatRow avatar="👥" name="Security Core" message="Elena: Zero leaks detected." time="09:42 AM" bg="bg-[#EAF4FF] text-[#2587F5]" />
              <ChatRow avatar="👥" name="Ghostline Team" message="V9 release candidate ready!" time="Yesterday" bg="bg-purple-100 text-purple-600" />
            </div>
            {/* Home indicator */}
            <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-[35%] h-[3.5px] bg-slate-300 rounded-full" />
          </div>

          {/* Right Phone (Chat Screen) */}
          <div className="absolute right-3 sm:right-6 top-0 w-[252px] sm:w-[295px] md:w-[315px] h-[495px] sm:h-[565px] rounded-[40px] sm:rounded-[46px] border-[10px] sm:border-[12px] border-[#1E293B] bg-[#F7FAFE] shadow-2xl overflow-hidden flex flex-col z-20 shadow-slate-400/50">
            {/* Notch */}
            <div className="flex justify-between items-center px-4 pt-2.5 text-[10px] sm:text-[11px] font-bold text-black z-20 relative bg-white pb-1.5">
              <span>9:41</span>
              <div className="flex gap-1 items-center">
                <div className="w-3 h-2 bg-black rounded-[2px]" />
                <div className="w-3 h-2 bg-black rounded-[2px]" />
                <div className="w-4 h-2 border border-black rounded-[2px] relative"><div className="absolute inset-0.5 bg-black rounded-[1px]" /></div>
              </div>
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[82px] sm:w-[96px] h-[19px] sm:h-[21px] bg-[#1E293B] rounded-b-[14px]" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-2.5 pb-2 pt-1 bg-white border-b border-slate-100 z-10 shadow-xs">
              <div className="flex items-center gap-1.5">
                <ChevronLeft className="w-4 h-4 text-[#0B1B33]" />
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-slate-200 overflow-hidden flex items-center justify-center text-[11px] font-bold text-slate-500">
                  <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Vamsee&backgroundColor=e2e8f0" alt="Vamsee" className="w-full h-full object-cover" />
                </div>
                <div className="flex flex-col ml-0.5">
                  <span className="text-[12.5px] sm:text-[13.5px] font-bold text-[#0B1B33] leading-none">Vamsee</span>
                  <span className="text-[9px] text-emerald-600 mt-0.5 font-semibold">Active now</span>
                </div>
              </div>
              <div className="flex items-center gap-2 text-[#0B1B33] pr-1.5">
                <Phone className="w-3.5 h-3.5 text-[#2587F5]" />
                <MoreVertical className="w-3.5 h-3.5 text-[#64748B]" />
              </div>
            </div>

            {/* Security Badge Pill */}
            <div className="mx-auto mt-2 px-2.5 py-0.5 rounded-full bg-white/90 border border-[#DCE8F5] text-[9.5px] font-semibold text-[#64748B] flex items-center gap-1 shadow-xs">
              <Lock className="w-2.5 h-2.5 text-[#2587F5]" />
              <span>End-to-End Encrypted</span>
            </div>

            {/* Chat area */}
            <div className="flex-1 overflow-hidden p-3 flex flex-col gap-2">
              <div className="self-start max-w-[88%] mt-0.5">
                <div className="bg-white rounded-[16px] rounded-tl-xs px-3 py-1.5 text-[12px] sm:text-[12.5px] text-[#0B1B33] shadow-xs shadow-slate-200/50 leading-snug">
                  Hey! The Ghostline release is ready. 🚀
                </div>
                <div className="text-[8px] sm:text-[8.5px] text-[#94A3B8] mt-0.5 ml-1 font-medium">10:24 AM</div>
              </div>

              <div className="self-end max-w-[88%]">
                <div className="bg-[#2587F5] text-white rounded-[16px] rounded-tr-xs px-3 py-1.5 text-[12px] sm:text-[12.5px] shadow-xs shadow-[#2587F5]/20 leading-snug">
                  Clean architecture. Zero tracking noise.
                </div>
                <div className="text-[8px] sm:text-[8.5px] text-[#94A3B8] mt-0.5 mr-1 text-right flex items-center justify-end gap-1 font-medium">
                  10:25 AM <CheckCheck className="w-3 h-3 text-[#2587F5]" />
                </div>
              </div>

              <div className="self-start max-w-[88%]">
                <div className="bg-white rounded-[16px] rounded-tl-xs px-3 py-1.5 text-[12px] sm:text-[12.5px] text-[#0B1B33] shadow-xs shadow-slate-200/50 leading-snug">
                  Direct WebRTC calling sounds crystal clear too!
                </div>
                <div className="text-[8px] sm:text-[8.5px] text-[#94A3B8] mt-0.5 ml-1 font-medium">10:26 AM</div>
              </div>

              <div className="self-end max-w-[88%]">
                <div className="bg-[#2587F5] text-white rounded-[16px] rounded-tr-xs px-3 py-1.5 text-[12px] sm:text-[12.5px] shadow-xs shadow-[#2587F5]/20 leading-snug">
                  Let's deploy. 🔒
                </div>
                <div className="text-[8px] sm:text-[8.5px] text-[#94A3B8] mt-0.5 mr-1 text-right flex items-center justify-end gap-1 font-medium">
                  10:27 AM <CheckCheck className="w-3 h-3 text-[#2587F5]" />
                </div>
              </div>
            </div>

            {/* Input */}
            <div className="bg-white p-2 pb-4 sm:pb-5 border-t border-slate-100 flex items-center gap-1.5">
              <Plus className="w-4 h-4 text-[#64748B]" />
              <div className="flex-1 bg-[#F5FAFF] rounded-full h-7 sm:h-8 px-3 flex items-center justify-between border border-[#E2EEFC]">
                <span className="text-[11px] sm:text-[12px] text-[#94A3B8]">Type a message...</span>
                <Smile className="w-3.5 h-3.5 text-[#94A3B8]" />
              </div>
              <Mic className="w-4 h-4 text-[#2587F5]" />
            </div>
            
            {/* Home indicator */}
            <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-[35%] h-[3.5px] bg-slate-300 rounded-full" />
          </div>

        </div>
      </section>

      {/* SECTION 1: Features (Pure White #FFFFFF background) */}
      <section id="features" className="scroll-mt-24 w-full max-w-[1100px] mx-auto px-6 py-16 sm:py-20">
        <div className="text-center max-w-2xl mx-auto mb-12 sm:mb-14">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-[#EAF4FF] px-3.5 py-1 text-xs font-bold tracking-wide text-[#2587F5] uppercase">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Features</span>
          </div>
          <h2 className="mt-3 text-3xl sm:text-4xl font-black tracking-tight text-[#0B1B33]">
            Engineered for clarity and speed.
          </h2>
          <p className="mt-2.5 text-base text-[#64748B] leading-relaxed">
            Everything you need for seamless, instantaneous communication without the noise and algorithmic feeds.
          </p>
        </div>

        {/* Asymmetric / Anchored Grid: Feature 1 gets visual anchor treatment */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          
          {/* Featured Anchor Card: End-to-End Privacy (Spans 2 cols on lg) */}
          <div className="lg:col-span-2 group rounded-2xl border border-[#2587F5]/30 bg-[#F5FAFF] p-7 shadow-sm hover:shadow-md transition-all flex flex-col justify-between relative overflow-hidden">
            <div className="absolute top-0 right-0 w-48 h-48 bg-[#2587F5]/5 rounded-full blur-2xl pointer-events-none" />
            
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#2587F5] text-white shadow-sm shadow-[#2587F5]/20">
                  <Lock className="h-6 w-6" />
                </div>
                <span className="rounded-full bg-[#EAF4FF] border border-[#2587F5]/20 px-3 py-1 text-xs font-bold text-[#2587F5]">
                  Core Guarantee
                </span>
              </div>
              <h3 className="text-xl font-bold text-[#0B1B33]">End-to-End Encrypted Conversations</h3>
              <p className="mt-2.5 text-[15px] text-[#64748B] leading-relaxed max-w-xl">
                Messages, voice notes, and media are encrypted with client-held keys. Direct voice and video calls connect browser-to-browser via WebRTC data streams without third-party surveillance.
              </p>
            </div>

            <div className="mt-6 pt-4 border-t border-[#DCE8F5]/80 flex flex-wrap items-center gap-4 text-xs font-semibold text-[#0B1B33]">
              <span className="flex items-center gap-1.5 text-[#2587F5]"><CheckCheck className="h-4 w-4" /> Cryptographic signatures</span>
              <span className="flex items-center gap-1.5 text-[#2587F5]"><CheckCheck className="h-4 w-4" /> Peer-to-peer WebRTC calls</span>
              <span className="flex items-center gap-1.5 text-[#2587F5]"><CheckCheck className="h-4 w-4" /> No intermediary logging</span>
            </div>
          </div>

          {/* Card 2: Realtime Messaging */}
          <div className="group rounded-2xl border border-[#DCE8F5] bg-white p-6 shadow-sm hover:shadow-md hover:border-[#2587F5]/40 transition-all flex flex-col justify-between">
            <div>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#EAF4FF] text-[#2587F5] mb-4 group-hover:scale-105 transition-transform">
                <Zap className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-bold text-[#0B1B33]">Realtime Messaging</h3>
              <p className="mt-2 text-sm text-[#64748B] leading-relaxed">
                Instant message delivery, fluid typing indicators, live presence indicators, and exact read receipts with zero lag.
              </p>
            </div>
          </div>

          {/* Card 3: HD Voice & Video Calls */}
          <div className="group rounded-2xl border border-[#DCE8F5] bg-white p-6 shadow-sm hover:shadow-md hover:border-[#2587F5]/40 transition-all flex flex-col justify-between">
            <div>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#EAF4FF] text-[#2587F5] mb-4 group-hover:scale-105 transition-transform">
                <Phone className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-bold text-[#0B1B33]">HD Voice & Video Calls</h3>
              <p className="mt-2 text-sm text-[#64748B] leading-relaxed">
                Direct peer-to-peer audio and video calling with adaptive bitrate quality and intuitive in-call controls.
              </p>
            </div>
          </div>

          {/* Card 4: Group Conversations */}
          <div className="group rounded-2xl border border-[#DCE8F5] bg-white p-6 shadow-sm hover:shadow-md hover:border-[#2587F5]/40 transition-all flex flex-col justify-between">
            <div>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#EAF4FF] text-[#2587F5] mb-4 group-hover:scale-105 transition-transform">
                <Users className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-bold text-[#0B1B33]">Group Conversations</h3>
              <p className="mt-2 text-sm text-[#64748B] leading-relaxed">
                Create and manage collaborative group chats with custom names, avatars, and member permission controls.
              </p>
            </div>
          </div>

          {/* Card 5: Vanish Mode */}
          <div className="group rounded-2xl border border-[#DCE8F5] bg-white p-6 shadow-sm hover:shadow-md hover:border-[#2587F5]/40 transition-all flex flex-col justify-between">
            <div>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#EAF4FF] text-[#2587F5] mb-4 group-hover:scale-105 transition-transform">
                <Flame className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-bold text-[#0B1B33]">Vanish Mode</h3>
              <p className="mt-2 text-sm text-[#64748B] leading-relaxed">
                Disappearing message timers for sensitive conversations that clear automatically once viewed.
              </p>
            </div>
          </div>

          {/* Card 6: Instant Session Control */}
          <div className="group rounded-2xl border border-[#DCE8F5] bg-white p-6 shadow-sm hover:shadow-md hover:border-[#2587F5]/40 transition-all flex flex-col justify-between">
            <div>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#EAF4FF] text-[#2587F5] mb-4 group-hover:scale-105 transition-transform">
                <Radio className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-bold text-[#0B1B33]">Instant Session Control</h3>
              <p className="mt-2 text-sm text-[#64748B] leading-relaxed">
                Real-time multi-device management. Revoke any browser session instantly with zero lingering tokens.
              </p>
            </div>
          </div>

        </div>
      </section>

      {/* SECTION 2: Privacy & Security (Subtle #F8FAFC background) */}
      <section id="privacy" className="scroll-mt-24 w-full bg-[#F8FAFC] border-y border-[#DCE8F5]/60 py-16 sm:py-20">
        <div className="max-w-[1100px] mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto mb-12 sm:mb-14">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-[#EAF4FF] px-3.5 py-1 text-xs font-bold tracking-wide text-[#2587F5] uppercase">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Privacy & Security</span>
            </div>
            <h2 className="mt-3 text-3xl sm:text-4xl font-black tracking-tight text-[#0B1B33]">
              Your privacy is our baseline.
            </h2>
            <p className="mt-2.5 text-base text-[#64748B] leading-relaxed">
              Ghostline is engineered from the ground up with strict confidentiality principles so you never have to wonder if your data is safe.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="rounded-2xl border border-[#DCE8F5] bg-white p-6 flex flex-col justify-between shadow-xs">
              <div>
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#2587F5] text-white mb-4 shadow-sm shadow-[#2587F5]/20">
                  <Lock className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-bold text-[#0B1B33]">End-to-End Encrypted Calls</h3>
                <p className="mt-2 text-sm text-[#64748B] leading-relaxed">
                  Direct voice and video calls connect browser-to-browser via WebRTC data streams. Call media is never stored or routed through intermediary proxy recording servers.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-[#DCE8F5]/60 flex items-center gap-2 text-xs font-bold text-[#2587F5]">
                <CheckCheck className="h-4 w-4" />
                <span>Zero third-party call intercept</span>
              </div>
            </div>

            <div className="rounded-2xl border border-[#DCE8F5] bg-white p-6 flex flex-col justify-between shadow-xs">
              <div>
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#2587F5] text-white mb-4 shadow-sm shadow-[#2587F5]/20">
                  <Zap className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-bold text-[#0B1B33]">Realtime Session Revocation</h3>
                <p className="mt-2 text-sm text-[#64748B] leading-relaxed">
                  Instantly revoke any signed-in browser session across all your devices from Settings. Revocations take effect immediately with zero lingering access.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-[#DCE8F5]/60 flex items-center gap-2 text-xs font-bold text-[#2587F5]">
                <CheckCheck className="h-4 w-4" />
                <span>Instant security enforcement</span>
              </div>
            </div>

            <div className="rounded-2xl border border-[#DCE8F5] bg-white p-6 flex flex-col justify-between shadow-xs">
              <div>
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#2587F5] text-white mb-4 shadow-sm shadow-[#2587F5]/20">
                  <GhostMark className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-bold text-[#0B1B33]">Zero Data Selling</h3>
                <p className="mt-2 text-sm text-[#64748B] leading-relaxed">
                  No tracking scripts, no behavioral ad profiling, no advertising networks, and no telemetry spam. Your personal conversations always stay strictly yours.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-[#DCE8F5]/60 flex items-center gap-2 text-xs font-bold text-[#2587F5]">
                <CheckCheck className="h-4 w-4" />
                <span>No behavioral tracking</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 3: About Ghostline (Pure White #FFFFFF background) */}
      <section id="about" className="scroll-mt-24 w-full max-w-[900px] mx-auto px-6 py-16 sm:py-20">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-[#EAF4FF] px-3.5 py-1 text-xs font-bold tracking-wide text-[#2587F5] uppercase">
            <Info className="h-3.5 w-3.5" />
            <span>About Ghostline</span>
          </div>
          <h2 className="mt-3 text-3xl sm:text-4xl font-black tracking-tight text-[#0B1B33]">
            A quieter place for conversations that matter.
          </h2>
        </div>

        <div className="rounded-3xl border border-[#DCE8F5] bg-white p-7 sm:p-9 shadow-sm">
          <p className="text-base sm:text-[17px] text-[#0B1B33] leading-relaxed font-medium">
            Ghostline was built to bring back the simplicity and intimacy of real communication. In a world of endless feeds, notification overload, and intrusive tracking, Ghostline provides a clean, calm, and private sanctuary for your most important connections.
          </p>

          <div className="mt-7 rounded-2xl bg-[#F5FAFF] p-5 sm:p-6 border border-[#E2EEFC]">
            <h4 className="font-bold text-[#0B1B33] text-xs uppercase tracking-wider mb-3">Our Core Principles</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm text-[#64748B]">
              <div className="flex flex-col gap-1">
                <span className="font-bold text-[#0B1B33]">Calm Restraint</span>
                <span className="text-xs leading-normal">Apple-like minimalism designed to reduce cognitive fatigue.</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="font-bold text-[#0B1B33]">Modern Density</span>
                <span className="text-xs leading-normal">Refined layout with fast access to all active chats and calls.</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="font-bold text-[#0B1B33]">Realtime Purity</span>
                <span className="text-xs leading-normal">Bulletproof synchronization without cluttered social gimmicks.</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Bottom CTA Banner */}
      <section className="w-full max-w-[900px] mx-auto px-6 py-8 mb-12">
        <div className="rounded-3xl bg-gradient-to-br from-[#2587F5] to-[#1467D8] p-8 sm:p-12 text-center text-white shadow-xl shadow-[#2587F5]/20 flex flex-col items-center">
          <h3 className="text-2xl sm:text-3xl font-black tracking-tight">Ready for private, noise-free messaging?</h3>
          <p className="mt-2 text-sm sm:text-base text-white/90 max-w-md font-medium">
            Join Ghostline today and experience messaging designed for what matters.
          </p>
          <button
            onClick={() => navigate({ to: "/auth", search: { mode: "signup" } as never })}
            className="mt-6 flex items-center justify-center gap-2 rounded-xl bg-white px-7 py-3 text-[15px] font-bold text-[#2587F5] shadow-md transition-all hover:bg-[#F5FAFF] hover:scale-105 active:scale-95 cursor-pointer"
          >
            <span>Get Started Free</span>
            <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="w-full border-t border-[#DCE8F5]/60 bg-[#F8FAFC] py-10 px-6 z-20">
        <div className="max-w-[1100px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#2587F5] text-white">
              <GhostMark className="h-3.5 w-3.5" />
            </div>
            <span className="text-sm font-bold text-[#0B1B33]">Ghostline</span>
            <span className="text-xs text-[#94A3B8] ml-2">© 2026 Ghostline. Built for real connections.</span>
          </div>

          <div className="flex items-center gap-6 text-xs font-semibold text-[#64748B]">
            <button onClick={() => scrollToSection("features")} className="hover:text-[#2587F5] transition-colors cursor-pointer">Features</button>
            <button onClick={() => scrollToSection("privacy")} className="hover:text-[#2587F5] transition-colors cursor-pointer">Privacy & Security</button>
            <button onClick={() => scrollToSection("about")} className="hover:text-[#2587F5] transition-colors cursor-pointer">About</button>
            <button onClick={() => navigate({ to: "/auth", search: { mode: "signin" } as never })} className="hover:text-[#2587F5] transition-colors cursor-pointer">Sign In</button>
          </div>
        </div>
      </footer>
    </main>
  );
}

// Simple Chat Row helper for the left mockup
function ChatRow({ avatar, name, message, time, isTyping, active, bg = "bg-slate-200 text-slate-600" }: any) {
  return (
    <div className={`flex items-center gap-2.5 py-1.5 px-2 ${active ? 'bg-[#F8FAFC] rounded-xl' : ''}`}>
      <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center font-bold text-[11px] sm:text-[12px] shrink-0 overflow-hidden ${bg}`}>
        {avatar === "V" ? (
           <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Vamsee&backgroundColor=e2e8f0" alt="Vamsee" className="w-full h-full object-cover" />
        ) : avatar === "D" ? (
          <div className="bg-[#6366F1] text-white w-full h-full flex items-center justify-center">A</div>
        ) : avatar === "👥" ? (
          <Users className="w-3.5 h-3.5" />
        ) : avatar}
      </div>
      <div className="flex flex-col flex-1 overflow-hidden">
        <div className="flex justify-between items-center w-full">
          <span className="text-[12px] sm:text-[13px] font-bold text-[#0B1B33]">{name}</span>
          {time && <span className="text-[9px] text-[#94A3B8]">{time}</span>}
        </div>
        <span className={`text-[10.5px] sm:text-[11.5px] truncate ${isTyping ? 'text-[#2587F5] font-semibold' : 'text-[#64748B]'}`}>
          {message}
        </span>
      </div>
    </div>
  );
}

