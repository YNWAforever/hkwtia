import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Layout from "@/components/Layout";
import { ArrowRight, Wifi, Award, Lightbulb, Network, Eye, Zap, Trophy, Users, GraduationCap, Globe } from "lucide-react";
import GradientDivider from "@/components/GradientDivider";

const Index = () => {
  return (
    <Layout>
      {/* Hero — editorial, cinematic */}
      <section className="relative min-h-screen flex items-center overflow-hidden">
        {/* Ambient background */}
        <div className="absolute inset-0 overflow-hidden">
          <div
            className="absolute top-[15%] left-[10%] w-[500px] h-[500px] rounded-full blur-[120px] opacity-10"
            style={{ background: "hsl(var(--primary))", animation: "float 10s ease-in-out infinite" }}
          />
          <div
            className="absolute bottom-[10%] right-[5%] w-[400px] h-[400px] rounded-full blur-[100px] opacity-10"
            style={{ background: "hsl(var(--secondary))", animation: "float 14s ease-in-out infinite 3s" }}
          />
          <div
            className="absolute top-[60%] left-[50%] w-[300px] h-[300px] rounded-full blur-[80px] opacity-[0.07]"
            style={{ background: "hsl(var(--accent))", animation: "float 12s ease-in-out infinite 5s" }}
          />
          {/* Grid overlay */}
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage: "linear-gradient(hsl(var(--border)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--border)) 1px, transparent 1px)",
              backgroundSize: "60px 60px",
            }}
          />
        </div>

        <div className="container mx-auto px-6 relative z-10">
          <div className="max-w-4xl">
            <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground mb-6 editorial-sans animate-fade-in">
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
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 animate-fade-in animation-delay-800">
          <div className="w-px h-16 bg-gradient-to-b from-transparent via-muted-foreground/30 to-transparent" />
        </div>
      </section>

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
          <p className="text-xs text-muted-foreground/60 uppercase tracking-[0.2em] text-center editorial-sans">
            Trusted by corporates, startups, and ecosystem partners across Hong Kong, the Greater Bay Area, and Asia
          </p>
        </div>
      </section>

      <GradientDivider variant="primary" />

      {/* Why Innovate Hong Kong — editorial grid */}
      <section className="py-32">
        <div className="container mx-auto px-6">
          <div className="grid md:grid-cols-12 gap-8 items-start">
            <div className="md:col-span-4">
              <p className="text-xs uppercase tracking-[0.3em] text-primary mb-3 editorial-sans">Why Innovate Hong Kong</p>
              <h2 className="text-4xl md:text-5xl font-bold leading-tight">
                The ultimate bridge from GBA to <span className="italic gradient-text">the world.</span>
              </h2>
            </div>
            <div className="md:col-span-8">
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
            </div>
          </div>
        </div>
      </section>

      {/* Colorful gradient band before pillars */}
      <div className="relative h-1.5 w-full overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(90deg, hsl(var(--primary)), hsl(var(--secondary)), hsl(var(--accent)), hsl(var(--coral)), hsl(var(--primary)))",
          }}
        />
      </div>

      {/* Messaging Pillars — bold editorial */}
      <section className="py-32 relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{
            background: "linear-gradient(180deg, hsl(var(--primary)), transparent 30%, transparent 70%, hsl(var(--secondary)))",
          }}
        />
        <div className="container mx-auto px-6 relative z-10">
          <p className="text-xs uppercase tracking-[0.3em] text-primary mb-12 text-center editorial-sans">Three pillars of our platform</p>
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
              <div key={i} className="group">
                <span className="text-xs text-muted-foreground/40 editorial-sans">{item.num}</span>
                <div
                  className="mt-4 mb-6 w-12 h-0.5 group-hover:w-20 transition-all duration-500 rounded-full"
                  style={{ background: `linear-gradient(90deg, hsl(var(${item.color})), hsl(var(${item.color}) / 0.2))` }}
                />
                <h3 className="text-3xl md:text-4xl font-bold mb-4 italic">{item.title}</h3>
                <p className="text-muted-foreground leading-relaxed editorial-sans">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <GradientDivider variant="warm" />

      {/* Featured Initiatives */}
      <section className="py-32">
        <div className="container mx-auto px-6">
          <div className="text-center mb-20">
            <p className="text-xs uppercase tracking-[0.3em] text-primary mb-3 editorial-sans">Initiatives</p>
            <h2 className="text-4xl md:text-5xl font-bold">
              Featured <span className="italic gradient-text">Programmes</span>
            </h2>
          </div>

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
              <Link
                key={i}
                to={item.link}
                className="group relative flex items-center justify-between py-8 border-b border-border/30 hover:border-transparent transition-colors duration-300 overflow-hidden"
              >
                {/* Hover gradient background */}
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                  style={{
                    background: `linear-gradient(90deg, hsl(var(${item.color}) / 0.04), transparent)`,
                  }}
                />
                <div className="flex items-center gap-6 relative z-10">
                  <div
                    className="h-12 w-12 rounded-full border border-border/50 flex items-center justify-center group-hover:border-transparent transition-all duration-300"
                    style={{
                      // @ts-ignore
                      '--tw-group-hover-bg': `hsl(var(${item.color}) / 0.1)`,
                    }}
                  >
                    <item.icon className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                  <div>
                    <h3 className="text-xl md:text-2xl font-semibold group-hover:text-primary transition-colors editorial-sans">{item.title}</h3>
                    <p className="text-sm text-muted-foreground mt-1 max-w-lg hidden sm:block">{item.desc}</p>
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all shrink-0 relative z-10" />
              </Link>
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

      {/* CTA Banner */}
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
        </div>
      </section>

      <GradientDivider variant="cool" />
    </Layout>
  );
};

export default Index;
