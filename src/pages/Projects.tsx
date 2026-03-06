import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Trophy, Users, GraduationCap, ArrowRight } from "lucide-react";
import GradientDivider from "@/components/GradientDivider";
import ScrollReveal from "@/components/ScrollReveal";
import heroImage from "@/assets/projects-hero.jpg";

const projects = [
  {
    icon: Trophy,
    num: "01",
    title: "Asia Smart App Awards",
    subtitle: "Recognition that travels across Asia and beyond.",
    desc: "Innovate Hong Kong supports platforms like the Asia Smart App Awards to spotlight GBA and Asian innovation, strengthening cross-border industry credibility across 17+ regions. The ASA Awards recognise outstanding achievements in smart applications, driving global recognition for Hong Kong and the GBA's tech ecosystem.",
    link: "https://contest2024.bestasiaapp.hk/",
    cta: "Explore ASA",
  },
  {
    icon: Users,
    num: "02",
    title: "Tech to Connect",
    subtitle: "Less talk. More cross-border implementation.",
    desc: "Tech to Connect is an industry-oriented programme series built to connect GBA innovators with global enterprise decision-makers. It brings together international buyers, solution providers, and thought leaders for focused knowledge exchange that drives real cross-border adoption.",
    link: "https://techtoconnect.net/",
    cta: "See upcoming sessions",
  },
  {
    icon: GraduationCap,
    num: "03",
    title: "Certified Practitioner in GenAI (CPAI)",
    subtitle: "Executive-level AI capability building for the GBA.",
    desc: "Co-developed with CUSCS, this certified course offers an introduction to the fundamental technologies and tools of Generative AI. Participants acquire knowledge to harness GenAI techniques effectively, empowering GBA professionals to compete on the global stage.",
    link: "/contact",
    cta: "Learn more",
  },
];

const Projects = () => (
  <Layout>
    {/* Hero with image */}
    <section className="relative h-[70vh] min-h-[500px] flex items-end overflow-hidden">
      <img src={heroImage} alt="Innovate Hong Kong Projects & Awards" className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
      <div className="container mx-auto px-6 relative z-10 pb-16">
        <p className="text-xs uppercase tracking-[0.3em] text-primary mb-4 editorial-sans animate-fade-in">Projects & Awards</p>
        <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold leading-[0.95] tracking-tight animate-fade-up">
          Initiatives designed to move the <span className="italic gradient-text">global ecosystem.</span>
        </h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-xl leading-relaxed animate-fade-up animation-delay-200 editorial-sans">
          Recognising cross-border excellence, surfacing real use cases, and connecting GBA builders with global decision makers.
        </p>
      </div>
    </section>

    <GradientDivider variant="multi" />

    <section className="pb-32">
      <div className="container mx-auto px-6">
        <div className="space-y-24">
          {projects.map((p, i) => (
            <ScrollReveal key={i} delay={i * 150}>
              <div className="grid md:grid-cols-12 gap-8 items-start group">
                <div className="md:col-span-4">
                  <span className="text-xs text-muted-foreground/40 editorial-sans">{p.num}</span>
                  <div className="mt-3 mb-4 h-14 w-14 rounded-full border border-border/50 flex items-center justify-center group-hover:border-primary/50 group-hover:bg-primary/5 transition-all duration-500">
                    <p.icon className="h-6 w-6 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                  <h2 className="text-3xl md:text-4xl font-bold">{p.title}</h2>
                  <p className="text-lg text-primary mt-2 italic">{p.subtitle}</p>
                </div>
                <div className="md:col-span-7 md:col-start-6">
                  <div className="w-16 h-px bg-border mb-8 group-hover:w-24 group-hover:bg-primary transition-all duration-500" />
                  <p className="text-muted-foreground leading-relaxed mb-8 text-lg editorial-sans">{p.desc}</p>
                  <Button asChild variant="ghost" className="rounded-full px-0 text-primary hover:text-primary/80 hover:bg-transparent">
                    {p.link.startsWith("http") ? (
                      <a href={p.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm uppercase tracking-wider">
                        {p.cta} <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                      </a>
                    ) : (
                      <Link to={p.link} className="inline-flex items-center gap-2 text-sm uppercase tracking-wider">
                        {p.cta} <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                      </Link>
                    )}
                  </Button>
                </div>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  </Layout>
);

export default Projects;
