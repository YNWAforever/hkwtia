import { useState, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { members, featuredMembers, allCategories, generateInitials, colorFromName, type Member, type MemberCategory } from "@/data/members";
import { Search, ArrowRight, ChevronLeft, ChevronRight, Award, Building2, Rocket } from "lucide-react";
import heroImage from "@/assets/member-directory-hero.jpg";

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

// Featured Solutions Carousel
const SolutionsCarousel = () => {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (dir: "left" | "right") => {
    if (scrollRef.current) {
      const amount = 400;
      scrollRef.current.scrollBy({ left: dir === "left" ? -amount : amount, behavior: "smooth" });
    }
  };

  return (
    <div className="relative">
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-primary mb-2 editorial-sans">Success Stories</p>
          <h2 className="text-3xl md:text-4xl font-bold">Member <span className="italic gradient-text">Solutions</span></h2>
        </div>
        <div className="flex gap-2">
          <button onClick={() => scroll("left")} className="h-10 w-10 rounded-full border border-border/50 flex items-center justify-center hover:border-primary/50 hover:bg-primary/5 transition-all">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button onClick={() => scroll("right")} className="h-10 w-10 rounded-full border border-border/50 flex items-center justify-center hover:border-primary/50 hover:bg-primary/5 transition-all">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex gap-6 overflow-x-auto scrollbar-hide pb-4 snap-x snap-mandatory" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
        {featuredMembers.map((m) => (
          <div key={m.id} className="min-w-[350px] md:min-w-[420px] snap-start">
            <Card className="glass-card h-full hover:border-primary/30 transition-all duration-300 group overflow-hidden">
              {/* Gradient top bar */}
              <div className="h-1 bg-gradient-to-r from-primary via-secondary to-accent" />
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className={`h-10 w-10 rounded-lg flex items-center justify-center text-xs font-bold ${colorFromName(m.name)}`}>
                    {generateInitials(m.name)}
                  </div>
                  <div>
                    <h3 className="font-semibold editorial-sans">{m.name}</h3>
                    <Badge variant="outline" className={`text-[10px] ${tierColor[m.tier]}`}>{m.tier}</Badge>
                  </div>
                </div>
                <h4 className="text-lg font-semibold mb-2 group-hover:text-primary transition-colors">{m.solution}</h4>
                <p className="text-sm text-muted-foreground leading-relaxed mb-4">{m.description}</p>

                <div className="bg-muted/50 rounded-lg p-4 border border-border/30">
                  <p className="text-[10px] uppercase tracking-wider text-primary mb-1 font-medium editorial-sans">Case Study</p>
                  <p className="text-sm font-medium mb-1">{m.caseStudy.title}</p>
                  <p className="text-xs text-muted-foreground">Client: {m.caseStudy.client}</p>
                  <p className="text-xs text-primary font-medium mt-1">{m.caseStudy.result}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        ))}
      </div>
    </div>
  );
};

// Member Card
const MemberCard = ({ member, onClick }: { member: Member; onClick: () => void }) => {
  const TierIcon = tierIcon[member.tier];
  return (
    <button onClick={onClick} className="text-left w-full group">
      <Card className="glass-card h-full hover:border-primary/30 transition-all duration-300 overflow-hidden">
        <CardContent className="p-5">
          <div className="flex items-start justify-between mb-3">
            <div className={`h-11 w-11 rounded-lg flex items-center justify-center text-xs font-bold ${colorFromName(member.name)}`}>
              {generateInitials(member.name)}
            </div>
            <Badge variant="outline" className={`text-[10px] ${tierColor[member.tier]}`}>
              <TierIcon className="h-3 w-3 mr-1" />{member.tier}
            </Badge>
          </div>
          <h3 className="font-semibold mb-1 group-hover:text-primary transition-colors editorial-sans">{member.name}</h3>
          <p className="text-xs text-primary mb-2">{member.category}</p>
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">{member.description}</p>
          <div className="mt-3 pt-3 border-t border-border/30">
            <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wider">Solution</p>
            <p className="text-xs font-medium mt-0.5">{member.solution}</p>
          </div>
        </CardContent>
      </Card>
    </button>
  );
};

// Member Detail Modal
const MemberDetail = ({ member, open, onClose }: { member: Member | null; open: boolean; onClose: () => void }) => {
  if (!member) return null;
  const TierIcon = tierIcon[member.tier];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-4 mb-2">
            <div className={`h-14 w-14 rounded-xl flex items-center justify-center text-sm font-bold ${colorFromName(member.name)}`}>
              {generateInitials(member.name)}
            </div>
            <div>
              <DialogTitle className="text-2xl editorial-serif">{member.name}</DialogTitle>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className={`${tierColor[member.tier]}`}>
                  <TierIcon className="h-3 w-3 mr-1" />{member.tier} Member
                </Badge>
                <Badge variant="outline">{member.category}</Badge>
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          <div>
            <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2 editorial-sans">About</h4>
            <p className="text-muted-foreground leading-relaxed">{member.description}</p>
          </div>

          <div>
            <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2 editorial-sans">Solution</h4>
            <p className="text-lg font-semibold">{member.solution}</p>
          </div>

          <div className="bg-muted/50 rounded-xl p-6 border border-border/30">
            <h4 className="text-xs uppercase tracking-wider text-primary mb-3 font-medium editorial-sans">Featured Case Study</h4>
            <h5 className="text-lg font-semibold mb-2">{member.caseStudy.title}</h5>
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div>
                <p className="text-xs text-muted-foreground">Client</p>
                <p className="text-sm font-medium">{member.caseStudy.client}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Result</p>
                <p className="text-sm font-medium text-primary">{member.caseStudy.result}</p>
              </div>
            </div>
          </div>

          <Button asChild className="w-full rounded-full">
            <a href={member.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2">
              Visit Website <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const MemberDirectory = () => {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<MemberCategory | "All">("All");
  const [selectedTier, setSelectedTier] = useState<string>("All");
  const [showAll, setShowAll] = useState(false);

  const filteredMembers = useMemo(() => {
    return members.filter((m) => {
      const matchSearch = search === "" || m.name.toLowerCase().includes(search.toLowerCase()) || m.solution.toLowerCase().includes(search.toLowerCase()) || m.category.toLowerCase().includes(search.toLowerCase());
      const matchCategory = selectedCategory === "All" || m.category === selectedCategory;
      const matchTier = selectedTier === "All" || m.tier === selectedTier;
      return matchSearch && matchCategory && matchTier;
    });
  }, [search, selectedCategory, selectedTier]);

  const displayedMembers = showAll ? filteredMembers : filteredMembers.slice(0, 24);

  return (
    <Layout>
      {/* Hero with image */}
      <section className="relative h-[70vh] min-h-[500px] flex items-end overflow-hidden">
        <img src={heroImage} alt="WTIA Member Network" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
        <div className="container mx-auto px-6 relative z-10 pb-16">
          <p className="text-xs uppercase tracking-[0.3em] text-primary mb-4 editorial-sans animate-fade-in">Member Directory</p>
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold leading-[0.95] tracking-tight animate-fade-up">
            <span className="gradient-text italic">100+</span> companies<br />shaping Hong Kong's tech future.
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-xl leading-relaxed animate-fade-up animation-delay-200 editorial-sans">
            Explore solutions, case studies, and partnerships from WTIA's member network.
          </p>
        </div>
      </section>

      {/* Video Section */}
      <section className="py-24 border-b border-border/30">
        <div className="container mx-auto px-6">
          <div className="grid md:grid-cols-12 gap-8 items-center">
            <div className="md:col-span-5">
              <p className="text-xs uppercase tracking-[0.3em] text-primary mb-3 editorial-sans">Watch</p>
              <h2 className="text-3xl md:text-4xl font-bold leading-tight mb-4">
                See our members in <span className="italic gradient-text">action.</span>
              </h2>
              <p className="text-muted-foreground leading-relaxed editorial-sans mb-6">
                From AI-powered enterprise solutions to smart city infrastructure — discover how WTIA members are building the future of Hong Kong's technology landscape.
              </p>
              <Button asChild variant="ghost" className="rounded-full px-0 text-primary hover:bg-transparent">
                <a href="#directory" className="inline-flex items-center gap-2 text-sm uppercase tracking-wider">
                  Browse Directory <ArrowRight className="h-4 w-4" />
                </a>
              </Button>
            </div>
            <div className="md:col-span-7">
              <div className="relative aspect-video rounded-xl overflow-hidden bg-muted/50 border border-border/30 group cursor-pointer">
                <iframe
                  className="absolute inset-0 w-full h-full"
                  src="https://www.youtube.com/embed/dQw4w9WgXcQ?controls=1&rel=0"
                  title="WTIA Member Showcase"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
              <p className="text-xs text-muted-foreground mt-3 text-center">WTIA Member Network — Building the Future Together</p>
            </div>
          </div>
        </div>
      </section>

      {/* Solutions Carousel */}
      <section className="py-24 border-b border-border/30">
        <div className="container mx-auto px-6">
          <SolutionsCarousel />
        </div>
      </section>

      {/* Colorful divider */}
      <div className="relative h-1.5 w-full overflow-hidden">
        <div className="absolute inset-0" style={{ background: "linear-gradient(90deg, hsl(var(--primary)), hsl(var(--secondary)), hsl(var(--accent)), hsl(var(--coral)), hsl(var(--primary)))" }} />
      </div>

      {/* Directory */}
      <section id="directory" className="py-24">
        <div className="container mx-auto px-6">
          <div className="mb-12">
            <p className="text-xs uppercase tracking-[0.3em] text-primary mb-3 editorial-sans">Directory</p>
            <h2 className="text-3xl md:text-4xl font-bold mb-8">All <span className="italic gradient-text">Members</span></h2>

            {/* Filters */}
            <div className="space-y-4">
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search members, solutions, or categories..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10 rounded-full"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setSelectedTier("All")}
                  className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${selectedTier === "All" ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
                >
                  All Tiers
                </button>
                {["Enterprise", "Corporate", "Startup"].map((t) => (
                  <button
                    key={t}
                    onClick={() => setSelectedTier(t)}
                    className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${selectedTier === t ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setSelectedCategory("All")}
                  className={`px-3 py-1 rounded-full text-[11px] font-medium transition-all ${selectedCategory === "All" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
                >
                  All Categories
                </button>
                {allCategories.map((c) => (
                  <button
                    key={c}
                    onClick={() => setSelectedCategory(c)}
                    className={`px-3 py-1 rounded-full text-[11px] font-medium transition-all ${selectedCategory === c ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <p className="text-xs text-muted-foreground mt-4 editorial-sans">
              Showing {displayedMembers.length} of {filteredMembers.length} members
            </p>
          </div>

          {/* Grid */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {displayedMembers.map((m) => (
              <MemberCard key={m.id} member={m} />
            ))}
          </div>

          {!showAll && filteredMembers.length > 24 && (
            <div className="text-center mt-12">
              <Button onClick={() => setShowAll(true)} variant="outline" className="rounded-full px-10">
                Show All {filteredMembers.length} Members
              </Button>
            </div>
          )}

          {filteredMembers.length === 0 && (
            <div className="text-center py-20">
              <p className="text-muted-foreground editorial-sans">No members found matching your criteria.</p>
              <Button variant="ghost" onClick={() => { setSearch(""); setSelectedCategory("All"); setSelectedTier("All"); }} className="mt-4">
                Clear Filters
              </Button>
            </div>
          )}
        </div>
      </section>

      {/* Member Detail Modal */}
      <MemberDetail member={selectedMember} open={!!selectedMember} onClose={() => setSelectedMember(null)} />
    </Layout>
  );
};

export default MemberDirectory;
