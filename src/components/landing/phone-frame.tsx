import { ReactNode } from "react";
import { motion } from "motion/react";

interface PhoneFrameProps {
  children: ReactNode;
  className?: string;
}

export function PhoneFrame({ children, className = "" }: PhoneFrameProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      className={`relative mx-auto w-full max-w-[320px] sm:max-w-[360px] md:max-w-[380px] shrink-0 ${className}`}
    >
      {/* Outer bezel */}
      <div className="relative overflow-hidden rounded-[48px] border-[8px] border-slate-200/60 dark:border-slate-800 bg-background shadow-2xl shadow-primary/20 ring-1 ring-border/50">
        {/* Notch / Dynamic Island */}
        <div className="absolute top-0 left-1/2 z-20 flex h-7 w-32 -translate-x-1/2 items-center justify-center rounded-b-3xl bg-slate-200/60 dark:bg-slate-800">
          {/* Camera dot */}
          <div className="h-2 w-2 rounded-full bg-black/80 dark:bg-black/50" />
        </div>

        {/* Screen Content Area */}
        <div className="relative h-[650px] sm:h-[720px] w-full overflow-hidden bg-background">
          {children}
        </div>

        {/* Home Indicator */}
        <div className="absolute bottom-2 left-1/2 z-20 h-1 w-24 -translate-x-1/2 rounded-full bg-slate-300 dark:bg-slate-700" />
      </div>

      {/* Subtle reflection/glare effect */}
      <div className="pointer-events-none absolute inset-0 z-30 rounded-[48px] bg-gradient-to-tr from-white/0 via-white/10 to-white/0" />
    </motion.div>
  );
}
