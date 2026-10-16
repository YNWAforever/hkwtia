import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      screens: {
        // Donor breakpoints are max-width (design-fidelity spec §4.2), so the utilities
        // read "at or below", matching the media queries in app/styles/wisetech.css.
        "wt-xl": {max: "1320px"},
        "wt-lg": {max: "1120px"},
        "wt-md": {max: "820px"},
        "wt-sm": {max: "520px"},
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        serif: ["var(--font-serif)"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        coral: "hsl(var(--coral))",
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        shell: {
          canvas: "hsl(var(--shell-canvas))",
          raised: "hsl(var(--shell-raised))",
          warm: "hsl(var(--shell-warm))",
          ink: "hsl(var(--shell-ink))",
          muted: "hsl(var(--shell-muted))",
          navy: "hsl(var(--shell-navy))",
          blue: "hsl(var(--shell-blue))",
          accent: "hsl(var(--shell-accent))",
          border: "hsl(var(--shell-border))",
        },
        // Bare var() references keep the donor hexes verbatim, so Tailwind cannot apply
        // an opacity modifier to them (bg-wt-ink/50 drops the /50 silently). Use the
        // --shell-* HSL triplets when alpha is needed (design-fidelity errata E-12).
        wt: {
          ink: "var(--wt-ink)",
          inkSoft: "var(--wt-ink-soft)",
          paper: "var(--wt-paper)",
          paperBright: "var(--wt-paper-bright)",
          stone: "var(--wt-stone)",
          steel: "var(--wt-steel)",
          cyan: "var(--wt-cyan)",
          jade: "var(--wt-jade)",
          amber: "var(--wt-amber)",
          blue: "var(--wt-blue)",
          violet: "var(--wt-violet)",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        "shell-sm": "var(--shell-radius-sm)",
        "shell-lg": "var(--shell-radius-lg)",
      },
      maxWidth: {shell: "var(--shell-content)"},
      boxShadow: {
        "shell-sm": "var(--shell-shadow-sm)",
        "shell-lg": "var(--shell-shadow-lg)",
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
