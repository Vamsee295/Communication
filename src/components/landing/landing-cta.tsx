import { Link } from "@tanstack/react-router";

export function LandingCta() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-24 lg:py-32 text-center">
      <div className="relative flex flex-col items-center justify-center overflow-hidden rounded-[48px] bg-slate-900 px-6 py-20 shadow-2xl sm:px-20 sm:py-28">
        
        {/* Background effects */}
        <div className="pointer-events-none absolute inset-0 -z-10 flex justify-center">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[500px] w-[500px] rounded-full bg-[radial-gradient(circle,rgba(37,135,245,0.2)_0%,rgba(0,0,0,0)_70%)] blur-2xl" />
        </div>

        <h2 className="max-w-2xl text-4xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-6xl">
          Your conversations <br className="hidden sm:block" />
          deserve a better place.
        </h2>
        <p className="mt-8 max-w-xl text-lg leading-relaxed text-slate-300">
          Start connecting with the people who matter.
        </p>

        <div className="mt-12 flex flex-col items-center gap-5 w-full sm:w-auto">
          <Link
            to="/auth"
            className="inline-flex h-14 w-full sm:w-auto items-center justify-center gap-2 rounded-2xl bg-primary px-10 text-[17px] font-bold text-white shadow-[0_0_20px_rgba(37,135,245,0.4)] transition-all hover:bg-[#1467D8] hover:shadow-[0_0_30px_rgba(37,135,245,0.5)] active:scale-95 outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
          >
            Create your Ghostline account
          </Link>
          <Link
            to="/auth"
            search={{ mode: "signin" } as never}
            className="text-[15px] font-bold text-slate-400 transition-colors hover:text-white outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm"
          >
            Already have an account? Sign in
          </Link>
        </div>
      </div>
    </section>
  );
}
