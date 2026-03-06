import Layout from "@/components/Layout";
import { User, Globe, MapPin } from "lucide-react";
import GradientDivider from "@/components/GradientDivider";
import ScrollReveal from "@/components/ScrollReveal";
import heroImage from "@/assets/about-hero.jpg";

const committeeMembers = [
  { name: "Mr. Keith LI", title: "Chairman", company: "Co-Founder and CEO, Innopage Limited" },
  { name: "Mr. Donald CHAN", title: "Vice-Chairman", company: "Co-founder and Senior Advisor, Cherrypicks Limited" },
  { name: "Dr. Lawrence CHEUNG", title: "Vice-Chairman", company: "Chief Innovation Officer, HKPC" },
  { name: "Committee Member", title: "Secretary", company: "" },
  { name: "Committee Member", title: "Treasurer", company: "" },
  { name: "Committee Member", title: "Member", company: "" },
];

const About = () => (
  <Layout>
    {/* Hero with image */}
    <section className="relative h-[70vh] min-h-[500px] flex items-end overflow-hidden">
      <img src={heroImage} alt="About Innovate Hong Kong" className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
      <div className="container mx-auto px-6 relative z-10 pb-16">
        <p className="text-xs uppercase tracking-[0.3em] text-primary mb-4 editorial-sans animate-fade-in">About Innovate Hong Kong</p>
        <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold leading-[0.95] tracking-tight animate-fade-up">
          The gateway connecting GBA innovation to the <span className="italic gradient-text">world.</span>
        </h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-xl leading-relaxed animate-fade-up animation-delay-200 editorial-sans">
          A cross-border platform designed to foster seamless connectivity across Hong Kong, the Greater Bay Area, and the wider Asian technology landscape.
        </p>
      </div>
    </section>

    <GradientDivider variant="multi" />

    {/* Mission */}
    <section className="py-24 border-b border-border/30">
      <div className="container mx-auto px-6">
        <div className="grid md:grid-cols-12 gap-8">
          <div className="md:col-span-4">
            <ScrollReveal>
              <p className="text-xs uppercase tracking-[0.3em] text-primary mb-3 editorial-sans">Our Mission</p>
              <h2 className="text-3xl md:text-4xl font-bold leading-tight">
                Why we <span className="italic gradient-text">exist.</span>
              </h2>
            </ScrollReveal>
          </div>
          <div className="md:col-span-7 md:col-start-6">
            <ScrollReveal delay={200}>
              <div className="w-16 h-px bg-border mb-8" />
              <p className="text-lg text-muted-foreground leading-relaxed editorial-sans">
                Our mission is to serve as the ultimate bridge that connects Greater Bay Area (GBA) tech companies to the world, utilizing Hong Kong's unique strategic position to propel Asian innovation onto the global stage.
              </p>
              <p className="text-lg text-muted-foreground leading-relaxed mt-6 editorial-sans">
                As the region's premier innovation catalyst, we go beyond local boundaries to build a truly global tech network. We empower GBA-based tech innovators and enterprises by providing them with the network, strategic partnerships, and cross-border opportunities needed to scale their technologies internationally.
              </p>
            </ScrollReveal>
          </div>
        </div>
      </div>
    </section>

    <GradientDivider variant="warm" />

    {/* Vision */}
    <section className="py-24 border-b border-border/30">
      <div className="container mx-auto px-6">
        <div className="grid md:grid-cols-12 gap-8">
          <div className="md:col-span-4">
            <ScrollReveal>
              <p className="text-xs uppercase tracking-[0.3em] text-primary mb-3 editorial-sans">Our Vision</p>
              <h2 className="text-3xl md:text-4xl font-bold leading-tight">
                Where we're <span className="italic gradient-text">headed.</span>
              </h2>
            </ScrollReveal>
          </div>
          <div className="md:col-span-7 md:col-start-6">
            <ScrollReveal delay={200}>
              <div className="w-16 h-px bg-border mb-8" />
              <p className="text-lg text-muted-foreground leading-relaxed editorial-sans">
                To establish the Greater Bay Area as the world's most interconnected and influential technology hub, with Hong Kong functioning as the critical gateway that unites Asian technological excellence with global markets and investors.
              </p>
            </ScrollReveal>
          </div>
        </div>
      </div>
    </section>

    <GradientDivider variant="primary" />

    {/* Why Hong Kong */}
    <section className="py-24 border-b border-border/30">
      <div className="container mx-auto px-6">
        <div className="grid md:grid-cols-12 gap-8">
          <div className="md:col-span-4">
            <ScrollReveal>
              <div className="h-14 w-14 rounded-full border border-border/50 flex items-center justify-center mb-5">
                <MapPin className="h-6 w-6 text-primary" />
              </div>
              <p className="text-xs uppercase tracking-[0.3em] text-primary mb-3 editorial-sans">Strategic Advantage</p>
              <h2 className="text-3xl md:text-4xl font-bold leading-tight">
                Why <span className="italic gradient-text">Hong Kong?</span>
              </h2>
            </ScrollReveal>
          </div>
          <div className="md:col-span-7 md:col-start-6">
            <ScrollReveal delay={200}>
              <div className="w-16 h-px bg-border mb-8" />
              <p className="text-lg text-muted-foreground leading-relaxed editorial-sans">
                Hong Kong is more than just a local market; it is the "super connector" of Asia. By leveraging Hong Kong's world-class infrastructure, deep capital markets, and international business framework, we provide GBA tech companies with an unparalleled launchpad to showcase their innovations to the world.
              </p>
            </ScrollReveal>
          </div>
        </div>
      </div>
    </section>

    <GradientDivider variant="cool" />

    {/* Executive Committee */}
    <section className="py-24">
      <div className="container mx-auto px-6">
        <ScrollReveal>
          <p className="text-xs uppercase tracking-[0.3em] text-primary mb-3 editorial-sans">Leadership</p>
          <h2 className="text-3xl md:text-4xl font-bold mb-16">Executive <span className="italic gradient-text">Committee</span></h2>
        </ScrollReveal>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-border/30 rounded-lg overflow-hidden max-w-4xl">
          {committeeMembers.map((m, i) => (
            <ScrollReveal key={i} delay={i * 100}>
              <div className="bg-card/40 p-8 hover:bg-card/70 transition-colors duration-500 h-full">
                <div className="h-12 w-12 rounded-full bg-muted/50 flex items-center justify-center mb-5">
                  <User className="h-5 w-5 text-muted-foreground" />
                </div>
                <h3 className="font-semibold editorial-sans">{m.name}</h3>
                <p className="text-sm text-primary mt-1">{m.title}</p>
                {m.company && <p className="text-xs text-muted-foreground mt-2">{m.company}</p>}
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  </Layout>
);

export default About;
