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
  { icon: Globe, title: "Networking Events", desc: "Free participation to networking events with industry experts and professionals in wireless, mobile, and emerging technologies." },
  { icon: Handshake, title: "Business Matching", desc: "Exclusive networking and business-matching events with C-Suite or Director-level professionals in wireless & mobile industries." },
  { icon: Mic, title: "Speaking Opportunities", desc: "Exclusive speaking opportunities at WTIA-organized events, career fairs, and higher education institutions." },
  { icon: Users, title: "Member Spotlights", desc: "Opportunity to be featured in 'Meet our Members,' a series of interviews showcasing WTIA members to the wider community." },
  { icon: BarChart3, title: "Marketing & Exposure", desc: "Marketing of in-house events on WTIA's well-acclaimed social networks including Facebook, LinkedIn, and other platforms." },
  { icon: Shield, title: "Discounts & Perks", desc: "Discounts on products, services, booth rentals, exhibitions, and free admission to selected events organized or supported by WTIA." },
];

const tiers = [
  {
    name: "Platinum Member",
    price: "$4,800",
    period: "/year",
    recommended: true,
    desc: "Best for corporates and large-scale operators seeking leadership roles, advisory board access, and maximum cross-industry visibility.",
    features: [
      "Join Sub-Committee or Advisory Board",
      "Vote at AGM or EGM",
      "Executive Committee eligibility",
      "All networking & business-matching events",
      "Speaking at events & career fairs",
      "Member spotlight interviews",
      "Social media marketing",
      "Job ad postings on website",
      "Product & service discounts",
      "Exhibition booth discounts",
      "Free admission to selected events",
    ],
  },
  {
    name: "Corporate Member",
    price: "$1,800",
    period: "/year",
    recommended: false,
    desc: "Best for SMEs and established solution providers seeking networking, visibility, and collaboration opportunities.",
    features: [
      "All networking & business-matching events",
      "Speaking at events & career fairs",
      "Member spotlight interviews",
      "Social media marketing",
      "Job ad postings on website",
      "Product & service discounts",
      "Exhibition booth discounts",
      "Free admission to selected events",
    ],
  },
  {
    name: "Individual Member",
    price: "$500",
    period: "/year",
    recommended: false,
    desc: "Best for professionals seeking to stay connected with the wireless and emerging technology community.",
    features: [
      "Networking events with industry experts",
      "C-Suite business-matching events",
    ],
  },
];

const interestOptions = ["Networking events", "Speaking opportunities", "Business matching", "Marketing exposure", "Job postings", "Exhibition discounts"];

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
            Become a <span className="italic gradient-text">WTIA member.</span>
          </h1>
          <p className="mt-8 text-lg text-muted-foreground max-w-xl leading-relaxed animate-fade-up animation-delay-200 editorial-sans">
            WTIA membership fee is charged on an annual basis. The annual membership period is measured from when we process your application and payment to the exact date on the next calendar year. Membership will be renewed automatically.
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
                    <h3 className="text-xl font-bold mb-1 editorial-sans">{t.name}</h3>
                    <p className="text-3xl font-bold gradient-text mb-1">{t.price}<span className="text-sm text-muted-foreground font-normal">{t.period}</span></p>
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
          <ScrollReveal delay={500}>
            <p className="text-xs text-muted-foreground mt-8 text-center italic editorial-sans">
              *** The Bespoke Partnership Contract allows for a customized partnership & membership agreement between WTIA and a Platinum member to further enhance and fulfill business objectives while exchanging value-added benefits to other members of WTIA.
            </p>
          </ScrollReveal>
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
              "Companies in the wireless and mobile industry seeking networking, partnerships, and industry leadership opportunities.",
              "Tech startups and emerging technology companies looking for exposure, mentorship, and connections to enterprise buyers.",
              "Solution providers building in AI, IoT, FinTech, Blockchain, 5G, or enterprise platforms across Hong Kong and the GBA.",
              "Professionals dedicated to the innovative and emerging technologies industry who want to stay connected and advance their careers.",
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
