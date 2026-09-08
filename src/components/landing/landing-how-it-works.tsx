export function LandingHowItWorks() {
  return (
    <section id="how-it-works" className="mx-auto max-w-5xl px-6 py-24 lg:py-32 scroll-mt-20 text-center">
      <h2 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
        Simple to start.
      </h2>
      <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
        No complicated onboarding. No syncing contacts if you don't want to. Just a clean slate for your conversations.
      </p>
      
      <div className="mt-20 grid gap-12 sm:grid-cols-3 relative">
        {/* Connecting line for desktop */}
        <div className="hidden sm:block absolute top-8 left-[16.66%] right-[16.66%] h-[2px] bg-gradient-to-r from-transparent via-border to-transparent" />
        
        {/* Step 1 */}
        <div className="flex flex-col items-center relative z-10">
          <div className="mb-8 flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-2xl font-bold text-foreground shadow-xl shadow-primary/10 border border-border ring-4 ring-background">
            1
          </div>
          <h3 className="mb-4 text-2xl font-bold text-foreground tracking-tight">Create</h3>
          <p className="text-[16px] leading-relaxed text-muted-foreground max-w-[250px]">
            Create your Ghostline account in seconds.
          </p>
        </div>

        {/* Step 2 */}
        <div className="flex flex-col items-center relative z-10">
          <div className="mb-8 flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-2xl font-bold text-foreground shadow-xl shadow-primary/10 border border-border ring-4 ring-background">
            2
          </div>
          <h3 className="mb-4 text-2xl font-bold text-foreground tracking-tight">Connect</h3>
          <p className="text-[16px] leading-relaxed text-muted-foreground max-w-[250px]">
            Find people and manage your connections.
          </p>
        </div>

        {/* Step 3 */}
        <div className="flex flex-col items-center relative z-10">
          <div className="mb-8 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-2xl font-bold text-white shadow-xl shadow-primary/30 ring-4 ring-background">
            3
          </div>
          <h3 className="mb-4 text-2xl font-bold text-foreground tracking-tight">Talk</h3>
          <p className="text-[16px] leading-relaxed text-muted-foreground max-w-[250px]">
            Start conversations, share media, or call.
          </p>
        </div>
      </div>
    </section>
  );
}
