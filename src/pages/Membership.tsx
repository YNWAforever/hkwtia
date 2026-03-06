import { useState } from "react";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Shield, Handshake, BarChart3, Users, Mic, Globe, Check, ArrowRight } from "lucide-react";
import GradientDivider from "@/components/GradientDivider";
import ScrollReveal from "@/components/ScrollReveal";

const benefits = [
  { icon: Globe, title: "Cross-Border Reach", desc: "Access a unified network spanning Hong Kong, the Greater Bay Area, and key Asian markets to scale your technology internationally." },
  { icon: Handshake, title: "Global Partnerships", desc: "Connect with international investors, regional industry leaders, and cross-border collaboration routes faster." },
  { icon: BarChart3, title: "Market Intelligence", desc: "Learn what's being adopted across the GBA and Asia—through member exchanges and programme sessions." },
  { icon: Users, title: "GBA Tech Community", desc: "Join a thriving ecosystem of GBA innovators, enterprise leaders, and global technology partners." },
  { icon: Mic, title: "Speaking + Visibility", desc: "Priority consideration for international panels, showcases, and featured member spotlights across Asia." },
  { icon: Shield, title: "Ecosystem Credibility", desc: "Be positioned alongside the builders and decision-makers shaping the GBA's global tech footprint." },
];

const tiers = [
  {
    name: "Enterprise Member",
    recommended: true,
    desc: "Best for corporates, listed companies, and large-scale operators seeking cross-border ecosystem leadership and global partnership access.",
    features: ["Full programme access", "Priority speaking slots", "Global partnership matching", "Executive roundtables"],
  },
  {
    name: "Corporate Member",
    recommended: false,
    desc: "Best for SMEs and established solution providers seeking GBA-to-global visibility and collaboration.",
    features: ["Programme access", "Member directory listing", "Cross-border event invitations", "Networking sessions"],
  },
  {
    name: "Startup / Innovator",
    recommended: false,
    desc: "Best for early-stage GBA teams seeking global credibility, international intros, and learning loops.",
    features: ["Programme access", "Startup showcases", "Mentorship sessions", "Community access"],
  },
];

const interestOptions = ["Global partnerships", "Cross-border visibility", "Speaking", "Market insights", "Talent", "Sponsorship"];

