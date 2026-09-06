import { GhostMark } from "@/components/app-shell";

export function LandingFooter() {
  return (
    <footer className="border-t border-border bg-white px-6 py-12 md:py-16">
      <div className="mx-auto grid max-w-6xl gap-12 md:grid-cols-2 lg:grid-cols-4">
        {/* Brand */}
        <div className="flex flex-col items-start gap-4 lg:col-span-1">
          <div className="flex items-center gap-2">
            <GhostMark className="h-5 w-5 text-primary" />
            <span className="font-bold text-foreground">Ghostline</span>
          </div>
          <p className="text-sm font-medium text-muted-foreground">
            Private Chats. Real Connections.
          </p>
        </div>

        {/* Links: Product */}
        <div className="flex flex-col gap-4">
          <h4 className="text-[13px] font-bold tracking-wider text-foreground">PRODUCT</h4>
          <a href="#features" className="text-sm text-muted-foreground hover:text-foreground">
            Features
          </a>
          <a href="#how-it-works" className="text-sm text-muted-foreground hover:text-foreground">
            How it works
          </a>
        </div>

        {/* Links: Company */}
        <div className="flex flex-col gap-4">
          <h4 className="text-[13px] font-bold tracking-wider text-foreground">COMPANY</h4>
          <a href="#" className="text-sm text-muted-foreground hover:text-foreground">
            About
          </a>
          <a href="#privacy" className="text-sm text-muted-foreground hover:text-foreground">
            Privacy
          </a>
          <a href="#" className="text-sm text-muted-foreground hover:text-foreground">
            Terms
          </a>
        </div>

        {/* Links: Connect */}
        <div className="flex flex-col gap-4">
          <h4 className="text-[13px] font-bold tracking-wider text-foreground">CONNECT</h4>
          <a href="https://github.com" target="_blank" rel="noreferrer" className="text-sm text-muted-foreground hover:text-foreground">
            GitHub
          </a>
        </div>
      </div>

      <div className="mx-auto mt-16 max-w-6xl border-t border-border pt-8 text-center md:text-left">
        <p className="text-sm text-muted-foreground">© 2026 Ghostline</p>
      </div>
    </footer>
  );
}
