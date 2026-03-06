import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "react-router-dom";
import GradientDivider from "@/components/GradientDivider";
import { ArrowRight, Wifi, Shield, Smartphone, Rocket, Brain, Calendar, Globe, Users, Award } from "lucide-react";
import heroImage from "@/assets/history-hero.jpg";

const eras = [
  {
    num: "01",
    period: "2001–2008",
    title: "The Infrastructure & Security Pioneer",
    color: "text-primary",
    borderColor: "border-primary/30",
    bgAccent: "bg-primary/5",
    icon: Shield,
    challenge: "Hong Kong was transitioning to mobile broadband, but public trust and network security lagged behind.",
    milestones: [
      {
        year: "2001",
        title: "Foundation",
        desc: "WTIA is officially established by industry leaders to facilitate cooperation among telecoms, hardware manufacturers, and developers.",
      },
      {
        year: "2002",
        title: "The SafeWiFi Project",
        desc: "Long before cybersecurity was a boardroom topic, WTIA launched \"SafeWiFi.\" In a famous ongoing initiative, WTIA experts rode Hong Kong's tram networks with scanning equipment to audit public Wi-Fi security. This project successfully forced the improvement of public network safety protocols city-wide.",
      },
    ],
  },
  {
    num: "02",
    period: "2009–2018",
    title: "The Smartphone & App Boom",
    color: "text-secondary",
    borderColor: "border-secondary/30",
    bgAccent: "bg-secondary/5",
    icon: Smartphone,
    challenge: "The iPhone and Android changed consumer behavior. Hong Kong needed to pivot from telecom hardware to global software development.",
    milestones: [
      {
        year: "ASA",
        title: "Asia Smart App Awards",
        desc: "WTIA foresaw the app economy boom and created the ASA. Supported by government funding, this platform united 17 Asian regions, giving Hong Kong developers a direct pipeline to international markets and investors.",
      },
      {
        year: "HKICT",
        title: "HKICT Awards (Startup Sector)",
        desc: "WTIA became a leading organizer of the Hong Kong ICT Awards. By championing the \"ICT Startup\" category, WTIA bridged the gap between early-stage tech innovators and enterprise buyers seeking fresh solutions.",
      },
    ],
  },
  {
    num: "03",
    period: "2019–2023",
    title: "Enterprise Digital Transformation",
    color: "text-accent",
    borderColor: "border-accent/30",
    bgAccent: "bg-accent/5",
    icon: Rocket,
    challenge: "5G and IoT became available, but traditional SMEs and enterprises struggled to integrate them into their legacy operations.",
    milestones: [
      {
        year: "T2C",
        title: "The \"Tech to Connect\" Series",
        desc: "WTIA launched this flagship program to cut through the hype. Rather than theoretical talks, Tech to Connect provided industry-oriented technical workshops, directly matching solution providers with enterprise decision-makers to accelerate O2O, e-commerce, and 5G deployment.",
      },
      {
        year: "20+1",
        title: "21st Anniversary",
        desc: "Coming out of the pandemic, WTIA released its 21st-anniversary commemorative book, reaffirming its mandate to help Hong Kong businesses survive and scale through rapid digital transformation.",
      },
    ],
  },
  {
    num: "04",
    period: "2024–2026",
    title: "The Intelligence & Web3 Era",
    color: "text-primary",
    borderColor: "border-primary/30",
    bgAccent: "bg-primary/5",
    icon: Brain,
    challenge: "The explosion of Generative AI and Web3 requires new skill sets, ethical standards, and rapid enterprise deployment.",
    milestones: [
      {
        year: "CPAI",
        title: "GenAI Certification",
        desc: "In partnership with CUSCS, WTIA launched the Certified Practitioner in Generative AI for Business Innovation—professionalizing AI adoption for the corporate workforce.",
      },
      {
        year: "2025",
        title: "Asia Smart Innovation Awards",
        desc: "WTIA expanded its flagship awards into the Asia Smart Innovation Awards, recognizing that the future is no longer just about \"apps,\" but integrated AI, spatial computing, media, and digital art.",
      },
      {
        year: "2026",
        title: "25th Anniversary",
        desc: "Today, under the leadership of Chairman Keith Li and the Executive Committee, WTIA stands as a network of hundreds of corporate members, driving Hong Kong's status as a top-class innovation smart hub.",
      },
    ],
  },
];

