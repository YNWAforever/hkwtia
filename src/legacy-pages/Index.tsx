import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Layout from "@/components/Layout";
import { ArrowRight, Globe, Network, Zap, Trophy, Users, GraduationCap, Calendar, Award } from "lucide-react";
import GradientDivider from "@/components/GradientDivider";
import VideoHero from "@/components/VideoHero";
import ParticleField from "@/components/ParticleField";
import InteractiveGlobe from "@/components/InteractiveGlobe";
import ScrollReveal from "@/components/ScrollReveal";
import AnimatedCounter from "@/components/AnimatedCounter";
import { Suspense } from "react";

const VIDEO_URL = "https://videos.pexels.com/video-files/3129671/3129671-uhd_2560_1440_30fps.mp4";

const Index = () => {
  return (
    <Layout>
      {/* ── Hero with Video Background ── */}
      <VideoHero videoUrl={VIDEO_URL}>
        <div className="container mx-auto px-6">
          <div className="grid md:grid-cols-12 gap-8 items-center min-h-screen">
            <div className="md:col-span-7">
              <p className="text-xs uppercase tracking-[0.3em] text-primary mb-6 editorial-sans animate-fade-in">
                Innovate Hong Kong
              </p>
              <h1 className="text-5xl sm:text-6xl md:text-8xl font-bold leading-[0.95] tracking-tight animate-fade-up">
                Bridging GBA<br />
                innovation to the <span className="gradient-text italic">global stage.</span>
              </h1>
              <p className="mt-8 text-lg md:text-xl text-muted-foreground max-w-xl leading-relaxed animate-fade-up animation-delay-200 editorial-sans">
                The cross-border platform connecting Hong Kong, the Greater Bay Area, and Asia to global tech markets, investors, and opportunities.
              </p>
              <div className="mt-10 flex flex-wrap gap-4 animate-fade-up animation-delay-400">
                <Button asChild size="lg" className="rounded-full px-10 text-sm uppercase tracking-wider">
                  <Link to="/membership">Join Us</Link>
                </Button>
                <Button asChild variant="ghost" size="lg" className="rounded-full px-10 text-sm uppercase tracking-wider text-muted-foreground hover:text-foreground">
                  <Link to="/contact" className="inline-flex items-center gap-2">
                    Talk to Us <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>

            {/* 3D Globe */}
            <div className="md:col-span-5 hidden md:block h-[500px] animate-fade-in animation-delay-600">
              <Suspense fallback={<div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">Loading globe...</div>}>
                <InteractiveGlobe />
              </Suspense>
            </div>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 animate-fade-in animation-delay-800 z-20">
          <div className="w-px h-16 bg-gradient-to-b from-transparent via-muted-foreground/30 to-transparent" />
        </div>
      </VideoHero>

      {/* Gradient divider → Social proof */}
      <GradientDivider variant="multi" />

      {/* Social proof */}
      <section className="relative py-8 overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--secondary)), hsl(var(--accent)))",
          }}
        />
        <div className="container mx-auto px-6 relative z-10">
          <ScrollReveal>
            <p className="text-xs text-muted-foreground/60 uppercase tracking-[0.2em] text-center editorial-sans">
              Trusted by corporates, startups, and ecosystem partners across Hong Kong, the Greater Bay Area, and Asia
            </p>
          </ScrollReveal>
        </div>
      </section>

      <GradientDivider variant="primary" />

      {/* ── Why Innovate Hong Kong ── */}
      <section className="py-32">
        <div className="container mx-auto px-6">
          <div className="grid md:grid-cols-12 gap-8 items-start">
            <div className="md:col-span-4">
              <ScrollReveal>
                <p className="text-xs uppercase tracking-[0.3em] text-primary mb-3 editorial-sans">Why Innovate Hong Kong</p>
                <h2 className="text-4xl md:text-5xl font-bold leading-tight">
                  The ultimate bridge from GBA to <span className="italic gradient-text">the world.</span>
                </h2>
              </ScrollReveal>
            </div>
            <div className="md:col-span-8">
              <ScrollReveal delay={200}>
                <div className="grid sm:grid-cols-3 gap-px bg-border/30 rounded-lg overflow-hidden">
                  {[
                    {
                      icon: Globe,
                      title: "Connect HK, GBA & Asia",
                      desc: "We break down geographical barriers to create a unified, collaborative tech ecosystem spanning from the Pearl River Delta to the broader Asian market.",
                      accent: "primary",
                    },
                    {
                      icon: Zap,
                      title: "Empower GBA Tech",
                      desc: "We equip GBA startups, established tech companies, and entrepreneurs with global visibility, navigating cross-border commercialization and international scaling.",
                      accent: "secondary",
                    },
                    {
                      icon: Network,
                      title: "Global Collaboration",
                      desc: "We serve as the central nexus where international investors, regional industry leaders, and GBA innovators can seamlessly interact and build together.",
                      accent: "accent",
                    },
                  ].map((item, i) => (
                    <div key={i} className="relative bg-card/40 p-8 hover:bg-card/70 transition-colors duration-500 group overflow-hidden">
                      <div
                        className="absolute top-0 left-0 right-0 h-1 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                        style={{
                          background: `linear-gradient(90deg, hsl(var(--${item.accent})), hsl(var(--${item.accent}) / 0.3))`,
                        }}
                      />
                      <item.icon className="h-5 w-5 text-primary mb-6" />
                      <h3 className="text-lg font-semibold mb-3 editorial-sans">{item.title}</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                    </div>
                  ))}
                </div>
              </ScrollReveal>
            </div>
          </div>
        </div>
      </section>

      {/* Colorful gradient band */}
      <div className="relative h-1.5 w-full overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(90deg, hsl(var(--primary)), hsl(var(--secondary)), hsl(var(--accent)), hsl(var(--coral)), hsl(var(--primary)))",
          }}
        />
      </div>

      {/* ── Three Pillars with Particle Background ── */}
      <section className="py-32 relative overflow-hidden">
        <ParticleField />
        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{
            background: "linear-gradient(180deg, hsl(var(--primary)), transparent 30%, transparent 70%, hsl(var(--secondary)))",
          }}
        />
        <div className="container mx-auto px-6 relative z-10">
          <ScrollReveal>
            <p className="text-xs uppercase tracking-[0.3em] text-primary mb-12 text-center editorial-sans">Three pillars of our platform</p>
          </ScrollReveal>
          <div className="grid md:grid-cols-3 gap-16 md:gap-8">
            {[
              {
                icon: Network,
                num: "01",
                title: "Connect",
                desc: "Connecting HK, the GBA, and Asia — we create a unified, collaborative tech ecosystem spanning from the Pearl River Delta to the broader Asian market.",
                color: "--primary",
              },
              {
                icon: Zap,
                num: "02",
                title: "Empower",
                desc: "Empowering GBA tech for the world — we equip startups and enterprises with global visibility, cross-border commercialization, and international scaling.",
                color: "--secondary",
              },
              {
                icon: Globe,
                num: "03",
                title: "Collaborate",
                desc: "Facilitating global collaboration — the central nexus where international investors, regional leaders, and GBA innovators seamlessly interact.",
                color: "--accent",
              },
            ].map((item, i) => (
              <ScrollReveal key={i} delay={i * 200} direction="up">
                <div className="group">
                  <span className="text-xs text-muted-foreground/40 editorial-sans">{item.num}</span>
                  <div
                    className="mt-4 mb-6 w-12 h-0.5 group-hover:w-20 transition-all duration-500 rounded-full"
                    style={{ background: `linear-gradient(90deg, hsl(var(${item.color})), hsl(var(${item.color}) / 0.2))` }}
                  />
                  <h3 className="text-3xl md:text-4xl font-bold mb-4 italic">{item.title}</h3>
                  <p className="text-muted-foreground leading-relaxed editorial-sans">{item.desc}</p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      <GradientDivider variant="warm" />

      {/* ── Impact Stats with Animated Counters ── */}
      <section className="py-24 relative overflow-hidden">
        <div className="container mx-auto px-6">
          <ScrollReveal>
            <p className="text-xs uppercase tracking-[0.3em] text-primary mb-3 editorial-sans text-center">Our Impact</p>
            <h2 className="text-4xl md:text-5xl font-bold mb-16 text-center">
              By the <span className="italic gradient-text">Numbers</span>
            </h2>
          </ScrollReveal>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-border/30 rounded-xl overflow-hidden">
            {[
              { value: "25", suffix: "", label: "Years of unbroken service", extra: "Years", icon: Calendar },
              { value: "17", suffix: "+", label: "Asian regions connected", extra: "Regions", icon: Globe },
              { value: "100", suffix: "s", label: "Corporate members across the GBA", extra: "Members", icon: Users },
              { value: "10", suffix: "K+", label: "Professionals trained & connected", extra: "Professionals", icon: Award },
            ].map((s, i) => (
              <ScrollReveal key={i} delay={i * 150}>
                <div className="bg-card/40 p-8 text-center hover:bg-card/70 transition-colors duration-500 group">
                  <div className="h-12 w-12 mx-auto rounded-full border border-border/50 flex items-center justify-center mb-5 group-hover:border-primary/50 group-hover:bg-primary/5 transition-all">
                    <s.icon className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                  <p className="text-4xl md:text-5xl font-bold gradient-text mb-2">
                    <AnimatedCounter value={s.value} suffix={s.suffix} />
                  </p>
                  <p className="text-sm font-medium mb-1 editorial-sans">{s.extra}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">{s.label}</p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      <GradientDivider variant="primary" />

      {/* ── Featured Initiatives ── */}
      <section className="py-32">
        <div className="container mx-auto px-6">
          <ScrollReveal>
            <div className="text-center mb-20">
              <p className="text-xs uppercase tracking-[0.3em] text-primary mb-3 editorial-sans">Initiatives</p>
              <h2 className="text-4xl md:text-5xl font-bold">
                Featured <span className="italic gradient-text">Programmes</span>
              </h2>
            </div>
          </ScrollReveal>

          <div className="space-y-px">
            {[
              {
                icon: Trophy,
                title: "Asia Smart App Awards",
                desc: "Recognition that travels across Asia — spotlight innovation and strengthen industry credibility across 17+ regions.",
                link: "/projects",
                color: "--primary",
              },
              {
                icon: Users,
                title: "Tech to Connect",
                desc: "Less talk. More implementation — connecting GBA and Asian tech leaders with global enterprise decision-makers.",
                link: "/projects",
                color: "--secondary",
              },
              {
                icon: GraduationCap,
                title: "GenAI Courses",
                desc: "Executive-level generative AI programmes for enterprise capability building, empowering GBA professionals for the global stage.",
                link: "/projects",
                color: "--accent",
              },
            ].map((item, i) => (
              <ScrollReveal key={i} delay={i * 100} direction="left">
                <Link
                  to={item.link}
                  className="group relative flex items-center justify-between py-8 border-b border-border/30 hover:border-transparent transition-colors duration-300 overflow-hidden"
                >
                  <div
                    className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                    style={{
                      background: `linear-gradient(90deg, hsl(var(${item.color}) / 0.04), transparent)`,
                    }}
                  />
                  <div className="flex items-center gap-6 relative z-10">
                    <div className="h-12 w-12 rounded-full border border-border/50 flex items-center justify-center group-hover:border-transparent transition-all duration-300">
                      <item.icon className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                    <div>
                      <h3 className="text-xl md:text-2xl font-semibold group-hover:text-primary transition-colors editorial-sans">{item.title}</h3>
                      <p className="text-sm text-muted-foreground mt-1 max-w-lg hidden sm:block">{item.desc}</p>
                    </div>
                  </div>
                  <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all shrink-0 relative z-10" />
                </Link>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* Colorful gradient band before CTA */}
      <div className="relative h-1.5 w-full overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(90deg, hsl(var(--secondary)), hsl(var(--primary)), hsl(var(--accent)), hsl(var(--coral)), hsl(var(--secondary)))",
          }}
        />
      </div>

      {/* ── CTA Banner ── */}
      <section className="py-32 relative overflow-hidden">
        <div className="absolute inset-0">
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{
              background: "radial-gradient(ellipse at 30% 50%, hsl(var(--primary)), transparent 60%), radial-gradient(ellipse at 70% 50%, hsl(var(--secondary)), transparent 60%)",
            }}
          />
          <div
            className="absolute top-0 right-0 w-[600px] h-[600px] rounded-full blur-[150px] opacity-[0.06]"
            style={{ background: "hsl(var(--accent))", animation: "float 15s ease-in-out infinite" }}
          />
        </div>
        <div className="container mx-auto px-6 relative z-10 text-center">
          <ScrollReveal>
            <h2 className="text-4xl md:text-6xl font-bold mb-6">
              Ready to go <span className="italic gradient-text">global?</span>
            </h2>
            <p className="text-lg text-muted-foreground mb-10 max-w-lg mx-auto editorial-sans">
              Join the platform bridging GBA innovation to global markets and opportunities.
            </p>
            <div className="flex flex-wrap gap-4 justify-center">
              <Button asChild size="lg" className="rounded-full px-10 text-sm uppercase tracking-wider">
                <Link to="/membership">Join Us</Link>
              </Button>
              <Button asChild variant="ghost" size="lg" className="rounded-full px-10 text-sm uppercase tracking-wider text-muted-foreground hover:text-foreground">
                <Link to="/contact" className="inline-flex items-center gap-2">
                  Talk to Us <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </ScrollReveal>
        </div>
      </section>

      <GradientDivider variant="cool" />
    </Layout>
  );
};

export default Index;
