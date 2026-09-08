import { Link } from "@tanstack/react-router";
import { PhoneFrame } from "./phone-frame";
import { motion } from "motion/react";

export function LandingHero() {
  return (
    <section className="relative mx-auto flex w-full flex-col items-center overflow-hidden px-6 pb-32 pt-20 text-center lg:pt-32">
      {/* Background gradient orb */}
      <div className="pointer-events-none absolute inset-0 -z-10 flex justify-center">
        <div className="absolute -top-40 h-[800px] w-[800px] rounded-full bg-[radial-gradient(circle,rgba(37,135,245,0.15)_0%,rgba(0,0,0,0)_70%)]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="flex flex-col items-center"
      >
        {/* Eyebrow */}
        <div className="mb-8 inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-[12px] font-bold tracking-widest text-primary shadow-[0_0_15px_rgba(37,135,245,0.2)]">
          PRIVATE COMMUNICATION
        </div>

        {/* Headline */}
        <h1 className="max-w-4xl text-5xl font-extrabold leading-[1.1] tracking-tight text-white lg:text-[72px]">
          Private Chats.<br />
          <span className="bg-gradient-to-r from-primary to-[#60A5FA] bg-clip-text text-transparent">
            Real Connections.
          </span>
        </h1>

        {/* Description */}
        <p className="mt-8 max-w-2xl text-lg leading-relaxed text-slate-300 lg:text-xl">
          A premium space to message the people who matter. Without the noise, 
          ads, or algorithmic feeds of traditional platforms.
        </p>

        {/* CTAs */}
        <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row">
          <Link
            to="/auth"
            className="inline-flex h-14 items-center gap-2 rounded-2xl bg-primary px-10 text-[17px] font-bold text-white shadow-[0_0_20px_rgba(37,135,245,0.4)] transition-all hover:bg-[#1467D8] hover:shadow-[0_0_30px_rgba(37,135,245,0.6)] active:scale-95 outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
          >
            Get Started
          </Link>
          <Link
            to="/auth"
            search={{ mode: "signin" } as never}
            className="inline-flex h-14 items-center gap-2 rounded-2xl border border-slate-700 bg-slate-800/50 px-10 text-[17px] font-bold text-white backdrop-blur-md transition-all hover:bg-slate-700 active:scale-95 outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
          >
            Sign In
          </Link>
        </div>
      </motion.div>

      {/* Hero Phone Preview */}
      <div className="mt-24 flex w-full justify-center">
        <PhoneFrame className="animate-[float_6s_ease-in-out_infinite]">
          <div className="flex h-full w-full flex-col bg-background">
            {/* Fake App Header */}
            <div className="flex items-center justify-between px-6 pb-4 pt-16 border-b border-border bg-background/80 backdrop-blur-md">
               <h2 className="text-2xl font-extrabold text-foreground tracking-tight">Chats</h2>
               <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                 <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4"/></svg>
               </div>
            </div>

            {/* Fake Chat List */}
            <div className="flex flex-col px-4 pt-4 gap-2">
               {/* Chat Row 1 (Unread) */}
               <div className="flex items-center gap-4 rounded-2xl p-3 bg-primary/5 transition">
                 <div className="relative">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white font-bold text-xl shadow-lg shadow-primary/20">M</div>
                    <div className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-2 border-background bg-success"></div>
                 </div>
                 <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline mb-0.5">
                       <p className="text-[16px] font-bold text-foreground">Maya</p>
                       <p className="text-[13px] font-bold text-primary">Just now</p>
                    </div>
                    <p className="text-[14px] font-semibold text-foreground truncate">Are we still meeting tonight?</p>
                 </div>
                 <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-white">2</div>
               </div>

               {/* Chat Row 2 */}
               <div className="flex items-center gap-4 rounded-2xl p-3 transition">
                 <div className="relative">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-2 text-muted-foreground font-bold text-xl">L</div>
                 </div>
                 <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline mb-0.5">
                       <p className="text-[16px] font-bold text-foreground">Liam</p>
                       <p className="text-[13px] text-muted-foreground">10:42 AM</p>
                    </div>
                    <p className="text-[14px] text-muted-foreground truncate">Perfect, see you at the gate. ✈️</p>
                 </div>
               </div>

               {/* Chat Row 3 */}
               <div className="flex items-center gap-4 rounded-2xl p-3 transition">
                 <div className="relative">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-xl">A</div>
                 </div>
                 <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline mb-0.5">
                       <p className="text-[16px] font-bold text-foreground">Alex</p>
                       <p className="text-[13px] text-muted-foreground">Yesterday</p>
                    </div>
                    <div className="flex items-center gap-1 text-[14px] text-muted-foreground">
                       <svg className="h-4 w-4 text-primary" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                       <p>Voice message (0:12)</p>
                    </div>
                 </div>
               </div>
            </div>

            {/* Bottom Nav Bar Fake */}
            <div className="absolute bottom-0 w-full border-t border-border bg-background/90 px-6 py-4 backdrop-blur-md flex justify-between items-center pb-8">
                <div className="flex flex-col items-center gap-1 text-primary">
                   <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>
                   <span className="text-[10px] font-bold">Chats</span>
                </div>
                <div className="flex flex-col items-center gap-1 text-muted-foreground/50">
                   <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>
                   <span className="text-[10px] font-medium">Calls</span>
                </div>
                <div className="flex flex-col items-center gap-1 text-muted-foreground/50">
                   <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
                   <span className="text-[10px] font-medium">People</span>
                </div>
                <div className="flex flex-col items-center gap-1 text-muted-foreground/50">
                   <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.56-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.73 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .43-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.49-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>
                   <span className="text-[10px] font-medium">Settings</span>
                </div>
            </div>
          </div>
        </PhoneFrame>
      </div>
    </section>
  );
}
