import Layout from "@/components/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { User } from "lucide-react";

const committeeMembers = [
  { name: "Committee Member", title: "Chairperson" },
  { name: "Committee Member", title: "Vice-Chairperson" },
  { name: "Committee Member", title: "Secretary" },
  { name: "Committee Member", title: "Treasurer" },
  { name: "Committee Member", title: "Member" },
  { name: "Committee Member", title: "Member" },
];

const About = () => (
  <Layout>
    <section className="py-24 md:py-32">
      <div className="container mx-auto px-4 text-center">
        <h1 className="text-4xl md:text-6xl font-bold mb-6 animate-fade-up">
          About <span className="gradient-text">WTIA</span>
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto animate-fade-up animation-delay-200">
          WTIA is Hong Kong's industry association connecting enterprises, scaleups, and innovators to accelerate wireless, AI, and next‑gen connectivity adoption.
        </p>
      </div>
    </section>

    <section className="py-20 bg-muted/20">
      <div className="container mx-auto px-4 max-w-3xl">
        <h2 className="text-3xl font-bold text-center mb-8">Our <span className="gradient-text">Mission</span></h2>
        <p className="text-muted-foreground leading-relaxed text-center text-lg">
          Turn emerging tech into real business outcomes—through executive networking, credible industry platforms, and high-signal programmes that connect members to partners, talent, and opportunities.
        </p>
      </div>
    </section>

    <section className="py-20">
      <div className="container mx-auto px-4">
        <h2 className="text-3xl font-bold text-center mb-12">Executive <span className="gradient-text">Committee</span></h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {committeeMembers.map((m, i) => (
            <Card key={i} className="glass-card text-center">
              <CardContent className="p-6">
                <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                  <User className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="font-semibold">{m.name}</h3>
                <p className="text-sm text-muted-foreground">{m.title}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  </Layout>
);

export default About;
