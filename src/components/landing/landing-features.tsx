import { MessageSquare, Users, Phone, Image as ImageIcon, Mic, CheckCheck } from "lucide-react";
import React from "react";

export function LandingFeatures() {
  return (
    <section id="features" className="mx-auto max-w-6xl px-6 py-24 scroll-mt-20">
      <div className="mb-16 text-center">
        <h2 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
          Everything you need. <br className="sm:hidden" />
          Nothing you don't.
        </h2>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <FeatureCard
          icon={<MessageSquare className="h-5 w-5" />}
          title="Messaging"
          desc="Real-time conversations with editing, deletion, replies, and reactions."
        />
        <FeatureCard
          icon={<Users className="h-5 w-5" />}
          title="Friends"
          desc="Find people, manage requests, and connect with others."
        />
        <FeatureCard
          icon={<Phone className="h-5 w-5" />}
          title="Voice & Video"
          desc="Communicate beyond text with voice and video calls."
        />
        <FeatureCard
          icon={<ImageIcon className="h-5 w-5" />}
          title="Media"
          desc="Share supported images and attachments inside conversations."
        />
        <FeatureCard
          icon={<Mic className="h-5 w-5" />}
          title="Voice Messages"
          desc="Record and send audio messages natively."
        />
        <FeatureCard
          icon={<CheckCheck className="h-5 w-5" />}
          title="Read Status"
          desc="See supported delivery and read states instantly."
        />
      </div>
    </section>
  );
}

function FeatureCard({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="card-elevated group rounded-2xl p-6 transition-all hover:-translate-y-1 hover:shadow-md">
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-white">
        {icon}
      </div>
      <h3 className="text-lg font-bold text-foreground">{title}</h3>
      <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">{desc}</p>
    </div>
  );
}
