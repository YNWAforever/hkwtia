import { useState } from "react";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Shield, Handshake, BarChart3, Users, Mic, Globe, Check } from "lucide-react";

const benefits = [
  { icon: Shield, title: "Brand Authority", desc: "Position your company as a serious ecosystem contributor via WTIA's industry platforms and initiatives." },
  { icon: Handshake, title: "Partnerships Pipeline", desc: "Find solution partners, co-host opportunities, and collaboration routes faster." },
  { icon: BarChart3, title: "Market Intelligence", desc: "Learn what's actually being adopted and why—through member exchanges and programme sessions." },
  { icon: Users, title: "Employer Branding", desc: "Signal that your company invests in innovation, talent, and modern capability building." },
  { icon: Mic, title: "Speaking + Visibility", desc: "Priority consideration for panels, showcases, and featured member spotlights." },
  { icon: Globe, title: "Ecosystem Credibility", desc: "Be seen in the same room as builders, decision makers, and ecosystem operators." },
];

const tiers = [
  {
    name: "Enterprise Member",
    recommended: true,
    desc: "Best for corporates, listed companies, and large-scale operators seeking ecosystem leadership and partnership access.",
    features: ["Full programme access", "Priority speaking slots", "Partnership matching", "Executive roundtables"],
  },
  {
    name: "Corporate Member",
    recommended: false,
    desc: "Best for SMEs and established solution providers seeking visibility and collaboration.",
    features: ["Programme access", "Member directory listing", "Event invitations", "Networking sessions"],
  },
  {
    name: "Startup / Innovator",
    recommended: false,
    desc: "Best for early-stage teams seeking credibility, intros, and learning loops.",
    features: ["Programme access", "Startup showcases", "Mentorship sessions", "Community access"],
  },
];

const interestOptions = ["Partnerships", "Visibility", "Speaking", "Market insights", "Talent", "Sponsorship"];

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
      <section className="py-24 md:py-32">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-4xl md:text-6xl font-bold mb-6 animate-fade-up">
            Corporate Membership that converts<br />
            <span className="gradient-text">technology into business growth.</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto animate-fade-up animation-delay-200">
            WTIA membership is built for companies that want outcomes: market visibility, partner access, and credible participation in Hong Kong's innovation ecosystem—without the noise.
          </p>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-20 bg-muted/20">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12">Member <span className="gradient-text">Benefits</span></h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {benefits.map((b, i) => (
              <Card key={i} className="glass-card">
                <CardContent className="p-6">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                    <b.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="font-semibold text-lg mb-2">{b.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{b.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Tiers */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12">Membership <span className="gradient-text">Tiers</span></h2>
          <div className="grid md:grid-cols-3 gap-6">
            {tiers.map((t, i) => (
              <Card key={i} className={`glass-card relative ${t.recommended ? "border-primary/50 glow-primary" : ""}`}>
                {t.recommended && (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground">Recommended</Badge>
                )}
                <CardHeader>
                  <CardTitle className="text-xl">{t.name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground leading-relaxed">{t.desc}</p>
                  <ul className="space-y-2">
                    {t.features.map((f) => (
                      <li key={f} className="flex items-center gap-2 text-sm">
                        <Check className="h-4 w-4 text-primary" /> {f}
                      </li>
                    ))}
                  </ul>
                  <Button asChild className="w-full mt-4" variant={t.recommended ? "default" : "outline"}>
                    <a href="#apply">Apply Now</a>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Who should join */}
      <section className="py-20 bg-muted/20">
        <div className="container mx-auto px-4 max-w-2xl text-center">
          <h2 className="text-3xl font-bold mb-8">Who should <span className="gradient-text">join?</span></h2>
          <ul className="space-y-4 text-left">
            {[
              "CIO/CTO-led organisations exploring next-gen connectivity and AI adoption.",
              "Solution providers building wireless, mobile, AI, IoT, or enterprise platforms.",
              "Brands and operators who want visibility through credible industry initiatives and recognition platforms.",
            ].map((item, i) => (
              <li key={i} className="flex items-start gap-3 text-muted-foreground">
                <Check className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Application form */}
      <section id="apply" className="py-20">
        <div className="container mx-auto px-4 max-w-xl">
          <h2 className="text-3xl font-bold text-center mb-8">Apply for <span className="gradient-text">Membership</span></h2>
          <Card className="glass-card">
            <CardContent className="p-8">
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="company">Company Name</Label>
                  <Input id="company" placeholder="Use your official registered name" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="name">Your Name</Label>
                  <Input id="name" placeholder="Full name" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">Role</Label>
                  <Input id="role" placeholder="So we can route you to the right member benefits" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" placeholder="Work email" required />
                </div>
                <div className="space-y-2">
                  <Label>What you want from WTIA</Label>
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
                  <Label htmlFor="priority">Priority for the next 6 months (optional)</Label>
                  <Textarea id="priority" placeholder="Share one priority—so we can propose a path." rows={3} />
                </div>
                <Button type="submit" className="w-full" size="lg">Submit Application</Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </section>
    </Layout>
  );
};

export default Membership;
