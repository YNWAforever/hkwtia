import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Trophy, Users, GraduationCap, Smartphone, ArrowRight } from "lucide-react";
import GradientDivider from "@/components/GradientDivider";
import ScrollReveal from "@/components/ScrollReveal";
import heroImage from "@/assets/wtia-event-1.jpg";

const projects = [
  {
    icon: GraduationCap,
    num: "01",
    title: "Certified Practitioner in GenAI (CPAI)",
    subtitle: "GenAI for Business Innovation and Applications.",
    desc: "This certified course provided by WTIA and CUSCS, offers an introduction to the fundamental technologies and tools of Generative AI (GenAI). It delves into real-world applications of GenAI across diverse business sectors. Participants will acquire the knowledge to harness GenAI techniques effectively, fostering both productivity and creativity. Additionally, they will develop practical skills to implement GenAI solutions for addressing a range of business challenges.",
    link: "https://www.scs.cuhk.edu.hk/tc/part-time/data-science/generative-ai-for-business-innovation-and-applications-ai/252-191120-01",
    cta: "Learn more",
  },
  {
    icon: Smartphone,
    num: "02",
    title: "HKICT Startup Award",
    subtitle: "Discovering outstanding local ICT startups.",
    desc: "Hong Kong ICT Startup Award aims at discovering and recognising the outstanding local ICT startup companies which focus on software, hardware and social innovation areas and, reward their distinguished development based on their growth, innovation, creativity, functionality, market potential and performance. Grand Award Winners are selected in each category, and an \"Award of the Year\" is selected from the Grand Awards by the Grand Judging Panel.",
    link: "https://www.ictstartupaward.com/",
    cta: "Explore HKICT",
  },
  {
    icon: Trophy,
    num: "03",
    title: "Asia Smart App Awards (ASA)",
    subtitle: "The 10th edition uniting 16 regional co-organisers.",
    desc: "The Hong Kong Wireless Technology Industry Association (WTIA) organises the Asia Smart App Awards (ASA), the 10th edition of the award scheme riding on the success of previous editions, with funding support from the Cultural and Creative Industries Development Agency (CCIDA). By uniting 16 regional co-organisers, the ASA carries this auspicious occasion to further encourage the development of the expanding smart app industry across Asia.",
    link: "https://contest2024.bestasiaapp.hk/",
    cta: "Explore ASA",
  },
  {
    icon: Users,
    num: "04",
    title: "Tech Connect Series (TCT)",
    subtitle: "Helping local organisations recognise AI potential.",
    desc: "The Tech Connect Series (TCT), supported by the General Support Programme, concentrates on helping local organisations recognise the potential benefit of AI applications and invest in operation development. This series attempts to enhance the public awareness of the importance of the utilization of AI technologies by organising a series of interactive events, including 10 industries-oriented technical workshops, 2 major Tech to Connect seminars and a grand conference.",
    link: "https://techtoconnect.net/",
    cta: "See upcoming sessions",
  },
];

const Projects = () => (
  <Layout>
    {/* Hero with image */}
    <section className="relative h-[70vh] min-h-[500px] flex items-end overflow-hidden">
      <img src={heroImage} alt="WTIA Projects & Awards" className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
      <div className="container mx-auto px-6 relative z-10 pb-16">
        <p className="text-xs uppercase tracking-[0.3em] text-primary mb-4 editorial-sans animate-fade-in">WTIA Projects</p>
        <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold leading-[0.95] tracking-tight animate-fade-up">
          Initiatives driving Hong Kong's tech <span className="italic gradient-text">ecosystem.</span>
        </h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-xl leading-relaxed animate-fade-up animation-delay-200 editorial-sans">
          From AI certification to cross-regional awards, our projects recognise innovation, build capability, and connect the industry.
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
                    <a href={p.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm uppercase tracking-wider">
                      {p.cta} <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                    </a>
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
