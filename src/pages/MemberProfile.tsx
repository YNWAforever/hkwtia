import { useParams, useNavigate, Link } from "react-router-dom";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { members, generateInitials, colorFromName } from "@/data/members";
import { ArrowLeft, ExternalLink, Award, Building2, Rocket, Mail, Phone, MapPin, Image as ImageIcon } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

const tierIcon = {
  Enterprise: Building2,
  Corporate: Award,
  Startup: Rocket,
};

const tierColor = {
  Enterprise: "bg-primary/10 text-primary border-primary/20",
  Corporate: "bg-secondary/10 text-secondary border-secondary/20",
  Startup: "bg-accent/10 text-accent border-accent/20",
};

// Generate deterministic gallery images per member
const getGalleryItems = (memberId: number, memberName: string) => {
  const captions = [
    `${memberName} team at WTIA Annual Summit`,
    `Product demo at InnoTech Expo 2025`,
    `${memberName} office in Hong Kong`,
    `Award ceremony — WTIA Innovation Awards`,
    `Client workshop and training session`,
    `${memberName} booth at RISE Conference`,
  ];
  const gradients = [
    "from-primary/20 to-secondary/20",
    "from-secondary/20 to-accent/20",
    "from-accent/20 to-primary/20",
    "from-primary/15 to-accent/15",
    "from-secondary/15 to-primary/15",
    "from-accent/15 to-secondary/15",
  ];
  return captions.map((caption, i) => ({
    id: i,
    caption,
    gradient: gradients[i],
  }));
};

