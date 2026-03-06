import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Mail, MapPin, Phone } from "lucide-react";

const Contact = () => {
  const { toast } = useToast();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    toast({ title: "Message sent!", description: "We'll get back to you shortly." });
    (e.target as HTMLFormElement).reset();
  };

  return (
    <Layout>
      <section className="py-32 md:py-40">
        <div className="container mx-auto px-6 max-w-4xl">
          <p className="text-xs uppercase tracking-[0.3em] text-primary mb-6 editorial-sans animate-fade-in">Contact</p>
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold leading-[0.95] tracking-tight animate-fade-up">
            Talk to <span className="italic gradient-text">us.</span>
          </h1>
          <p className="mt-8 text-lg text-muted-foreground max-w-xl leading-relaxed animate-fade-up animation-delay-200 editorial-sans">
            Partnership, sponsorship, or membership enquiries—we'd love to hear from you.
          </p>
        </div>
      </section>

      <section className="pb-32">
        <div className="container mx-auto px-6 max-w-4xl">
          <div className="grid md:grid-cols-12 gap-12">
            <div className="md:col-span-7">
              <Card className="glass-card">
                <CardContent className="p-8">
                  <form onSubmit={handleSubmit} className="space-y-5">
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="name" className="text-xs uppercase tracking-wider">Name</Label>
                        <Input id="name" placeholder="Your name" required className="rounded-lg" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="email" className="text-xs uppercase tracking-wider">Email</Label>
                        <Input id="email" type="email" placeholder="Work email" required className="rounded-lg" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="company" className="text-xs uppercase tracking-wider">Company</Label>
                      <Input id="company" placeholder="Company name" className="rounded-lg" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="subject" className="text-xs uppercase tracking-wider">Subject</Label>
                      <Input id="subject" placeholder="How can we help?" required className="rounded-lg" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="message" className="text-xs uppercase tracking-wider">Message</Label>
                      <Textarea id="message" placeholder="Tell us more..." rows={5} required className="rounded-lg" />
                    </div>
                    <Button type="submit" className="w-full rounded-full" size="lg">Send Message</Button>
                  </form>
                </CardContent>
              </Card>
            </div>
            <div className="md:col-span-4 md:col-start-9 space-y-8 pt-4">
              {[
                { icon: Mail, label: "Email", value: "contact@hkwtia.org" },
                { icon: Phone, label: "Phone", value: "+852 2370 3130" },
                { icon: MapPin, label: "Location", value: "Unit 403, IT Street, Cyberport 3, 100 Cyberport Road, Hong Kong" },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-4 group">
                  <div className="h-10 w-10 rounded-full border border-border/50 flex items-center justify-center shrink-0 group-hover:border-primary/50 transition-colors">
                    <item.icon className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                  <div>
                    <h3 className="text-xs uppercase tracking-wider font-medium mb-1 editorial-sans">{item.label}</h3>
                    <p className="text-sm text-muted-foreground">{item.value}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </Layout>
  );
};

export default Contact;
