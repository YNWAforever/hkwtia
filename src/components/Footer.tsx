import { Link } from "react-router-dom";

const Footer = () => (
  <footer className="border-t border-border/50 py-16">
    <div className="container mx-auto px-6">
      <div className="grid md:grid-cols-4 gap-10">
        <div className="md:col-span-2">
          <span className="text-2xl font-bold editorial-serif gradient-text">WTIA</span>
          <p className="mt-4 text-sm text-muted-foreground leading-relaxed max-w-md">
            Hong Kong's industry association connecting enterprises, scaleups, and innovators to accelerate wireless, AI, and next‑gen connectivity adoption.
          </p>
          <p className="mt-4 text-xs text-muted-foreground/60">
            Unit 403, IT Street, Cyberport 3 (Core A), 100 Cyberport Road, Hong Kong
          </p>
        </div>
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-[0.15em] mb-4 text-foreground editorial-sans">Navigate</h4>
          <ul className="space-y-3 text-sm text-muted-foreground">
            {[
              { label: "Home", to: "/" },
              { label: "Membership", to: "/membership" },
              { label: "Projects & Awards", to: "/projects" },
              { label: "About", to: "/about" },
              { label: "Contact", to: "/contact" },
            ].map((l) => (
              <li key={l.to}>
                <Link to={l.to} className="hover:text-foreground transition-colors">{l.label}</Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-[0.15em] mb-4 text-foreground editorial-sans">Connect</h4>
          <p className="text-sm text-muted-foreground">contact@hkwtia.org</p>
          <p className="text-sm text-muted-foreground mt-1">+852 2370 3130</p>
          <p className="text-sm text-muted-foreground mt-3">hkwtia.org</p>
        </div>
      </div>
      <div className="mt-12 pt-8 border-t border-border/30 flex flex-col sm:flex-row justify-between items-center gap-4">
        <p className="text-xs text-muted-foreground/50">
          © {new Date().getFullYear()} WTIA — Hong Kong Wireless Technology Industry Association. All rights reserved.
        </p>
        <p className="text-xs text-muted-foreground/40">
          Stretching Possibilities with Wireless
        </p>
      </div>
    </div>
  </footer>
);

export default Footer;