const stats = [
  { value: "25", label: "Years of unbroken service to the Hong Kong tech ecosystem", suffix: "Years", icon: Calendar },
  { value: "17+", label: "Asian regions connected through WTIA-led platforms and awards", suffix: "Regions", icon: Globe },
  { value: "100s", label: "Corporate members, spanning global telecoms to local AI startups", suffix: "Members", icon: Users },
  { value: "10K+", label: "Professionals trained, connected, and elevated through WTIA programmes", suffix: "Professionals", icon: Award },
];

const History = () => (
  <Layout>
    {/* Hero with image */}
    <section className="relative h-[70vh] min-h-[500px] flex items-end overflow-hidden">
      <img src={heroImage} alt="WTIA 25th Anniversary" className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
      <div className="container mx-auto px-6 relative z-10 pb-16">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/20 bg-primary/5 mb-6 animate-fade-in">
          <Wifi className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-medium text-primary uppercase tracking-wider editorial-sans">2001 – 2026</span>
        </div>
        <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold leading-[0.95] tracking-tight animate-fade-up">
          25 Years of Building<br />Hong Kong's Tech{" "}
          <span className="italic gradient-text">Foundation.</span>
        </h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-xl leading-relaxed animate-fade-up animation-delay-200 editorial-sans">
          From mobile networks to generative AI, WTIA has spent a quarter-century turning emerging technology into enterprise reality.
        </p>
      </div>
    </section>

    <GradientDivider variant="multi" />

    {/* Lead paragraph */}
    <section className="py-20 md:py-28">
      <div className="container mx-auto px-6">
        <div className="grid md:grid-cols-12 gap-10">
          <div className="md:col-span-4">
            <p className="text-xs uppercase tracking-[0.3em] text-primary mb-3 editorial-sans">Our Story</p>
            <h2 className="text-3xl md:text-4xl font-bold leading-tight">
              A quarter-century of <span className="italic gradient-text">impact.</span>
            </h2>
          </div>
          <div className="md:col-span-7 md:col-start-6">
            <div className="w-16 h-px bg-border mb-8" />
            <p className="text-lg text-muted-foreground leading-relaxed editorial-sans">
              Since its incorporation in February 2001, WTIA has operated at the center of Hong Kong's digital transformation. We began as a politically neutral trade association with a single goal: to unite mobile network operators, hardware vendors, and software developers to build out Hong Kong's early wireless ecosystem.
            </p>
            <p className="text-lg text-muted-foreground leading-relaxed mt-6 editorial-sans">
              Today, 25 years later, WTIA serves as the city's premier innovation aggregator—driving the enterprise adoption of 5G, IoT, Web3, and Artificial Intelligence. We don't just watch tech trends; we build the platforms, security standards, and industry networks that make adoption possible.
            </p>
          </div>
        </div>
      </div>
    </section>

    <GradientDivider variant="primary" />

    {/* Timeline */}
    <section className="py-20 md:py-28">
      <div className="container mx-auto px-6">
        <p className="text-xs uppercase tracking-[0.3em] text-primary mb-3 editorial-sans">Timeline</p>
        <h2 className="text-3xl md:text-4xl font-bold mb-20">
          Eras of <span className="italic gradient-text">Impact</span>
        </h2>

        <div className="space-y-28">
          {eras.map((era) => (
            <div key={era.num} className="group">
              {/* Era header */}
              <div className="grid md:grid-cols-12 gap-8 items-start mb-12">
                <div className="md:col-span-4">
                  <span className="text-xs text-muted-foreground/40 editorial-sans">{era.num}</span>
                  <div className={`mt-3 mb-4 h-14 w-14 rounded-full border ${era.borderColor} flex items-center justify-center group-hover:${era.bgAccent} transition-all duration-500`}>
                    <era.icon className={`h-6 w-6 ${era.color} transition-colors`} />
                  </div>
                  <h3 className="text-2xl md:text-3xl font-bold">{era.title}</h3>
                  <p className={`text-sm ${era.color} mt-2 font-medium editorial-sans`}>{era.period}</p>
                </div>
                <div className="md:col-span-7 md:col-start-6">
                  <div className={`w-16 h-px bg-border mb-6 group-hover:w-24 transition-all duration-500`} style={{ borderColor: "currentColor" }} />
                  <div className={`rounded-xl p-5 border border-border/30 ${era.bgAccent}`}>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 editorial-sans font-medium">The Challenge</p>
                    <p className="text-muted-foreground leading-relaxed editorial-sans">{era.challenge}</p>
                  </div>
                </div>
              </div>

              {/* Milestones */}
              <div className="grid md:grid-cols-12 gap-8">
                <div className="md:col-span-7 md:col-start-6 space-y-6">
                  {era.milestones.map((m, j) => (
                    <Card key={j} className="glass-card overflow-hidden hover:border-primary/30 transition-all duration-300">
                      <div className={`h-1 bg-gradient-to-r from-primary via-secondary to-accent opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
                      <CardContent className="p-6">
                        <div className="flex items-start gap-4">
                          <div className={`shrink-0 h-10 w-10 rounded-lg ${era.bgAccent} border ${era.borderColor} flex items-center justify-center`}>
                            <span className={`text-xs font-bold ${era.color}`}>{m.year}</span>
                          </div>
                          <div>
                            <h4 className="font-semibold text-lg mb-1 editorial-sans">{m.title}</h4>
                            <p className="text-sm text-muted-foreground leading-relaxed">{m.desc}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>

    <GradientDivider variant="warm" />

    {/* Stats bar */}
    <section className="py-20 md:py-28">
      <div className="container mx-auto px-6">
        <p className="text-xs uppercase tracking-[0.3em] text-primary mb-3 editorial-sans text-center">Our Impact</p>
        <h2 className="text-3xl md:text-4xl font-bold mb-16 text-center">
          By the <span className="italic gradient-text">Numbers</span>
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-border/30 rounded-xl overflow-hidden">
          {stats.map((s, i) => (
            <div key={i} className="bg-card/40 p-8 text-center hover:bg-card/70 transition-colors duration-500 group">
              <div className="h-12 w-12 mx-auto rounded-full border border-border/50 flex items-center justify-center mb-5 group-hover:border-primary/50 group-hover:bg-primary/5 transition-all">
                <s.icon className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <p className="text-4xl md:text-5xl font-bold gradient-text mb-2">{s.value}</p>
              <p className="text-sm font-medium mb-1 editorial-sans">{s.suffix}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{s.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>

    <GradientDivider variant="cool" />

    {/* CTA */}
    <section className="py-24 md:py-32 relative overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-primary/3 blur-3xl pointer-events-none" />
      <div className="container mx-auto px-6 text-center relative z-10 max-w-3xl">
        <p className="text-xs uppercase tracking-[0.3em] text-primary mb-4 editorial-sans">Join Us</p>
        <h2 className="text-3xl md:text-5xl font-bold leading-tight mb-6">
          Be part of the next 25 years of{" "}
          <span className="italic gradient-text">innovation.</span>
        </h2>
        <p className="text-lg text-muted-foreground leading-relaxed editorial-sans mb-10 max-w-2xl mx-auto">
          For a quarter of a century, the most important technology conversations in Hong Kong have happened within the WTIA network. Whether you are building next-generation AI or seeking to deploy it, your enterprise belongs here.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Button asChild size="lg" className="rounded-full px-10">
            <Link to="/membership" className="inline-flex items-center gap-2">
              Apply for Corporate Membership <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="rounded-full px-10">
            <Link to="/projects" className="inline-flex items-center gap-2">
              Explore Our Upcoming Projects
            </Link>
          </Button>
        </div>
      </div>
    </section>
  </Layout>
);

export default History;
