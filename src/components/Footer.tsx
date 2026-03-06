import { Link } from "react-router-dom";

const Footer = () => (
  <footer className="border-t border-border bg-card/40 py-12">
    <div className="container mx-auto px-4">
      <div className="grid md:grid-cols-3 gap-8">
        <div>
          <span className="text-lg font-bold gradient-text">WTIA</span>
          <p className="mt-3 text-sm text-muted-foreground leading-relaxed max-w-xs">
            Hong Kong's industry association connecting enterprises, scaleups, and innovators to accelerate wireless, AI, and next‑gen connectivity adoption.
          </p>
        </div>
        <div>
          <h4 className="text-sm font-semibold mb-3 text-foreground">Quick Links</h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {[
              { label: "Home", to: "/" },
              { label: "Membership", to: "/membership" },
              { label: "Projects & Awards", to: "/projects" },
              { label: "About", to: "/about" },
              { label: "Contact", to: "/contact" },
            ].map((l) => (
              <li key={l.to}>
                <Link to={l.to} className="hover:text-primary transition-colors">{l.label}</Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="text-sm font-semibold mb-3 text-foreground">Connect</h4>
          <p className="text-sm text-muted-foreground">info@wtia.org.hk</p>
          <p className="text-sm text-muted-foreground mt-1">Hong Kong</p>
        </div>
      </div>
      <div className="mt-10 pt-6 border-t border-border text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} WTIA — Hong Kong Wireless Technology Industry Association. All rights reserved.
      </div>
    </div>
  </footer>
);

export default Footer;
