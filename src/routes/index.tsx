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
      <section className="flex flex-col items-center pt-8 md:pt-14 px-6 max-w-[1200px] mx-auto w-full z-10">
        {/* Headline with refined vertical breathing room */}
        <h1 className="text-center text-[46px] sm:text-[58px] md:text-[70px] font-black tracking-[-0.025em] text-[#0B1B33]">
          <span className="block leading-[1.12]">Real</span>
          <span className="block leading-[1.12]">Conversations</span>
          <span className="block leading-[1.14] bg-gradient-to-r from-[#2587F5] via-[#337DF6] to-[#5850EC] bg-clip-text text-transparent">
            Without Noise.
          </span>
        </h1>
        
        <p className="mt-5 text-center text-[16px] sm:text-[18px] text-[#64748B] max-w-[360px] leading-snug font-medium">
          A private, modern messaging app<br className="hidden sm:block" /> to keep you close to the people<br className="hidden sm:block" /> who matter.
        </p>

        {/* CTA Button */}
        <button 
          id="landing-get-started"
          onClick={() => navigate({ to: "/auth", search: { mode: "signup" } as never })}
          className="mt-8 flex items-center justify-center gap-2 rounded-xl bg-[#2587F5] px-8 py-3.5 text-[17px] font-bold text-white shadow-lg shadow-[#2587F5]/30 transition-transform hover:scale-105 active:scale-95 cursor-pointer"
        >
          <span>Get Started</span>
          <ArrowRight className="h-5 w-5" strokeWidth={2.5} />
        </button>

        {/* Hero Highlights */}
        <div className="mt-12 flex items-start justify-center gap-6 sm:gap-16 w-full max-w-[420px]">
          <div className="flex flex-col items-center text-center gap-2 flex-1">
            <Lock className="h-7 w-7 text-[#64748B]" strokeWidth={1.5} />
            <span className="text-[14px] text-[#64748B] font-medium leading-tight">End-to-end<br/>privacy</span>
          </div>
          <div className="flex flex-col items-center text-center gap-2 flex-1">
            <Users className="h-7 w-7 text-[#64748B]" strokeWidth={1.5} />
            <span className="text-[14px] text-[#64748B] font-medium leading-tight">Connect with<br/>friends</span>
          </div>
          <div className="flex flex-col items-center text-center gap-2 flex-1">
            <Zap className="h-7 w-7 text-[#64748B]" strokeWidth={1.5} />
            <span className="text-[14px] text-[#64748B] font-medium leading-tight">Fast &<br/>simple</span>
          </div>
        </div>
      </section>

      {/* Interactive App Mockup Section */}
      <section className="relative isolate mt-16 sm:mt-20 flex justify-center w-full min-h-[520px] sm:min-h-[640px] pointer-events-none select-none">
        {/* Soft blue framing circle directly behind the phones */}
        <div className="absolute top-10 sm:top-8 left-1/2 -translate-x-1/2 w-[340px] sm:w-[460px] h-[340px] sm:h-[460px] rounded-full bg-[#EBF4FE] -z-10" />
        
        {/* Phones cluster container */}
        <div className="relative w-[344px] sm:w-[420px] md:w-[460px] h-[550px] sm:h-[630px] flex justify-center mx-auto">
          
          {/* Left Phone (Chats List) */}
          <div className="absolute left-0 top-12 sm:top-14 w-[246px] sm:w-[282px] h-[505px] sm:h-[575px] rounded-[38px] sm:rounded-[42px] border-[10px] sm:border-[11px] border-[#1E293B] bg-white shadow-2xl overflow-hidden flex flex-col z-10 shadow-slate-300/50">
            {/* Notch */}
            <div className="flex justify-between items-center px-5 pt-3 text-[11px] font-bold text-black z-20 relative bg-white pb-2">
              <span>9:41</span>
              <div className="flex gap-1 items-center">
                <div className="w-3.5 h-2.5 bg-black rounded-[2px]" />
                <div className="w-3.5 h-2.5 bg-black rounded-[2px]" />
                <div className="w-5 h-2.5 border border-black rounded-[2px] relative"><div className="absolute inset-0.5 bg-black rounded-[1px]" /></div>
              </div>
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[84px] sm:w-[94px] h-[20px] bg-[#1E293B] rounded-b-[14px]" />
            </div>

            <div className="bg-white px-4 pb-2">
              <h2 className="text-[21px] font-black mt-1 text-[#0B1B33]">Chats</h2>
              <div className="mt-2.5 flex items-center gap-2 bg-[#F1F5F9] rounded-xl px-3 py-1.5 text-[#94A3B8]">
                <Search className="w-4 h-4" />
                <span className="text-[13px]">Search...</span>
              </div>
            </div>

            <div className="flex-1 bg-white flex flex-col px-3 pt-1">
              <ChatRow avatar="V" name="Vamsee" message="Typing..." time="" isTyping active />
              <ChatRow avatar="D" name="DEMO_05" message="Hey!" time="" />
              <ChatRow avatar="👥" name="Study Group" message="You: Sent a file" time="" bg="bg-[#EAF4FF] text-[#2587F5]" />
              <ChatRow avatar="👥" name="College Buddies" message="Ravi: 🖼️ Photo" time="" bg="bg-purple-100 text-purple-600" />
              <ChatRow avatar="👥" name="Projects" message="You: Let's do this!" time="" bg="bg-[#EAF4FF] text-[#2587F5]" />
            </div>
            {/* Home indicator */}
            <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-[35%] h-[4px] bg-slate-300 rounded-full" />
          </div>

          {/* Right Phone (Chat Screen) */}
          <div className="absolute right-0 top-2 sm:top-0 w-[262px] sm:w-[305px] h-[535px] sm:h-[620px] rounded-[40px] sm:rounded-[46px] border-[11px] sm:border-[12px] border-[#1E293B] bg-[#F7FAFE] shadow-2xl overflow-hidden flex flex-col z-20 shadow-slate-400/40">
            {/* Notch */}
            <div className="flex justify-between items-center px-5 pt-3 text-[11px] font-bold text-black z-20 relative bg-white pb-2">
              <span>9:41</span>
              <div className="flex gap-1 items-center">
                <div className="w-3.5 h-2.5 bg-black rounded-[2px]" />
                <div className="w-3.5 h-2.5 bg-black rounded-[2px]" />
                <div className="w-5 h-2.5 border border-black rounded-[2px] relative"><div className="absolute inset-0.5 bg-black rounded-[1px]" /></div>
              </div>
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[90px] sm:w-[102px] h-[21px] sm:h-[23px] bg-[#1E293B] rounded-b-[15px] sm:rounded-b-[17px]" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-2.5 pb-2 pt-1.5 bg-white border-b border-slate-100 z-10 shadow-xs">
              <div className="flex items-center gap-1.5">
                <ChevronLeft className="w-5 h-5 text-[#0B1B33]" />
                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-slate-200 overflow-hidden flex items-center justify-center text-[12px] font-bold text-slate-500">
                  <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Vamsee&backgroundColor=e2e8f0" alt="Vamsee" className="w-full h-full object-cover" />
                </div>
                <div className="flex flex-col ml-0.5">
                  <span className="text-[13.5px] font-bold text-[#0B1B33] leading-none">Vamsee</span>
                  <span className="text-[9.5px] text-[#64748B] mt-0.5 font-medium">Online</span>
                </div>
              </div>
              <div className="flex items-center gap-2.5 text-[#0B1B33] pr-2">
                <Phone className="w-4 h-4" />
                <MoreVertical className="w-4 h-4" />
              </div>
            </div>

            {/* Chat area */}
            <div className="flex-1 overflow-hidden p-3 flex flex-col gap-2.5">
              <div className="self-start max-w-[85%] mt-1">
                <div className="bg-white rounded-[18px] rounded-tl-sm px-3.5 py-2 text-[12.5px] sm:text-[13px] text-[#0B1B33] shadow-xs shadow-slate-200/50 leading-snug">
                  Hey! 👋
                </div>
                <div className="text-[8.5px] sm:text-[9px] text-[#94A3B8] mt-1 ml-1 font-medium">10:24 AM</div>
              </div>

              <div className="self-end max-w-[85%] mt-1.5">
                <div className="bg-[#2587F5] text-white rounded-[18px] rounded-tr-sm px-3.5 py-2 text-[12.5px] sm:text-[13px] shadow-xs shadow-[#2587F5]/20 leading-snug">
                  What's up?
                </div>
                <div className="text-[8.5px] sm:text-[9px] text-[#94A3B8] mt-1 mr-1 text-right flex items-center justify-end gap-1 font-medium">
                  10:25 AM <CheckCheck className="w-3.5 h-3.5 text-[#2587F5]" />
                </div>
              </div>

              <div className="self-start max-w-[85%] mt-1.5">
                <div className="bg-white rounded-[18px] rounded-tl-sm px-3.5 py-2 text-[12.5px] sm:text-[13px] text-[#0B1B33] shadow-xs shadow-slate-200/50 leading-snug">
                  Just working on the project. You?
                </div>
                <div className="text-[8.5px] sm:text-[9px] text-[#94A3B8] mt-1 ml-1 font-medium">10:26 AM</div>
              </div>

              <div className="self-end max-w-[85%] mt-1.5">
                <div className="bg-[#2587F5] text-white rounded-[18px] rounded-tr-sm px-3.5 py-2 text-[12.5px] sm:text-[13px] shadow-xs shadow-[#2587F5]/20 leading-snug">
                  Same here! Let's sync later.
                </div>
                <div className="text-[8.5px] sm:text-[9px] text-[#94A3B8] mt-1 mr-1 text-right flex items-center justify-end gap-1 font-medium">
                  10:27 AM <CheckCheck className="w-3.5 h-3.5 text-[#2587F5]" />
                </div>
              </div>
            </div>

            {/* Input */}
            <div className="bg-white p-2.5 pb-5 sm:pb-6 border-t border-slate-100 flex items-center gap-2">
              <Plus className="w-5 h-5 text-[#0B1B33]" />
              <div className="flex-1 bg-[#F5FAFF] rounded-full h-8 sm:h-9 px-3.5 flex items-center justify-between border border-[#E2EEFC]">
                <span className="text-[12px] sm:text-[13px] text-[#94A3B8]">Type a message...</span>
                <Smile className="w-4 h-4 text-[#94A3B8]" />
              </div>
              <Mic className="w-5 h-5 text-[#0B1B33]" />
            </div>
            
            {/* Home indicator */}
            <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-[35%] h-[4px] bg-slate-300 rounded-full" />
          </div>

        </div>
      </section>

      {/* SECTION 1: Features */}
      <section id="features" className="scroll-mt-24 w-full max-w-[1100px] mx-auto px-6 py-20 sm:py-28 border-t border-[#DCE8F5]/70">
        <div className="text-center max-w-2xl mx-auto mb-14 sm:mb-16">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-[#EAF4FF] px-3.5 py-1 text-xs font-bold tracking-wide text-[#2587F5] uppercase">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Features</span>
          </div>
          <h2 className="mt-4 text-3xl sm:text-4xl font-black tracking-tight text-[#0B1B33]">
            Engineered for clarity and speed.
          </h2>
          <p className="mt-3 text-base text-[#64748B] leading-relaxed">
            Everything you need for seamless, instantaneous communication without the noise and algorithmic feeds.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Card 1 */}
          <div className="group rounded-2xl border border-[#DCE8F5] bg-white p-6 shadow-sm hover:shadow-md hover:border-[#2587F5]/40 transition-all">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#EAF4FF] text-[#2587F5] mb-4 group-hover:scale-105 transition-transform">
              <Lock className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-bold text-[#0B1B33]">End-to-End Privacy</h3>
            <p className="mt-2 text-sm text-[#64748B] leading-relaxed">
              Browser-to-browser WebRTC encrypted calls and shielded conversations. Zero third-party surveillance.
            </p>
          </div>

          {/* Card 2 */}
          <div className="group rounded-2xl border border-[#DCE8F5] bg-white p-6 shadow-sm hover:shadow-md hover:border-[#2587F5]/40 transition-all">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#EAF4FF] text-[#2587F5] mb-4 group-hover:scale-105 transition-transform">
              <Zap className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-bold text-[#0B1B33]">Realtime Messaging</h3>
            <p className="mt-2 text-sm text-[#64748B] leading-relaxed">
              Instant delivery, fluid typing indicators, live presence indicators, and exact read receipts with zero lag.
            </p>
          </div>

          {/* Card 3 */}
          <div className="group rounded-2xl border border-[#DCE8F5] bg-white p-6 shadow-sm hover:shadow-md hover:border-[#2587F5]/40 transition-all">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#EAF4FF] text-[#2587F5] mb-4 group-hover:scale-105 transition-transform">
              <Phone className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-bold text-[#0B1B33]">HD Voice & Video Calls</h3>
            <p className="mt-2 text-sm text-[#64748B] leading-relaxed">
              Direct peer-to-peer audio and video calling with adaptive bitrate quality and intuitive controls.
            </p>
          </div>

          {/* Card 4 */}
          <div className="group rounded-2xl border border-[#DCE8F5] bg-white p-6 shadow-sm hover:shadow-md hover:border-[#2587F5]/40 transition-all">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#EAF4FF] text-[#2587F5] mb-4 group-hover:scale-105 transition-transform">
              <Users className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-bold text-[#0B1B33]">Group Conversations</h3>
            <p className="mt-2 text-sm text-[#64748B] leading-relaxed">
              Create and manage collaborative group chats with custom names, avatars, and member permission controls.
            </p>
          </div>

          {/* Card 5 */}
          <div className="group rounded-2xl border border-[#DCE8F5] bg-white p-6 shadow-sm hover:shadow-md hover:border-[#2587F5]/40 transition-all">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#EAF4FF] text-[#2587F5] mb-4 group-hover:scale-105 transition-transform">
              <Flame className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-bold text-[#0B1B33]">Vanish Mode</h3>
            <p className="mt-2 text-sm text-[#64748B] leading-relaxed">
              Disappearing message timers for sensitive conversations that clear automatically once viewed.
            </p>
          </div>

          {/* Card 6 */}
          <div className="group rounded-2xl border border-[#DCE8F5] bg-white p-6 shadow-sm hover:shadow-md hover:border-[#2587F5]/40 transition-all">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#EAF4FF] text-[#2587F5] mb-4 group-hover:scale-105 transition-transform">
              <Radio className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-bold text-[#0B1B33]">Instant Session Control</h3>
            <p className="mt-2 text-sm text-[#64748B] leading-relaxed">
              Real-time multi-device management. Revoke any browser session instantly with zero lingering tokens.
            </p>
          </div>
        </div>
      </section>

      {/* SECTION 2: Privacy & Security */}
      <section id="privacy" className="scroll-mt-24 w-full max-w-[1100px] mx-auto px-6 py-20 sm:py-28 border-t border-[#DCE8F5]/70">
        <div className="text-center max-w-2xl mx-auto mb-14 sm:mb-16">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-[#EAF4FF] px-3.5 py-1 text-xs font-bold tracking-wide text-[#2587F5] uppercase">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>Privacy & Security</span>
          </div>
          <h2 className="mt-4 text-3xl sm:text-4xl font-black tracking-tight text-[#0B1B33]">
            Your privacy is our baseline.
          </h2>
          <p className="mt-3 text-base text-[#64748B] leading-relaxed">
            Ghostline is engineered from the ground up with strict confidentiality principles so you never have to wonder if your data is safe.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="rounded-2xl border border-[#DCE8F5] bg-[#F7FAFE]/80 p-6 flex flex-col justify-between">
            <div>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#2587F5] text-white mb-4 shadow-sm">
                <Lock className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-bold text-[#0B1B33]">Peer-to-Peer Encryption</h3>
              <p className="mt-2 text-sm text-[#64748B] leading-relaxed">
                Direct voice and video calls connect browser-to-browser via WebRTC data streams. Media is never stored or routed through intermediary proxies.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-[#DCE8F5]/60 flex items-center gap-2 text-xs font-bold text-[#2587F5]">
              <CheckCheck className="h-4 w-4" />
              <span>Zero third-party surveillance</span>
            </div>
          </div>

          <div className="rounded-2xl border border-[#DCE8F5] bg-[#F7FAFE]/80 p-6 flex flex-col justify-between">
            <div>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#2587F5] text-white mb-4 shadow-sm">
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

          <div className="rounded-2xl border border-[#DCE8F5] bg-[#F7FAFE]/80 p-6 flex flex-col justify-between">
            <div>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#2587F5] text-white mb-4 shadow-sm">
                <GhostMark className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-bold text-[#0B1B33]">Zero Data Selling</h3>
              <p className="mt-2 text-sm text-[#64748B] leading-relaxed">
                No tracking scripts, no behavioral ad profiling, no advertising networks, and no spam. Your personal conversations always stay strictly yours.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-[#DCE8F5]/60 flex items-center gap-2 text-xs font-bold text-[#2587F5]">
              <CheckCheck className="h-4 w-4" />
              <span>No behavioral tracking</span>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 3: About Ghostline */}
      <section id="about" className="scroll-mt-24 w-full max-w-[900px] mx-auto px-6 py-20 sm:py-28 border-t border-[#DCE8F5]/70">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-[#EAF4FF] px-3.5 py-1 text-xs font-bold tracking-wide text-[#2587F5] uppercase">
            <Info className="h-3.5 w-3.5" />
            <span>About Ghostline</span>
          </div>
          <h2 className="mt-4 text-3xl sm:text-4xl font-black tracking-tight text-[#0B1B33]">
            A quieter place for conversations that matter.
          </h2>
        </div>

        <div className="rounded-3xl border border-[#DCE8F5] bg-white p-8 sm:p-10 shadow-sm">
          <p className="text-base sm:text-lg text-[#0B1B33] leading-relaxed font-medium">
            Ghostline was built to bring back the simplicity and intimacy of real communication. In a world of endless feeds, notification overload, and intrusive tracking, Ghostline provides a clean, calm, and private sanctuary for your most important connections.
          </p>

          <div className="mt-8 rounded-2xl bg-[#F5FAFF] p-6 border border-[#E2EEFC]">
            <h4 className="font-bold text-[#0B1B33] text-sm uppercase tracking-wider mb-3">Our Core Principles</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm text-[#64748B]">
              <div className="flex flex-col gap-1">
                <span className="font-bold text-[#0B1B33]">Calm Restraint</span>
                <span className="text-xs">Apple-like minimalism designed to reduce cognitive fatigue.</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="font-bold text-[#0B1B33]">Modern Density</span>
                <span className="text-xs">Refined layout with fast access to all active chats and calls.</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="font-bold text-[#0B1B33]">Realtime Purity</span>
                <span className="text-xs">Bulletproof synchronization without cluttered social gimmicks.</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Bottom CTA Banner */}
      <section className="w-full max-w-[900px] mx-auto px-6 py-12 mb-10">
        <div className="rounded-3xl bg-gradient-to-br from-[#2587F5] to-[#1467D8] p-8 sm:p-12 text-center text-white shadow-xl shadow-[#2587F5]/20 flex flex-col items-center">
          <h3 className="text-2xl sm:text-3xl font-black tracking-tight">Ready for private, noise-free messaging?</h3>
          <p className="mt-2.5 text-sm sm:text-base text-white/90 max-w-md">
            Join Ghostline today and experience messaging designed for what matters.
          </p>
          <button
            onClick={() => navigate({ to: "/auth", search: { mode: "signup" } as never })}
            className="mt-6 flex items-center justify-center gap-2 rounded-xl bg-white px-7 py-3 text-[15px] font-bold text-[#2587F5] shadow-md transition-transform hover:scale-105 active:scale-95 cursor-pointer"
          >
            <span>Get Started Free</span>
            <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="w-full border-t border-[#DCE8F5]/60 bg-[#F7FAFE]/50 py-10 px-6 z-20">
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
    <div className={`flex items-center gap-2.5 py-2 px-2 ${active ? 'bg-[#F8FAFC] rounded-xl' : ''}`}>
      <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center font-bold text-[12px] sm:text-[13px] shrink-0 overflow-hidden ${bg}`}>
        {avatar === "V" ? (
           <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Vamsee&backgroundColor=e2e8f0" alt="Vamsee" className="w-full h-full object-cover" />
        ) : avatar === "D" ? (
          <div className="bg-[#6366F1] text-white w-full h-full flex items-center justify-center">D</div>
        ) : avatar === "👥" ? (
          <Users className="w-4 h-4" />
        ) : avatar}
      </div>
      <div className="flex flex-col flex-1 overflow-hidden">
        <div className="flex justify-between items-center w-full">
          <span className="text-[13px] sm:text-[14px] font-bold text-[#0B1B33]">{name}</span>
        </div>
        <span className={`text-[11px] sm:text-[12px] truncate ${isTyping ? 'text-[#2587F5] font-semibold' : 'text-[#64748B]'}`}>
          {message}
        </span>
      </div>
    </div>
  );
}

