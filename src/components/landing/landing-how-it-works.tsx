export function LandingHowItWorks() {
  return (
    <section id="how-it-works" className="mx-auto max-w-5xl px-6 py-24 scroll-mt-20 text-center">
      <h2 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
        Simple to start.
      </h2>
      
      <div className="mt-16 grid gap-12 sm:grid-cols-3">
        {/* Step 1 */}
        <div className="flex flex-col items-center">
          <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-xl font-bold text-white shadow-lg shadow-primary/20">
            1
          </div>
          <h3 className="mb-3 text-xl font-bold text-foreground">Create</h3>
          <p className="text-[15px] leading-relaxed text-muted-foreground max-w-[250px]">
            Create your Ghostline account in seconds.
          </p>
        </div>

        {/* Step 2 */}
        <div className="flex flex-col items-center">
          <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-xl font-bold text-white shadow-lg shadow-primary/20">
            2
          </div>
          <h3 className="mb-3 text-xl font-bold text-foreground">Connect</h3>
          <p className="text-[15px] leading-relaxed text-muted-foreground max-w-[250px]">
            Find people and manage your connections.
          </p>
        </div>

        {/* Step 3 */}
        <div className="flex flex-col items-center">
          <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-xl font-bold text-white shadow-lg shadow-primary/20">
            3
          </div>
          <h3 className="mb-3 text-xl font-bold text-foreground">Talk</h3>
          <p className="text-[15px] leading-relaxed text-muted-foreground max-w-[250px]">
            Start conversations, share media, or call.
          </p>
        </div>
      </div>
    </section>
  );
}
