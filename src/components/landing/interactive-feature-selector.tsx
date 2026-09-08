import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { PhoneFrame } from "./phone-frame";
import { MessageSquare, Users, Phone, Image as ImageIcon } from "lucide-react";

type FeatureType = "messaging" | "people" | "calls" | "media";

const features = [
  {
    id: "messaging" as FeatureType,
    title: "Messaging",
    description: "Clean, focused conversations designed around the people you're talking to.",
    icon: MessageSquare,
  },
  {
    id: "people" as FeatureType,
    title: "People",
    description: "Manage friends and discover new contacts without social algorithmic feeds.",
    icon: Users,
  },
  {
    id: "calls" as FeatureType,
    title: "Calls",
    description: "High quality voice and video calls directly in your conversation.",
    icon: Phone,
  },
  {
    id: "media" as FeatureType,
    title: "Media",
    description: "Share high-resolution images and audio clips instantly.",
    icon: ImageIcon,
  },
];

export function InteractiveFeatureSelector() {
  const [activeFeature, setActiveFeature] = useState<FeatureType>("messaging");

  return (
    <section className="mx-auto flex max-w-6xl flex-col items-center gap-16 px-6 py-24 lg:flex-row lg:items-start lg:gap-24">
      
      {/* Left: Interactive Controls */}
      <div className="flex w-full flex-1 flex-col gap-8 lg:sticky lg:top-32 lg:max-w-md lg:py-12">
        <div>
          <div className="mb-4 inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-[11px] font-bold tracking-wider text-primary">
            FEATURES
          </div>
          <h2 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
            Everything you need. <br />
            <span className="text-muted-foreground">Nothing you don't.</span>
          </h2>
        </div>

        <div className="flex flex-col gap-2">
          {features.map((feature) => {
            const isActive = activeFeature === feature.id;
            const Icon = feature.icon;
            
            return (
              <button
                key={feature.id}
                onClick={() => setActiveFeature(feature.id)}
                className={`group relative flex flex-col items-start gap-2 rounded-2xl p-5 text-left transition-all duration-300 ${
                  isActive 
                    ? "bg-white shadow-xl shadow-primary/5 border border-border ring-1 ring-primary/10" 
                    : "hover:bg-surface-2/50 border border-transparent"
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors ${
                    isActive ? "bg-primary text-white shadow-md shadow-primary/20" : "bg-surface-2 text-muted-foreground group-hover:bg-background group-hover:text-foreground"
                  }`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className={`text-lg font-bold transition-colors ${isActive ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"}`}>
                    {feature.title}
                  </h3>
                </div>
                
                <AnimatePresence>
                  {isActive && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: "easeInOut" }}
                      className="overflow-hidden"
                    >
                      <p className="pl-14 text-sm leading-relaxed text-muted-foreground pt-1">
                        {feature.description}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right: Phone Frame with dynamic content */}
      <div className="flex w-full flex-1 items-center justify-center lg:justify-end">
        <PhoneFrame>
          <div className="relative h-full w-full bg-background">
            <AnimatePresence mode="wait">
              {activeFeature === "messaging" && (
                <motion.div
                  key="messaging"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="flex h-full flex-col"
                >
                  {/* Fake Chat Header */}
                  <div className="flex items-center gap-3 border-b border-border bg-background/80 px-4 pb-3 pt-12 backdrop-blur-md">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary font-bold">L</div>
                    <div>
                      <p className="text-[15px] font-bold text-foreground">Liam</p>
                      <p className="text-[12px] font-medium text-success">● Online</p>
                    </div>
                  </div>
                  
                  {/* Fake Chat Body */}
                  <div className="flex flex-1 flex-col justify-end gap-4 bg-surface-2/30 px-4 pb-6 pt-4">
                    <div className="flex justify-start">
                      <div className="max-w-[85%] rounded-[20px_20px_20px_6px] bg-white px-4 py-3 shadow-sm border border-border/50">
                        <p className="text-[14px] text-foreground leading-snug">Hey! What time is the flight?</p>
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <div className="max-w-[85%] rounded-[20px_20px_6px_20px] bg-primary px-4 py-3 shadow-sm">
                        <p className="text-[14px] text-white leading-snug">10:30 AM. Leaving in 10 mins! 🚕</p>
                      </div>
                    </div>
                    <div className="flex justify-start">
                      <div className="max-w-[85%] rounded-[20px_20px_20px_6px] bg-white px-4 py-3 shadow-sm border border-border/50">
                        <p className="text-[14px] text-foreground leading-snug">Perfect, see you at the gate.</p>
                      </div>
                    </div>
                    
                    {/* Fake Composer */}
                    <div className="mt-2 flex items-center gap-2 rounded-full border border-border bg-white p-2 shadow-sm">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground">
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"/></svg>
                      </div>
                      <div className="flex-1 text-[14px] text-muted-foreground/60">Message...</div>
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-white">
                        <svg className="h-4 w-4 ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 12h14M12 5l7 7-7 7"/></svg>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {activeFeature === "people" && (
                <motion.div
                  key="people"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="flex h-full flex-col bg-background px-4 pt-12"
                >
                  <h3 className="mb-6 text-2xl font-bold text-foreground">People</h3>
                  <div className="mb-4 flex gap-4 border-b border-border pb-2">
                    <span className="text-sm font-bold text-primary">Friends</span>
                    <span className="text-sm font-medium text-muted-foreground">Requests</span>
                  </div>
                  
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3 border border-border">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-lg">M</div>
                      <div className="flex-1">
                        <p className="text-[15px] font-bold text-foreground">Maya</p>
                        <p className="text-[13px] text-muted-foreground">@maya123</p>
                      </div>
                      <div className="h-2.5 w-2.5 rounded-full bg-success"></div>
                    </div>
                    <div className="flex items-center gap-3 rounded-2xl p-3 hover:bg-surface-2 transition">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground font-bold text-lg">S</div>
                      <div className="flex-1">
                        <p className="text-[15px] font-bold text-foreground">Sam</p>
                        <p className="text-[13px] text-muted-foreground">Offline</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 rounded-2xl p-3 hover:bg-surface-2 transition">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-white font-bold text-lg">A</div>
                      <div className="flex-1">
                        <p className="text-[15px] font-bold text-foreground">Alex</p>
                        <p className="text-[13px] text-success font-medium">In Call</p>
                      </div>
                      <div className="h-2.5 w-2.5 rounded-full bg-success"></div>
                    </div>
                  </div>
                </motion.div>
              )}

              {activeFeature === "calls" && (
                <motion.div
                  key="calls"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="flex h-full flex-col bg-slate-900 px-4 py-12 text-white relative overflow-hidden"
                >
                   {/* Background blur effect */}
                   <div className="absolute inset-0 bg-primary/20 blur-[80px]" />
                   
                   <div className="relative z-10 flex h-full flex-col items-center justify-between py-8">
                      <div className="flex flex-col items-center gap-4">
                        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-3xl font-bold">
                          A
                        </div>
                        <div className="text-center">
                          <h3 className="text-2xl font-bold">Alex</h3>
                          <p className="mt-1 text-sm text-white/60">02:14</p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-6">
                        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10 backdrop-blur-md border border-white/20">
                           <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"/></svg>
                        </div>
                        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive shadow-lg shadow-destructive/30">
                           <svg className="h-8 w-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.516l2.257-1.13a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z"/></svg>
                        </div>
                        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10 backdrop-blur-md border border-white/20">
                           <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
                        </div>
                      </div>
                   </div>
                </motion.div>
              )}

              {activeFeature === "media" && (
                <motion.div
                  key="media"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="flex h-full flex-col bg-background px-4 pt-12"
                >
                   {/* Fake Chat Header */}
                   <div className="flex items-center gap-3 border-b border-border bg-background/80 pb-3 backdrop-blur-md">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-white font-bold">M</div>
                    <div>
                      <p className="text-[15px] font-bold text-foreground">Maya</p>
                      <p className="text-[12px] font-medium text-success">● Online</p>
                    </div>
                  </div>
                  
                  {/* Fake Chat Body with Image */}
                  <div className="flex flex-1 flex-col gap-4 bg-surface-2/30 px-2 pb-6 pt-6">
                    <div className="flex justify-start">
                      <div className="max-w-[85%] rounded-[20px_20px_20px_6px] bg-white p-2 shadow-sm border border-border/50">
                        <div className="aspect-square w-[200px] rounded-xl bg-slate-100 overflow-hidden relative border border-border/50">
                          <img src="https://images.unsplash.com/photo-1682687220742-aba13b6e50ba" alt="Preview" className="w-full h-full object-cover" />
                        </div>
                        <p className="mt-2 px-2 pb-1 text-[14px] text-foreground">Check out this view!</p>
                      </div>
                    </div>
                    
                    {/* Fake Audio message */}
                    <div className="flex justify-end mt-2">
                       <div className="flex items-center gap-3 max-w-[85%] rounded-[20px_20px_6px_20px] bg-primary px-4 py-3 shadow-sm text-white">
                         <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
                            <svg className="h-4 w-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                         </div>
                         <div className="flex gap-1 h-4 items-center">
                           <div className="w-1 h-2 bg-white rounded-full"></div>
                           <div className="w-1 h-3 bg-white rounded-full"></div>
                           <div className="w-1 h-4 bg-white rounded-full"></div>
                           <div className="w-1 h-2 bg-white rounded-full"></div>
                           <div className="w-1 h-1 bg-white rounded-full"></div>
                           <div className="w-1 h-2 bg-white/50 rounded-full"></div>
                           <div className="w-1 h-3 bg-white/50 rounded-full"></div>
                           <div className="w-1 h-2 bg-white/50 rounded-full"></div>
                         </div>
                         <span className="text-[12px] opacity-80">0:12</span>
                       </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </PhoneFrame>
      </div>
    </section>
  );
}
