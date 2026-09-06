export function LandingWhy() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-24">
      <div className="grid gap-6 md:grid-cols-3">
        {/* Pillar 1 */}
        <div className="flex flex-col gap-3 rounded-3xl border border-border bg-white p-8 shadow-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
          </div>
          <h3 className="mt-4 text-xl font-bold text-foreground">Private by design</h3>
          <p className="text-[15px] leading-relaxed text-muted-foreground">
            Built around direct conversations and personal connections.
          </p>
        </div>

        {/* Pillar 2 */}
        <div className="flex flex-col gap-3 rounded-3xl border border-border bg-white p-8 shadow-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>
          </div>
          <h3 className="mt-4 text-xl font-bold text-foreground">Simple by nature</h3>
          <p className="text-[15px] leading-relaxed text-muted-foreground">
            No unnecessary feeds, noise, or complicated communication flows.
          </p>
        </div>

        {/* Pillar 3 */}
        <div className="flex flex-col gap-3 rounded-3xl border border-border bg-white p-8 shadow-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
          </div>
          <h3 className="mt-4 text-xl font-bold text-foreground">Made for people</h3>
          <p className="text-[15px] leading-relaxed text-muted-foreground">
            Messages, calls, friends, and media in one focused experience.
          </p>
        </div>
      </div>
    </section>
  );
}
