import Layout from "@/components/Layout";
import { User } from "lucide-react";
import GradientDivider from "@/components/GradientDivider";

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
    <section className="py-32 md:py-40">
      <div className="container mx-auto px-6 max-w-4xl">
        <p className="text-xs uppercase tracking-[0.3em] text-primary mb-6 editorial-sans animate-fade-in">About WTIA</p>
        <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold leading-[0.95] tracking-tight animate-fade-up">
          Stretching possibilities with <span className="italic gradient-text">wireless.</span>
        </h1>
        <p className="mt-8 text-lg text-muted-foreground max-w-xl leading-relaxed animate-fade-up animation-delay-200 editorial-sans">
          Established in 2001, WTIA is a not-for-profit trade association and community for professionals, dedicated to the innovative and emerging technologies industry.
        </p>
      </div>
    </section>

    {/* Mission */}
    <section className="py-24 border-y border-border/30">
      <div className="container mx-auto px-6">
        <div className="grid md:grid-cols-12 gap-8">
          <div className="md:col-span-4">
            <p className="text-xs uppercase tracking-[0.3em] text-primary mb-3 editorial-sans">Our Mission</p>
            <h2 className="text-3xl md:text-4xl font-bold leading-tight">
              Why we <span className="italic gradient-text">exist.</span>
            </h2>
          </div>
          <div className="md:col-span-7 md:col-start-6">
            <div className="w-16 h-px bg-border mb-8" />
            <p className="text-lg text-muted-foreground leading-relaxed editorial-sans">
              Turn emerging tech into real business outcomes—through executive networking, credible industry platforms, and high-signal programmes that connect members to partners, talent, and opportunities.
            </p>
            <p className="text-lg text-muted-foreground leading-relaxed mt-6 editorial-sans">
              The Association acts as a platform, an aggregator, and a community for industry professionals to advance and facilitate the development of wireless, mobile, and emerging innovative technologies.
            </p>
          </div>
        </div>
      </div>
    </section>

    {/* Executive Committee */}
    <section className="py-24">
      <div className="container mx-auto px-6">
        <p className="text-xs uppercase tracking-[0.3em] text-primary mb-3 editorial-sans">Leadership</p>
        <h2 className="text-3xl md:text-4xl font-bold mb-16">Executive <span className="italic gradient-text">Committee</span></h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-border/30 rounded-lg overflow-hidden max-w-4xl">
          {committeeMembers.map((m, i) => (
            <div key={i} className="bg-card/40 p-8 hover:bg-card/70 transition-colors duration-500">
              <div className="h-12 w-12 rounded-full bg-muted/50 flex items-center justify-center mb-5">
                <User className="h-5 w-5 text-muted-foreground" />
              </div>
              <h3 className="font-semibold editorial-sans">{m.name}</h3>
              <p className="text-sm text-primary mt-1">{m.title}</p>
              {m.company && <p className="text-xs text-muted-foreground mt-2">{m.company}</p>}
            </div>
          ))}
        </div>
      </div>
    </section>
  </Layout>
);

export default About;
