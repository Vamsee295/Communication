import { GhostMark } from "@/components/app-shell";

export function LandingFooter() {
  return (
    <footer className="border-t border-border bg-white px-6 py-16 md:py-20 relative z-10">
      <div className="mx-auto grid max-w-6xl gap-12 md:grid-cols-2 lg:grid-cols-4">
        {/* Brand */}
        <div className="flex flex-col items-start gap-5 lg:col-span-1">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-white shadow-md shadow-primary/20">
              <GhostMark className="h-5 w-5" />
            </div>
            <span className="text-lg font-bold text-foreground">Ghostline</span>
          </div>
          <p className="text-[15px] font-medium text-muted-foreground leading-relaxed">
            Private Chats.<br /> Real Connections.
          </p>
        </div>

        {/* Links: Product */}
        <div className="flex flex-col gap-4">
          <h4 className="text-[12px] font-bold tracking-widest text-foreground">PRODUCT</h4>
          <a href="#features" className="text-[15px] font-medium text-muted-foreground transition-colors hover:text-primary">
            Features
          </a>
          <a href="#how-it-works" className="text-[15px] font-medium text-muted-foreground transition-colors hover:text-primary">
            How it works
          </a>
        </div>

        {/* Links: Company */}
        <div className="flex flex-col gap-4">
          <h4 className="text-[12px] font-bold tracking-widest text-foreground">COMPANY</h4>
          <a href="#" className="text-[15px] font-medium text-muted-foreground transition-colors hover:text-primary">
            About
          </a>
          <a href="#privacy" className="text-[15px] font-medium text-muted-foreground transition-colors hover:text-primary">
            Privacy
          </a>
          <a href="#" className="text-[15px] font-medium text-muted-foreground transition-colors hover:text-primary">
            Terms
          </a>
        </div>

        {/* Links: Connect */}
        <div className="flex flex-col gap-4">
          <h4 className="text-[12px] font-bold tracking-widest text-foreground">CONNECT</h4>
          <a href="https://github.com" target="_blank" rel="noreferrer" className="text-[15px] font-medium text-muted-foreground transition-colors hover:text-primary">
            GitHub
          </a>
        </div>
      </div>

      <div className="mx-auto mt-20 max-w-6xl border-t border-border/60 pt-8 text-center md:text-left flex flex-col md:flex-row justify-between items-center gap-4">
        <p className="text-[14px] font-medium text-muted-foreground">© 2026 Ghostline</p>
      </div>
    </footer>
  );
}
