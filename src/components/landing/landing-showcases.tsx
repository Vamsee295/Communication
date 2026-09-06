import { GhostMark } from "@/components/app-shell";

export function LandingShowcases() {
  return (
    <section className="mx-auto flex max-w-6xl flex-col gap-32 px-6 py-24">
      
      {/* Showcase 01 — MESSAGING */}
      <div className="flex flex-col items-center gap-12 lg:flex-row lg:gap-20">
        <div className="flex-1 text-center lg:text-left">
          <div className="mb-4 inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-[11px] font-bold tracking-wider text-primary">
            MESSAGING
          </div>
          <h2 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
            Conversations that feel natural.
          </h2>
          <p className="mt-6 text-base leading-relaxed text-muted-foreground">
            Stay connected with clean, focused conversations designed around the people you're talking to.
          </p>
        </div>
        <div className="flex-1 w-full max-w-md lg:max-w-none">
          <div className="card-elevated relative overflow-hidden rounded-[24px] bg-white p-0 shadow-xl shadow-primary/5 border border-border">
            {/* Header */}
            <div className="flex items-center gap-3 border-b border-border bg-surface-2/30 px-4 py-3 backdrop-blur-md">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary font-bold">L</div>
              <div>
                <p className="text-[14px] font-semibold text-foreground">Liam</p>
                <p className="text-[12px] text-success font-medium">● Online</p>
              </div>
            </div>
            {/* Thread */}
            <div className="flex flex-col gap-3 px-5 py-5 bg-background/30">
              <div className="flex justify-start">
                <div className="bubble-in max-w-[85%] px-4 py-3 shadow-sm border border-border/50">
                  <p className="text-[14px]">Hey! What time is the flight?</p>
                </div>
              </div>
              <div className="flex justify-end">
                <div className="bubble-out max-w-[85%] rounded-[20px_20px_6px_20px] px-4 py-3 shadow-sm">
                  <p className="text-[14px] text-white">10:30 AM. Leaving in 10 mins! 🚕</p>
                </div>
              </div>
              <div className="flex justify-start">
                <div className="bubble-in max-w-[85%] px-4 py-3 shadow-sm border border-border/50">
                  <p className="text-[14px]">Perfect, see you at the gate.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Showcase 02 — PEOPLE */}
      <div className="flex flex-col items-center gap-12 lg:flex-row-reverse lg:gap-20">
        <div className="flex-1 text-center lg:text-left">
          <div className="mb-4 inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-[11px] font-bold tracking-wider text-primary">
            PEOPLE
          </div>
          <h2 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
            Your people, in one place.
          </h2>
          <p className="mt-6 text-base leading-relaxed text-muted-foreground">
            Manage friends, pending requests, and discover new contacts without social algorithmic feeds.
          </p>
        </div>
        <div className="flex-1 w-full max-w-md lg:max-w-none">
          <div className="card-elevated relative overflow-hidden rounded-[24px] bg-white p-6 shadow-xl shadow-primary/5 border border-border">
            <h3 className="mb-4 text-sm font-bold tracking-wide text-muted-foreground">FRIENDS (3)</h3>
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-3 rounded-xl bg-surface-2 p-3 border border-border">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary font-bold">M</div>
                <div className="flex-1">
                  <p className="text-[14px] font-semibold text-foreground">Maya</p>
                  <p className="text-[12px] text-muted-foreground">@maya123</p>
                </div>
                <div className="h-2 w-2 rounded-full bg-success"></div>
              </div>
              <div className="flex items-center gap-3 rounded-xl p-3 hover:bg-surface-2 transition">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground font-bold">S</div>
                <div className="flex-1">
                  <p className="text-[14px] font-semibold text-foreground">Sam</p>
                  <p className="text-[12px] text-muted-foreground">Offline</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-xl p-3 hover:bg-surface-2 transition">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-white font-bold">A</div>
                <div className="flex-1">
                  <p className="text-[14px] font-semibold text-foreground">Alex</p>
                  <p className="text-[12px] text-success font-medium">In Call</p>
                </div>
                <div className="h-2 w-2 rounded-full bg-success"></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Showcase 03 — CALLS & MEDIA */}
      <div className="flex flex-col items-center gap-12 lg:flex-row lg:gap-20">
        <div className="flex-1 text-center lg:text-left">
          <div className="mb-4 inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-[11px] font-bold tracking-wider text-primary">
            MORE THAN MESSAGES
          </div>
          <h2 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
            More ways to stay connected.
          </h2>
          <p className="mt-6 text-base leading-relaxed text-muted-foreground">
            High quality voice calls, video streaming, instant audio clips, and image sharing directly in conversation.
          </p>
        </div>
        <div className="flex-1 w-full max-w-md lg:max-w-none">
          <div className="grid grid-cols-2 gap-4">
            <div className="card-elevated flex flex-col items-center justify-center gap-3 rounded-[24px] bg-primary p-6 text-white shadow-xl shadow-primary/20">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/20 backdrop-blur-md">
                <svg className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
              </div>
              <p className="text-sm font-semibold">Voice Call</p>
              <p className="text-[12px] opacity-70">02:14</p>
            </div>
            <div className="card-elevated flex flex-col items-center justify-center gap-3 rounded-[24px] bg-white border border-border p-6 shadow-xl shadow-primary/5">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-2 text-primary">
                <svg className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              </div>
              <p className="text-sm font-bold text-foreground">Media</p>
              <p className="text-[12px] text-muted-foreground">High-res images</p>
            </div>
          </div>
        </div>
      </div>

    </section>
  );
}
