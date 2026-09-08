export function LandingWhy() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-24 lg:py-32">
      <div className="grid gap-8 md:grid-cols-3">
        {/* Pillar 1 */}
        <div className="group flex flex-col gap-4 rounded-[32px] border border-border bg-white p-10 shadow-xl shadow-primary/5 transition-all hover:-translate-y-1 hover:shadow-2xl hover:shadow-primary/10">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-white">
            <svg className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
          </div>
          <h3 className="mt-6 text-2xl font-bold tracking-tight text-foreground">Private by design</h3>
          <p className="text-[16px] leading-relaxed text-muted-foreground">
            Built around direct conversations and personal connections. No public profiles, no search indexes.
          </p>
        </div>

        {/* Pillar 2 */}
        <div className="group flex flex-col gap-4 rounded-[32px] border border-border bg-white p-10 shadow-xl shadow-primary/5 transition-all hover:-translate-y-1 hover:shadow-2xl hover:shadow-primary/10">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-white">
            <svg className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>
          </div>
          <h3 className="mt-6 text-2xl font-bold tracking-tight text-foreground">Simple by nature</h3>
          <p className="text-[16px] leading-relaxed text-muted-foreground">
            No unnecessary feeds, noise, or complicated communication flows. Just you and your people.
          </p>
        </div>

        {/* Pillar 3 */}
        <div className="group flex flex-col gap-4 rounded-[32px] border border-border bg-white p-10 shadow-xl shadow-primary/5 transition-all hover:-translate-y-1 hover:shadow-2xl hover:shadow-primary/10">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-white">
            <svg className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
          </div>
          <h3 className="mt-6 text-2xl font-bold tracking-tight text-foreground">Made for people</h3>
          <p className="text-[16px] leading-relaxed text-muted-foreground">
            Messages, high-quality calls, and media sharing unified in one focused experience.
          </p>
        </div>
      </div>
    </section>
  );
}
