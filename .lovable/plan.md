

## Plan: Rebrand Website Copy to "Innovate Hong Kong" — GBA & Global Focus

The user wants to update all website text to shift from a local HK/WTIA network positioning to a cross-border platform connecting HK, GBA, and Asia to the global tech ecosystem. This is a comprehensive copy update across all pages and components.

### Scope of Changes

**Files to modify (8 total):**

1. **`src/pages/Index.tsx`** — Homepage
   - Hero: Change subtitle to "Innovate Hong Kong", headline to emphasize bridging GBA to the world
   - Social proof line: reference GBA, Asia, and global partners
   - "Why WTIA" → "Why Innovate Hong Kong" with new pillar content (Connecting HK/GBA/Asia, Empowering GBA Tech, Facilitating Global Collaboration)
   - Messaging pillars: update to match the three key pillars from the brief
   - CTA: "Join Innovate Hong Kong" / new messaging about next-gen global platform
   - Button labels: "Join WTIA" → "Join Us" or "Join Innovate HK"

2. **`src/pages/About.tsx`** — About page
   - Hero headline & subtitle: use "About Innovate Hong Kong" narrative
   - Mission section: replace with the new mission statement and "About Innovate Hong Kong" paragraph
   - Add a "Our Vision" section with the provided vision text
   - Add a "Why Hong Kong?" section with the super-connector narrative
   - Keep Executive Committee section as-is (still WTIA leadership)

3. **`src/pages/Membership.tsx`** — Membership page
   - Update hero copy to reflect cross-border, GBA-to-global scaling
   - Update benefits descriptions to reference global partnerships, cross-border opportunities
   - Update "Who should join" to include GBA companies, international investors
   - Keep form structure unchanged

4. **`src/pages/History.tsx`** — 25th Anniversary
   - Light touch: update lead paragraph to reference the evolution toward GBA/global positioning
   - CTA at bottom: update to reference Innovate Hong Kong

5. **`src/pages/Projects.tsx`** — Projects page
   - Update hero subtitle to reference cross-border innovation
   - Update project descriptions to emphasize GBA/Asia/global reach

6. **`src/pages/Contact.tsx`** — Contact page
   - Update hero subtitle to reference global partnerships and cross-border enquiries

7. **`src/components/Navbar.tsx`** — Navigation
   - Update "Join WTIA" button → "Join Us"
   - Keep nav structure the same

8. **`src/components/Footer.tsx`** — Footer
   - Update brand description to the new Innovate Hong Kong positioning
   - Update tagline from "Stretching Possibilities with Wireless" to something aligned (e.g., "Bridging GBA Innovation to the World")
   - Update copyright line to include "Innovate Hong Kong" alongside WTIA

### Content Mapping (Key Pillars → Sections)

The three key pillars from the brief will map to the homepage "Why" section and messaging pillars:

| Pillar | Title | Summary |
|--------|-------|---------|
| 01 | Connect | Connecting HK, GBA & Asia — unified collaborative tech ecosystem |
| 02 | Empower | Empowering GBA Tech for the World — global visibility & cross-border scaling |
| 03 | Collaborate | Facilitating Global Collaboration — central nexus for investors, leaders & innovators |

### What Stays Unchanged
- Design system, layout, components, gradient dividers, animations
- Member directory data and member profile pages
- Form functionality and toast notifications
- Executive Committee data
- History timeline events (factual record)
- All image assets and routing

### Technical Notes
- Pure text/copy changes only — no structural or component changes needed
- All references to "WTIA" as a brand label will be kept where they refer to the organization entity (e.g., copyright, history), but the platform positioning shifts to "Innovate Hong Kong"
- The navbar logo (wtia-logo.png) stays as-is since it's an image asset

