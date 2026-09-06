import { ShieldCheck, Database, Key } from "lucide-react";

export function LandingPrivacy() {
  return (
    <section id="privacy" className="mx-auto max-w-5xl px-6 py-24 scroll-mt-20">
      <div className="flex flex-col items-center text-center">
        <div className="mb-4 inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-[11px] font-bold tracking-wider text-primary">
          PRIVACY & TRUST
        </div>
        <h2 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
          Privacy isn't an afterthought.
        </h2>
        <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground">
          Ghostline separates authentication from application data and keeps the messaging experience focused on private conversations.
        </p>
      </div>

      {/* Architecture Visual */}
      <div className="mt-16 flex flex-col items-center justify-center gap-6 sm:flex-row sm:gap-12">
        {/* Auth Box */}
        <div className="flex w-64 flex-col items-center rounded-2xl border border-border bg-white p-6 shadow-sm">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-surface-2 text-foreground">
            <Key className="h-5 w-5" />
          </div>
          <p className="text-[11px] font-bold tracking-wider text-muted-foreground">AUTHENTICATION</p>
          <p className="mt-1 font-semibold text-foreground">Supabase Auth</p>
          <p className="mt-2 text-[12px] text-muted-foreground text-center">Identity & Session</p>
        </div>

        {/* Arrow */}
        <div className="hidden sm:block text-border">
          <svg className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
        </div>
        <div className="block sm:hidden text-border">
          <svg className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16 17l-4 4m0 0l-4-4m4 4V3" /></svg>
        </div>

        {/* DB Box */}
        <div className="flex w-64 flex-col items-center rounded-2xl border border-border bg-white p-6 shadow-sm">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Database className="h-5 w-5" />
          </div>
          <p className="text-[11px] font-bold tracking-wider text-muted-foreground">APPLICATION</p>
          <p className="mt-1 font-semibold text-foreground">Neon PostgreSQL</p>
          <p className="mt-2 text-[12px] text-muted-foreground text-center">Encrypted Data Storage</p>
        </div>
      </div>

      {/* Trust Capability Strip */}
      <div className="mt-20 flex flex-wrap items-center justify-center gap-4 sm:gap-8">
        {[
          "Private messaging",
          "Voice & video calls",
          "Media sharing",
          "Read status",
          "Responsive experience",
        ].map((item) => (
          <div key={item} className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-success" />
            <span className="text-sm font-semibold text-foreground">{item}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