const MemberProfile = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const member = members.find((m) => m.id === Number(id));

  const [contactForm, setContactForm] = useState({ name: "", email: "", company: "", message: "" });
  const [submitting, setSubmitting] = useState(false);

  if (!member) {
    return (
      <Layout>
        <section className="py-32 text-center">
          <h1 className="text-3xl font-bold mb-4">Member Not Found</h1>
          <p className="text-muted-foreground mb-6">The member you're looking for doesn't exist.</p>
          <Button onClick={() => navigate("/members")} variant="outline" className="rounded-full">
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to Directory
          </Button>
        </section>
      </Layout>
    );
  }

  const TierIcon = tierIcon[member.tier];
  const gallery = getGalleryItems(member.id, member.name);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactForm.name.trim() || !contactForm.email.trim() || !contactForm.message.trim()) {
      toast({ title: "Please fill in all required fields", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    setTimeout(() => {
      setSubmitting(false);
      setContactForm({ name: "", email: "", company: "", message: "" });
      toast({ title: "Message sent!", description: `Your inquiry has been sent to ${member.name}.` });
    }, 1000);
  };

  return (
    <Layout>
      {/* Back navigation */}
      <section className="border-b border-border/30">
        <div className="container mx-auto px-6 py-4">
          <Button asChild variant="ghost" size="sm" className="rounded-full text-muted-foreground hover:text-foreground">
            <Link to="/members" className="inline-flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" /> Back to Directory
            </Link>
          </Button>
        </div>
      </section>

      {/* Hero / Profile Header */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-6">
          <div className="grid md:grid-cols-12 gap-10 items-start">
            {/* Left — Identity */}
            <div className="md:col-span-7">
              <div className="flex items-center gap-5 mb-6">
                <div className={`h-20 w-20 rounded-2xl flex items-center justify-center text-2xl font-bold ${colorFromName(member.name)}`}>
                  {generateInitials(member.name)}
                </div>
                <div>
                  <h1 className="text-3xl md:text-4xl font-bold editorial-serif">{member.name}</h1>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="outline" className={tierColor[member.tier]}>
                      <TierIcon className="h-3 w-3 mr-1" />{member.tier} Member
                    </Badge>
                    <Badge variant="outline">{member.category}</Badge>
                  </div>
                </div>
              </div>
              <p className="text-lg text-muted-foreground leading-relaxed max-w-2xl">{member.description}</p>

              <div className="mt-8">
                <Button asChild className="rounded-full px-8">
                  <a href={member.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2">
                    Visit Website <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              </div>
            </div>

            {/* Right — Quick facts */}
            <div className="md:col-span-5">
              <Card className="glass-card">
                <CardContent className="p-6 space-y-5">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 editorial-sans">Solution</p>
                    <p className="text-lg font-semibold">{member.solution}</p>
                  </div>
                  <div className="h-px bg-border/40" />
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 editorial-sans">Tier</p>
                      <p className="text-sm font-medium">{member.tier}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 editorial-sans">Category</p>
                      <p className="text-sm font-medium">{member.category}</p>
                    </div>
                  </div>
                  <div className="h-px bg-border/40" />
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="h-4 w-4" /> Hong Kong
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Gradient Divider */}
      <div className="relative h-1 w-full overflow-hidden">
        <div className="absolute inset-0" style={{ background: "linear-gradient(90deg, hsl(var(--primary)), hsl(var(--secondary)), hsl(var(--accent)), hsl(var(--primary)))" }} />
      </div>

      {/* Case Study */}
      <section className="py-16 md:py-24 bg-muted/30">
        <div className="container mx-auto px-6">
          <p className="text-xs uppercase tracking-[0.3em] text-primary mb-3 editorial-sans">Featured Case Study</p>
          <div className="grid md:grid-cols-12 gap-10">
            <div className="md:col-span-8">
              <h2 className="text-2xl md:text-3xl font-bold mb-4">{member.caseStudy.title}</h2>
              <p className="text-muted-foreground leading-relaxed mb-6">
                {member.name} delivered a transformative solution for {member.caseStudy.client}, demonstrating the power of {member.category.toLowerCase()} innovation in driving measurable business outcomes across the region.
              </p>
              <div className="grid sm:grid-cols-2 gap-6">
                <Card className="glass-card">
                  <CardContent className="p-5">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 editorial-sans">Client</p>
                    <p className="text-lg font-semibold">{member.caseStudy.client}</p>
                  </CardContent>
                </Card>
                <Card className="glass-card border-primary/20">
                  <CardContent className="p-5">
                    <p className="text-[10px] uppercase tracking-wider text-primary mb-1 editorial-sans">Key Result</p>
                    <p className="text-lg font-semibold text-primary">{member.caseStudy.result}</p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Gallery */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-6">
          <p className="text-xs uppercase tracking-[0.3em] text-primary mb-2 editorial-sans">Gallery</p>
          <h2 className="text-2xl md:text-3xl font-bold mb-8">{member.name} <span className="italic gradient-text">in Action</span></h2>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {gallery.map((item) => (
              <div key={item.id} className="group relative aspect-[4/3] rounded-xl overflow-hidden border border-border/30 bg-muted/50">
                <div className={`absolute inset-0 bg-gradient-to-br ${item.gradient} flex items-center justify-center`}>
                  <ImageIcon className="h-8 w-8 text-muted-foreground/30" />
                </div>
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/90 to-transparent p-3 translate-y-full group-hover:translate-y-0 transition-transform duration-300">
                  <p className="text-xs font-medium">{item.caption}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Gradient Divider */}
      <div className="relative h-1 w-full overflow-hidden">
        <div className="absolute inset-0" style={{ background: "linear-gradient(90deg, hsl(var(--accent)), hsl(var(--secondary)), hsl(var(--primary)), hsl(var(--accent)))" }} />
      </div>

      {/* Contact Form */}
      <section className="py-16 md:py-24 bg-muted/30">
        <div className="container mx-auto px-6">
          <div className="grid md:grid-cols-12 gap-10">
            <div className="md:col-span-5">
              <p className="text-xs uppercase tracking-[0.3em] text-primary mb-2 editorial-sans">Get in Touch</p>
              <h2 className="text-2xl md:text-3xl font-bold mb-4">Contact <span className="italic gradient-text">{member.name}</span></h2>
              <p className="text-muted-foreground leading-relaxed mb-6 editorial-sans">
                Interested in {member.name}'s solutions? Send them a message to learn more about their work or discuss potential partnerships.
              </p>
              <div className="space-y-3 text-sm text-muted-foreground">
                <div className="flex items-center gap-3"><Mail className="h-4 w-4 text-primary" /> info@{member.name.toLowerCase().replace(/\s+/g, "")}.com</div>
                <div className="flex items-center gap-3"><Phone className="h-4 w-4 text-primary" /> +852 XXXX XXXX</div>
                <div className="flex items-center gap-3"><MapPin className="h-4 w-4 text-primary" /> Hong Kong</div>
              </div>
            </div>

            <div className="md:col-span-7">
              <Card className="glass-card">
                <CardContent className="p-6">
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Name *</label>
                        <Input
                          placeholder="Your name"
                          value={contactForm.name}
                          onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                          className="rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Email *</label>
                        <Input
                          type="email"
                          placeholder="your@email.com"
                          value={contactForm.email}
                          onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                          className="rounded-lg"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Company</label>
                      <Input
                        placeholder="Your company"
                        value={contactForm.company}
                        onChange={(e) => setContactForm({ ...contactForm, company: e.target.value })}
                        className="rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Message *</label>
                      <Textarea
                        placeholder={`Tell ${member.name} what you're looking for...`}
                        value={contactForm.message}
                        onChange={(e) => setContactForm({ ...contactForm, message: e.target.value })}
                        className="rounded-lg min-h-[120px]"
                      />
                    </div>
                    <Button type="submit" className="rounded-full w-full" disabled={submitting}>
                      {submitting ? "Sending..." : "Send Message"}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Related Members */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-6">
          <p className="text-xs uppercase tracking-[0.3em] text-primary mb-2 editorial-sans">Explore More</p>
          <h2 className="text-2xl md:text-3xl font-bold mb-8">Related <span className="italic gradient-text">Members</span></h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {members
              .filter((m) => m.category === member.category && m.id !== member.id)
              .slice(0, 4)
              .map((m) => {
                const Icon = tierIcon[m.tier];
                return (
                  <Link to={`/members/${m.id}`} key={m.id} className="group">
                    <Card className="glass-card h-full hover:border-primary/30 transition-all duration-300">
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between mb-3">
                          <div className={`h-10 w-10 rounded-lg flex items-center justify-center text-xs font-bold ${colorFromName(m.name)}`}>
                            {generateInitials(m.name)}
                          </div>
                          <Badge variant="outline" className={`text-[10px] ${tierColor[m.tier]}`}>
                            <Icon className="h-3 w-3 mr-1" />{m.tier}
                          </Badge>
                        </div>
                        <h3 className="font-semibold mb-1 group-hover:text-primary transition-colors editorial-sans">{m.name}</h3>
                        <p className="text-xs text-muted-foreground line-clamp-2">{m.description}</p>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
          </div>
        </div>
      </section>
    </Layout>
  );
};

export default MemberProfile;
