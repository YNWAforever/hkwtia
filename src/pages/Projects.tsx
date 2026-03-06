import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "react-router-dom";
import { Trophy, Users, ArrowRight } from "lucide-react";

const Projects = () => (
  <Layout>
    <section className="py-24 md:py-32">
      <div className="container mx-auto px-4 text-center">
        <h1 className="text-4xl md:text-6xl font-bold mb-6 animate-fade-up">
          Projects & <span className="gradient-text">Awards</span>
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto animate-fade-up animation-delay-200">
          WTIA initiatives are designed to move the ecosystem—by recognising excellence, surfacing real use cases, and connecting builders with decision makers.
        </p>
      </div>
    </section>

    {/* ASA Awards */}
    <section className="py-20 bg-muted/20">
      <div className="container mx-auto px-4">
        <Card className="glass-card glow-primary overflow-hidden">
          <CardContent className="p-8 md:p-12 flex flex-col md:flex-row gap-8 items-center">
            <div className="h-24 w-24 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
              <Trophy className="h-12 w-12 text-primary" />
            </div>
            <div className="flex-1">
              <h2 className="text-3xl font-bold mb-3">Asia Smart App Awards</h2>
              <p className="text-xl text-muted-foreground mb-2">Recognition that travels across Asia.</p>
              <p className="text-muted-foreground leading-relaxed mb-6">
                WTIA supports platforms like the Asia Smart App Awards to spotlight innovation and strengthen industry credibility across the region.
              </p>
              <Button asChild>
                <Link to="/contact" className="inline-flex items-center gap-2">
                  Learn more <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>

    {/* Tech to Connect */}
    <section className="py-20">
      <div className="container mx-auto px-4">
        <Card className="glass-card glow-accent overflow-hidden">
          <CardContent className="p-8 md:p-12 flex flex-col md:flex-row gap-8 items-center">
            <div className="h-24 w-24 rounded-2xl bg-accent/10 flex items-center justify-center shrink-0">
              <Users className="h-12 w-12 text-accent" />
            </div>
            <div className="flex-1">
              <h2 className="text-3xl font-bold mb-3">Tech to Connect</h2>
              <p className="text-xl text-muted-foreground mb-2">Less talk. More implementation.</p>
              <p className="text-muted-foreground leading-relaxed mb-6">
                Tech to Connect is an industry-oriented programme series built to connect people, ideas, and practical adoption conversations.
              </p>
              <Button asChild variant="outline" className="border-accent/30 hover:bg-accent/10 text-foreground">
                <Link to="/contact" className="inline-flex items-center gap-2">
                  See upcoming sessions <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  </Layout>
);

export default Projects;