const Membership = () => {
  const { toast } = useToast();
  const [interests, setInterests] = useState<string[]>([]);

  const toggleInterest = (v: string) => {
    setInterests((prev) => prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    toast({ title: "Application received!", description: "We'll be in touch within 2 business days." });
    (e.target as HTMLFormElement).reset();
    setInterests([]);
  };

  return (
    <Layout>
      {/* Hero */}
      <section className="py-32 md:py-40">
        <div className="container mx-auto px-6 max-w-4xl">
          <p className="text-xs uppercase tracking-[0.3em] text-primary mb-6 editorial-sans animate-fade-in">Membership</p>
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold leading-[0.95] tracking-tight animate-fade-up">
            Membership that scales your technology from GBA to the <span className="italic gradient-text">global stage.</span>
          </h1>
          <p className="mt-8 text-lg text-muted-foreground max-w-xl leading-relaxed animate-fade-up animation-delay-200 editorial-sans">
            Innovate Hong Kong membership is built for companies that want cross-border outcomes: global market visibility, international partner access, and credible participation in Asia's most connected innovation ecosystem.
          </p>
        </div>
      </section>

      <GradientDivider variant="multi" />

      {/* Benefits */}
      <section className="py-24 border-b border-border/30">
        <div className="container mx-auto px-6">
          <ScrollReveal>
            <p className="text-xs uppercase tracking-[0.3em] text-primary mb-3 editorial-sans">Why join</p>
            <h2 className="text-3xl md:text-4xl font-bold mb-16">Member <span className="italic gradient-text">Benefits</span></h2>
          </ScrollReveal>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-border/30 rounded-lg overflow-hidden">
            {benefits.map((b, i) => (
              <ScrollReveal key={i} delay={i * 100}>
                <div className="bg-card/40 p-8 hover:bg-card/70 transition-colors duration-500 h-full">
                  <b.icon className="h-5 w-5 text-primary mb-5" />
                  <h3 className="font-semibold text-lg mb-2 editorial-sans">{b.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{b.desc}</p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      <GradientDivider variant="primary" />

      {/* Tiers */}
      <section className="py-24">
        <div className="container mx-auto px-6">
          <ScrollReveal>
            <p className="text-xs uppercase tracking-[0.3em] text-primary mb-3 editorial-sans">Plans</p>
            <h2 className="text-3xl md:text-4xl font-bold mb-16">Membership <span className="italic gradient-text">Tiers</span></h2>
          </ScrollReveal>
          <div className="grid md:grid-cols-3 gap-6">
            {tiers.map((t, i) => (
              <ScrollReveal key={i} delay={i * 150}>
                <Card className={`glass-card relative overflow-hidden transition-all duration-300 hover:border-primary/30 h-full ${t.recommended ? "border-primary/40 glow-primary" : ""}`}>
                  {t.recommended && (
                    <Badge className="absolute top-4 right-4 bg-primary text-primary-foreground text-xs rounded-full">Recommended</Badge>
                  )}
                  <CardContent className="p-8 pt-8">
                    <h3 className="text-xl font-bold mb-3 editorial-sans">{t.name}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed mb-6">{t.desc}</p>
                    <ul className="space-y-3 mb-8">
                      {t.features.map((f) => (
                        <li key={f} className="flex items-center gap-3 text-sm">
                          <Check className="h-3.5 w-3.5 text-primary shrink-0" /> {f}
                        </li>
                      ))}
                    </ul>
                    <Button asChild className="w-full rounded-full" variant={t.recommended ? "default" : "outline"}>
                      <a href="#apply" className="inline-flex items-center gap-2">
                        Apply Now <ArrowRight className="h-3.5 w-3.5" />
                      </a>
                    </Button>
                  </CardContent>
                </Card>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      <GradientDivider variant="warm" />

      {/* Who should join */}
      <section className="py-24 border-b border-border/30">
        <div className="container mx-auto px-6 max-w-3xl">
          <ScrollReveal>
            <h2 className="text-3xl md:text-4xl font-bold mb-10 text-center">Who should <span className="italic gradient-text">join?</span></h2>
          </ScrollReveal>
          <div className="space-y-6">
            {[
              "GBA tech companies seeking to scale their innovations to international markets via Hong Kong's global launchpad.",
              "International investors and enterprises looking to tap into the Greater Bay Area's rapidly growing tech ecosystem.",
              "Solution providers building AI, IoT, Web3, or enterprise platforms across Hong Kong and the GBA.",
              "Brands and operators who want cross-border visibility through credible industry initiatives and recognition platforms.",
            ].map((item, i) => (
              <ScrollReveal key={i} delay={i * 100} direction="left">
                <div className="flex items-start gap-4 group">
                  <div className="h-8 w-8 rounded-full border border-border/50 flex items-center justify-center shrink-0 mt-0.5 group-hover:border-primary/50 transition-colors">
                    <Check className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <p className="text-muted-foreground leading-relaxed editorial-sans">{item}</p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      <GradientDivider variant="cool" />

      {/* Application form */}
      <section id="apply" className="py-24">
        <div className="container mx-auto px-6 max-w-xl">
          <ScrollReveal>
            <p className="text-xs uppercase tracking-[0.3em] text-primary mb-3 text-center editorial-sans">Get started</p>
            <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">Apply for <span className="italic gradient-text">Membership</span></h2>
          </ScrollReveal>
          <ScrollReveal delay={200}>
            <Card className="glass-card">
              <CardContent className="p-8">
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="company" className="text-xs uppercase tracking-wider">Company Name</Label>
                    <Input id="company" placeholder="Use your official registered name" required className="rounded-lg" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="name" className="text-xs uppercase tracking-wider">Your Name</Label>
                    <Input id="name" placeholder="Full name" required className="rounded-lg" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="role" className="text-xs uppercase tracking-wider">Role</Label>
                    <Input id="role" placeholder="So we can route you to the right member benefits" required className="rounded-lg" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-xs uppercase tracking-wider">Email</Label>
                    <Input id="email" type="email" placeholder="Work email" required className="rounded-lg" />
                  </div>
                  <div className="space-y-3">
                    <Label className="text-xs uppercase tracking-wider">What you're looking for</Label>
                    <div className="flex flex-wrap gap-3">
                      {interestOptions.map((opt) => (
                        <label key={opt} className="flex items-center gap-2 cursor-pointer">
                          <Checkbox checked={interests.includes(opt)} onCheckedChange={() => toggleInterest(opt)} />
                          <span className="text-sm">{opt}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="priority" className="text-xs uppercase tracking-wider">Priority for the next 6 months (optional)</Label>
                    <Textarea id="priority" placeholder="Share one priority—so we can propose a path." rows={3} className="rounded-lg" />
                  </div>
                  <Button type="submit" className="w-full rounded-full" size="lg">Submit Application</Button>
                </form>
              </CardContent>
            </Card>
          </ScrollReveal>
        </div>
      </section>
    </Layout>
  );
};

export default Membership;
