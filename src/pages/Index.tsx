import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import Layout from "@/components/Layout";
import { Users, Award, Lightbulb, Eye, Zap, ArrowRight, Network } from "lucide-react";

const Index = () => {
  return (
    <Layout>
      {/* Hero */}
      <section className="relative overflow-hidden min-h-[90vh] flex items-center">
        {/* Animated background */}
        <div className="absolute inset-0">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" style={{ animation: "float 8s ease-in-out infinite" }} />
          <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-secondary/10 rounded-full blur-3xl" style={{ animation: "float 10s ease-in-out infinite 2s" }} />
          <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-accent/5 rounded-full blur-3xl" style={{ animation: "float 12s ease-in-out infinite 4s" }} />
        </div>

        <div className="container mx-auto px-4 relative z-10 text-center">
          <h1 className="text-4xl sm:text-5xl md:text-7xl font-bold tracking-tight leading-tight animate-fade-up">
            Where Hong Kong's tech<br />
            <span className="gradient-text">decision‑makers connect.</span>
          </h1>
          <p className="mt-6 text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto animate-fade-up animation-delay-200">
            WTIA connects enterprises, tech leaders, and innovators to accelerate real adoption—through projects, recognition platforms, and industry programmes.
          </p>
          <div className="mt-8 flex flex-wrap gap-4 justify-center animate-fade-up animation-delay-400">
            <Button asChild size="lg" className="text-base px-8">
              <Link to="/membership">Join WTIA</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="text-base px-8 border-primary/30 hover:bg-primary/10 text-foreground">
              <Link to="/contact">Talk to Us</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Social proof */}
      <section className="py-8 border-y border-border bg-muted/30">
        <div className="container mx-auto px-4 text-center">
          <p className="text-sm text-muted-foreground">
            Trusted by a cross‑section of corporates, startups, solution providers, and ecosystem partners across Hong Kong and Asia.
          </p>
        </div>
      </section>

      {/* Why WTIA */}
      <section className="py-24">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-4 animate-fade-up">
            Why <span className="gradient-text">WTIA</span>
          </h2>
          <p className="text-center text-muted-foreground mb-16 max-w-xl mx-auto animate-fade-up animation-delay-200">
            Turn emerging tech into real business outcomes.
          </p>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                icon: Users,
                title: "Executive Network",
                desc: "Meet business leaders and solution owners who are actively building and deploying next‑gen technology.",
              },
              {
                icon: Award,
                title: "Industry Platforms",
                desc: "Participate in WTIA-supported industry initiatives such as the Asia Smart App Awards to amplify credibility and reach.",
              },
              {
                icon: Lightbulb,
                title: "Knowledge + Connection",
                desc: "Join practical sessions and ecosystem programmes such as Tech to Connect to exchange real implementation playbooks.",
              },
            ].map((item, i) => (
              <Card key={i} className={`glass-card glow-primary hover:scale-[1.02] transition-all duration-300 animate-fade-up animation-delay-${(i + 1) * 200}`}>
                <CardContent className="p-8">
                  <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-5">
                    <item.icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="text-xl font-semibold mb-3">{item.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{item.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Messaging Pillars */}
      <section className="py-24 bg-muted/20">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-16">
            Three pillars of <span className="gradient-text">membership value</span>
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: Network,
                title: "Influence",
                desc: "Get closer to the ecosystem shaping standards, adoption, and industry direction in Hong Kong and Asia.",
              },
              {
                icon: Eye,
                title: "Visibility",
                desc: "Raise enterprise credibility through industry platforms and award ecosystems WTIA supports.",
              },
              {
                icon: Zap,
                title: "Access",
                desc: "Meet builders, buyers, and collaborators via initiatives like Tech to Connect.",
              },
            ].map((item, i) => (
              <div key={i} className="text-center p-8">
                <div className="h-16 w-16 rounded-2xl bg-secondary/10 flex items-center justify-center mx-auto mb-6">
                  <item.icon className="h-8 w-8 text-secondary" />
                </div>
                <h3 className="text-2xl font-bold mb-3">{item.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Initiatives */}
      <section className="py-24">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-16">
            Featured <span className="gradient-text">Initiatives</span>
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                title: "Asia Smart App Awards",
                desc: "Recognition that travels across Asia — spotlight innovation and strengthen industry credibility across the region.",
                link: "/projects",
              },
              {
                title: "Tech to Connect",
                desc: "Less talk. More implementation — connecting people, ideas, and practical adoption conversations.",
                link: "/projects",
              },
              {
                title: "GenAI Courses",
                desc: "Executive-level generative AI programmes for enterprise capability building.",
                link: "/projects",
              },
            ].map((item, i) => (
              <Card key={i} className="glass-card hover:border-primary/30 transition-all duration-300 group">
                <CardContent className="p-8">
                  <h3 className="text-xl font-semibold mb-3 group-hover:text-primary transition-colors">{item.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed mb-6">{item.desc}</p>
                  <Link to={item.link} className="inline-flex items-center gap-1 text-primary text-sm font-medium hover:gap-2 transition-all">
                    Learn more <ArrowRight className="h-4 w-4" />
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Banner */}
      <section className="py-24 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-secondary/5 to-accent/5" />
        <div className="container mx-auto px-4 relative z-10 text-center">
          <h2 className="text-3xl md:text-5xl font-bold mb-6">Ready to accelerate?</h2>
          <p className="text-lg text-muted-foreground mb-8 max-w-lg mx-auto">
            Join a member network built for practical outcomes: partnerships, visibility, knowledge exchange, and ecosystem access.
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <Button asChild size="lg" className="text-base px-8">
              <Link to="/membership">Join WTIA</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="text-base px-8 border-primary/30 hover:bg-primary/10 text-foreground">
              <Link to="/contact">Talk to Us</Link>
            </Button>
          </div>
        </div>
      </section>
    </Layout>
  );
};

export default Index;
