import { Link } from "@tanstack/react-router";

export function LandingHero() {
  return (
    <section className="relative mx-auto flex max-w-6xl flex-col items-center px-6 pb-20 pt-16 text-center lg:pt-24">
      {/* Background gradient orbs */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 left-1/2 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute top-1/3 -right-40 h-[400px] w-[400px] rounded-full bg-primary/8 blur-3xl" />
      </div>

      {/* Eyebrow */}
      <div className="mb-8 inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-[11px] font-bold tracking-wider text-primary">
        PRIVATE MESSAGING, REIMAGINED
      </div>

      {/* Headline */}
      <h1 className="max-w-3xl text-5xl font-extrabold leading-[1.08] tracking-tight text-foreground lg:text-6xl">
        Private Chats. <br className="sm:hidden" />
        <span className="text-primary">Real Connections.</span>
      </h1>

      {/* Description */}
      <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground">
        A calm, modern space to message the people who matter — without the noise of traditional social platforms.
      </p>

      {/* CTAs */}
      <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row">
        <Link
          to="/auth"
          className="inline-flex h-13 items-center gap-2 rounded-2xl bg-primary px-8 text-base font-bold text-white shadow-lg shadow-primary/30 transition hover:bg-[#1467D8] active:scale-95"
        >
          Get Started →
        </Link>
        <Link
          to="/auth"
          search={{ mode: "signin" } as never}
          className="inline-flex h-13 items-center gap-2 rounded-2xl border border-border bg-white px-8 text-base font-semibold text-foreground shadow-sm transition hover:bg-surface-2 active:scale-95"
        >
          Sign In
        </Link>
      </div>

      {/* Hero Chat Preview */}
      <div className="mt-20 relative mx-auto w-full max-w-sm animate-[float_5s_ease-in-out_infinite]">
        <div className="card-elevated overflow-hidden rounded-[28px] bg-white p-0">
          {/* Chat header */}
          <div className="flex items-center gap-3 border-b border-border bg-white px-4 py-3.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary">M</div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-sm font-semibold text-foreground">Maya</p>
              <p className="text-[11px] text-success font-medium">● Online</p>
            </div>
            <div className="flex gap-1.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-primary">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.63A2 2 0 012 1h3a2 2 0 012 1.72c.13 1 .39 1.97.77 2.91a2 2 0 01-.45 2.11L6.09 9a16 16 0 006.9 6.9l1.27-1.27a2 2 0 012.11-.45c.94.38 1.91.64 2.91.77A2 2 0 0122 16.92z" /></svg>
              </div>
            </div>
          </div>
          {/* Messages */}
          <div className="flex flex-col gap-2 px-4 py-4">
            <div className="flex justify-start">
              <div className="bubble-in max-w-[85%] px-4 py-2.5">
                <p className="text-[14px]">Hey! Are we still meeting tonight?</p>
                <p className="mt-0.5 text-right text-[10px] text-muted-foreground">7:42 PM</p>
              </div>
            </div>
            <div className="flex justify-end">
              <div className="bubble-out max-w-[85%] rounded-[20px_20px_6px_20px] px-4 py-2.5">
                <p className="text-[14px] text-white">Yeah! Just wrapping up work now.</p>
                <p className="mt-0.5 text-right text-[10px] text-white/70">7:45 PM ✓✓</p>
              </div>
            </div>
            <div className="flex justify-start">
              <div className="bubble-in max-w-[85%] px-4 py-2.5">
                <p className="text-[14px]">Awesome. See you at 8? 🍕</p>
                <p className="mt-0.5 text-right text-[10px] text-muted-foreground">7:46 PM</p>
              </div>
            </div>
          </div>
          {/* Composer */}
          <div className="border-t border-border px-3 py-3">
            <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-2/50 px-3 py-2">
              <p className="flex-1 text-left text-[13px] text-muted-foreground">Type a message...</p>
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-white shadow-sm">
                <svg className="h-3.5 w-3.5 ml-0.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" /></svg>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
