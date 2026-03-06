import Layout from "@/components/Layout";
import { User, Globe, MapPin, Wifi, Smartphone, GraduationCap, Link2, Shield, Brain } from "lucide-react";
import GradientDivider from "@/components/GradientDivider";
import ScrollReveal from "@/components/ScrollReveal";
import heroImage from "@/assets/wtia-event-2.jpg";

const committeeMembers = [
  { name: "Mr. Keith LI", title: "Chairman", company: "Co-Founder and CEO, Innopage Limited" },
  { name: "Mr. Donald CHAN", title: "Vice-Chairman", company: "Co-founder and Senior Advisor, Cherrypicks Limited" },
  { name: "Dr. Lawrence CHEUNG", title: "Vice-Chairman", company: "Chief Innovation Officer, HKPC" },
  { name: "Committee Member", title: "Secretary", company: "" },
  { name: "Committee Member", title: "Treasurer", company: "" },
  { name: "Committee Member", title: "Member", company: "" },
];

const coreFocusGroups = [
  { icon: Wifi, title: "StartUp", areas: ["Emerging Technologies", "Innovation", "Startups"] },
  { icon: Smartphone, title: "m-Commerce & FinTech", areas: ["Mobile Commerce", "Mobile Payments", "Cloud Technologies"] },
  { icon: GraduationCap, title: "EduTech", areas: ["Education", "Apprenticeship", "Training & Career Development"] },
  { icon: Link2, title: "Blockchain & Metaverse", areas: ["DApps", "NFTs", "Metaverse", "DeFi", "GameFi"] },
  { icon: Brain, title: "5G & IoT", areas: ["5G Technologies", "Internet of Things", "Robotics & AI", "Smart City"] },
  { icon: Shield, title: "Information Security", areas: ["Antivirus", "Anti-phishing", "Advanced Protection & Privacy"] },
];

const About = () => (
  <Layout>
    {/* Hero with image */}
    <section className="relative h-[70vh] min-h-[500px] flex items-end overflow-hidden">
      <img src={heroImage} alt="About WTIA - Hong Kong Wireless Technology Industry Association" className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
      <div className="container mx-auto px-6 relative z-10 pb-16">
        <p className="text-xs uppercase tracking-[0.3em] text-primary mb-4 editorial-sans animate-fade-in">About WTIA</p>
        <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold leading-[0.95] tracking-tight animate-fade-up">
          Dedicated to the innovative and emerging technologies <span className="italic gradient-text">industry.</span>
        </h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-xl leading-relaxed animate-fade-up animation-delay-200 editorial-sans">
          A not-for-profit trade association and community for professionals, shaping Hong Kong into a top-class innovation and technology smart hub since 2001.
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
              <p className="text-xs uppercase tracking-[0.3em] text-primary mb-3 editorial-sans">Who We Are</p>
              <h2 className="text-3xl md:text-4xl font-bold leading-tight">
                What we <span className="italic gradient-text">do.</span>
              </h2>
            </ScrollReveal>
          </div>
          <div className="md:col-span-7 md:col-start-6">
            <ScrollReveal delay={200}>
              <div className="w-16 h-px bg-border mb-8" />
              <p className="text-lg text-muted-foreground leading-relaxed editorial-sans">
                Hong Kong Wireless Technology Industry Association (WTIA), established in 2001, is a not-for-profit trade association and community for professionals, dedicated to the innovative and emerging technologies industry.
              </p>
              <p className="text-lg text-muted-foreground leading-relaxed mt-6 editorial-sans">
                The Association acts as a platform, an aggregator, and a community for industry professionals to advance and facilitate the development of wireless, mobile, and emerging innovative technologies. We aim to enable technological breakthroughs and accelerate the applications of state-of-the-art technologies in various industries.
              </p>
              <p className="text-lg text-muted-foreground leading-relaxed mt-6 editorial-sans">
                Together, we are dedicated to shaping Hong Kong into a top-class innovation and technology smart hub. Throughout all these years, WTIA is glad and honored to have support from all corners of the wireless industry.
              </p>
            </ScrollReveal>
          </div>
        </div>
      </div>
    </section>

    <GradientDivider variant="warm" />

    {/* What We Do */}
    <section className="py-24 border-b border-border/30">
      <div className="container mx-auto px-6">
        <ScrollReveal>
          <p className="text-xs uppercase tracking-[0.3em] text-primary mb-3 editorial-sans">Our Pillars</p>
          <h2 className="text-3xl md:text-4xl font-bold mb-16">What we <span className="italic gradient-text">stand for.</span></h2>
        </ScrollReveal>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-border/30 rounded-lg overflow-hidden">
          {[
            { title: "Widen Possibilities with Wireless", desc: "We are dedicated to the wireless and mobile industry, bringing leaders and members together to create limitless possibilities by pushing adoption, standards, and boosting inter-operability." },
            { title: "Transform Lives with Technology", desc: "We act as a platform, an aggregator, and community for industry professionals to learn and drive emerging wireless technologies and standards." },
            { title: "Increase Exposure and Branding", desc: "We represent and are supported by digital industries pertaining to mobile such as digital entertainment, digital marketing, and start-up sectors." },
            { title: "Attract Like-Minded Professionals", desc: "We facilitate networking and strive to help members apply latest wireless technologies to existing or new businesses." },
          ].map((item, i) => (
            <ScrollReveal key={i} delay={i * 100}>
              <div className="bg-card/40 p-8 hover:bg-card/70 transition-colors duration-500 h-full">
                <h3 className="font-semibold text-lg mb-3 editorial-sans">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>

    <GradientDivider variant="primary" />

    {/* Core Focus Groups */}
    <section className="py-24 border-b border-border/30">
      <div className="container mx-auto px-6">
        <ScrollReveal>
          <p className="text-xs uppercase tracking-[0.3em] text-primary mb-3 editorial-sans">Core Focus Groups</p>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Our 6 <span className="italic gradient-text">CFGs</span></h2>
          <p className="text-muted-foreground mb-16 max-w-2xl editorial-sans">
            Wireless technology covers many aspects of our lives. We have dedicated committees leading and driving each of our six Core Focus Groups.
          </p>
        </ScrollReveal>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-border/30 rounded-lg overflow-hidden">
          {coreFocusGroups.map((cfg, i) => (
            <ScrollReveal key={i} delay={i * 100}>
              <div className="bg-card/40 p-8 hover:bg-card/70 transition-colors duration-500 h-full">
                <cfg.icon className="h-5 w-5 text-primary mb-5" />
                <h3 className="font-semibold text-lg mb-3 editorial-sans">{cfg.title}</h3>
                <ul className="space-y-1">
                  {cfg.areas.map((area) => (
                    <li key={area} className="text-sm text-muted-foreground">• {area}</li>
                  ))}
                </ul>
              </div>
            </ScrollReveal>
          ))}
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
