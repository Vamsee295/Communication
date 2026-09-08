import { useEffect } from "react";
import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { ArrowRight, Lock, Users, Zap, Search, ChevronLeft, Phone, MoreVertical, Plus, Smile, Mic, CheckCheck, Menu } from "lucide-react";
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

  useEffect(() => {
    authService.getSession().then(({ data }) => {
      if (data.session) {
        navigate({ to: "/chats", replace: true });
      }
    });
  }, [navigate]);

  return (
    <main className="min-h-screen w-full bg-[#FFFFFF] font-sans flex flex-col relative overflow-x-hidden selection:bg-primary/20">
      {/* Top Navigation */}
      <header className="flex w-full items-center justify-between px-6 py-5 sm:py-6 max-w-[1200px] mx-auto z-50">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#2587F5] text-white shadow-sm">
            <GhostMark className="h-5 w-5" />
          </div>
          <span className="text-[22px] font-bold tracking-tight text-[#0B1B33]">Ghostline</span>
        </div>
        <button className="text-[#0B1B33] p-1 transition-opacity hover:opacity-70" aria-label="Menu">
          <Menu className="h-7 w-7" strokeWidth={1.75} />
        </button>
      </header>

      {/* Hero Content */}
      <div className="flex-1 flex flex-col items-center pt-6 md:pt-12 px-6 max-w-[1200px] mx-auto w-full z-10">
        {/* Headline with refined vertical breathing room between each line */}
        <h1 className="text-center text-[46px] sm:text-[58px] md:text-[70px] font-black tracking-[-0.025em] text-[#0B1B33]">
          <span className="block leading-[1.12]">Real</span>
          <span className="block leading-[1.12]">Conversations</span>
          <span className="block leading-[1.14] bg-gradient-to-r from-[#2587F5] via-[#337DF6] to-[#5850EC] bg-clip-text text-transparent">
            Without Noise.
          </span>
        </h1>
        
        <p className="mt-5 text-center text-[16px] sm:text-[18px] text-[#64748B] max-w-[350px] leading-snug font-medium">
          A private, modern messaging app<br className="hidden sm:block" /> to keep you close to the people<br className="hidden sm:block" /> who matter.
        </p>

        {/* CTA Button */}
        <button 
          id="landing-get-started"
          onClick={() => navigate({ to: "/auth", search: { mode: "signup" } as never })}
          className="mt-8 flex items-center justify-center gap-2 rounded-xl bg-[#2587F5] px-8 py-3.5 text-[17px] font-bold text-white shadow-lg shadow-[#2587F5]/30 transition-transform hover:scale-105 active:scale-95"
        >
          <span>Get Started</span>
          <ArrowRight className="h-5 w-5" strokeWidth={2.5} />
        </button>

        {/* Features Row */}
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
      </div>

      {/* Phones Section with increased spacing and 10% larger preview */}
      <div className="relative isolate mt-16 sm:mt-20 flex justify-center w-full min-h-[520px] sm:min-h-[640px] pointer-events-none select-none">
        {/* Soft blue framing circle directly behind the phones */}
        <div className="absolute top-10 sm:top-8 left-1/2 -translate-x-1/2 w-[340px] sm:w-[460px] h-[340px] sm:h-[460px] rounded-full bg-[#EBF4FE] -z-10" />
        
        {/* Phones cluster container calibrated to prevent horizontal overflow */}
        <div className="relative w-[344px] sm:w-[420px] md:w-[460px] h-[550px] sm:h-[630px] flex justify-center mx-auto">
          
          {/* Left Phone (Chats List) ~10% larger */}
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

          {/* Right Phone (Chat Screen) ~10% larger */}
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
      </div>

      {/* Footer with increased bottom breathing room */}
      <div className="w-full text-center pt-10 pb-16 sm:pt-12 sm:pb-20 z-20 relative">
        <span className="text-[#94A3B8] text-[13.5px] font-medium tracking-tight">Built for real connections.</span>
      </div>
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
