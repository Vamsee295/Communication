import { ShieldCheck, Database, Key } from "lucide-react";

export function LandingPrivacy() {
  return (
    <section id="privacy" className="mx-auto max-w-5xl px-6 py-24 lg:py-32 scroll-mt-20">
      <div className="flex flex-col items-center text-center">
        <div className="mb-6 inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-[12px] font-bold tracking-widest text-primary">
          PRIVACY & TRUST
        </div>
        <h2 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
          Privacy isn't an afterthought.
        </h2>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
          Ghostline separates authentication from application data and keeps the messaging experience focused on private conversations.
        </p>
      </div>

      {/* Architecture Visual */}
      <div className="mt-20 flex flex-col items-center justify-center gap-6 sm:flex-row sm:gap-12 relative">
        {/* Auth Box */}
        <div className="flex w-64 flex-col items-center rounded-[32px] border border-border bg-white p-8 shadow-xl shadow-primary/5 relative z-10 transition-transform hover:-translate-y-1">
          <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-2 text-foreground ring-4 ring-background shadow-inner">
            <Key className="h-6 w-6" />
          </div>
          <p className="text-[12px] font-bold tracking-widest text-muted-foreground">AUTHENTICATION</p>
          <p className="mt-2 text-lg font-bold text-foreground">Supabase Auth</p>
          <p className="mt-2 text-[14px] text-muted-foreground text-center">Identity & Session</p>
        </div>

        {/* Arrow */}
        <div className="hidden sm:block text-border">
          <svg className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
        </div>
        <div className="block sm:hidden text-border my-2">
          <svg className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16 17l-4 4m0 0l-4-4m4 4V3" /></svg>
        </div>

        {/* DB Box */}
        <div className="flex w-64 flex-col items-center rounded-[32px] border border-primary/20 bg-primary/5 p-8 shadow-xl shadow-primary/10 relative z-10 transition-transform hover:-translate-y-1">
          <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-white ring-4 ring-background shadow-md shadow-primary/20">
            <Database className="h-6 w-6" />
          </div>
          <p className="text-[12px] font-bold tracking-widest text-primary">APPLICATION</p>
          <p className="mt-2 text-lg font-bold text-foreground">Neon PostgreSQL</p>
          <p className="mt-2 text-[14px] text-muted-foreground text-center">Encrypted Data Storage</p>
        </div>
      </div>

      {/* Trust Capability Strip */}
      <div className="mt-24 flex flex-wrap items-center justify-center gap-6 sm:gap-10">
        {[
          "Private messaging",
          "Voice & video calls",
          "Media sharing",
          "Read status",
          "Responsive experience",
        ].map((item) => (
          <div key={item} className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-success/10 text-success">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <span className="text-[15px] font-bold text-foreground">{item}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
