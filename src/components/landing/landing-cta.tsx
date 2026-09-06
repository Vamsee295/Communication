import { Link } from "@tanstack/react-router";

export function LandingCta() {
  return (
    <section className="mx-auto max-w-4xl px-6 py-32 text-center">
      <div className="card-elevated flex flex-col items-center justify-center rounded-[32px] bg-white p-12 shadow-xl shadow-primary/5 sm:p-20 border border-border">
        <h2 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-5xl">
          Your conversations <br className="hidden sm:block" />
          deserve a better place.
        </h2>
        <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground">
          Start connecting with the people who matter.
        </p>

        <div className="mt-10 flex flex-col items-center gap-4">
          <Link
            to="/auth"
            className="inline-flex h-13 w-full sm:w-auto items-center justify-center gap-2 rounded-2xl bg-primary px-8 text-base font-bold text-white shadow-lg shadow-primary/30 transition hover:bg-[#1467D8] active:scale-95"
          >
            Create your Ghostline account →
          </Link>
          <Link
            to="/auth"
            search={{ mode: "signin" } as never}
            className="text-[14px] font-semibold text-muted-foreground transition hover:text-foreground"
          >
            Already have an account? Sign in
          </Link>
        </div>
      </div>
    </section>
  );
}
