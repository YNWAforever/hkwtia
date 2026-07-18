# WTIA Platform

The WTIA public platform is a bilingual Next.js App Router site for the Hong Kong Wireless Technology Industry Association. M0 ships the server-rendered public route surface in English and Traditional Chinese (`/` and `/zh`); M1 adds self-service membership, Stripe billing, company seats, and an authenticated member portal.

## Requirements

- Node.js 20+ and npm
- A copy of `.env.example` saved as `.env.local` for local overrides (public M0 pages can run with only `NEXT_PUBLIC_SITE_URL`; M1 database/auth/billing flows require the corresponding server variables)

```sh
npm install
npm run dev
```

Open `http://localhost:3000/` or `http://localhost:3000/zh`.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Next.js development server |
| `npm test` | Run the Vitest unit suite |
| `npm run test:e2e` | Run Playwright browser tests |
| `npm run audit:strings` | Reject unapproved visible JSX literals |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run strict TypeScript checking |
| `npm run build` | Create the production build |
| `npm run test:lighthouse` | Run Lighthouse CI on `/` and `/membership` |
| `npm run db:migrate` | Apply Drizzle migrations from `drizzle/` using `DATABASE_URL` |
| `npm run db:seed` / `npm run db:seed:m1` | Idempotently seed the four code-owned M1 membership plans |

For a production-style local check:

```sh
npm run build
npm run start
```

Set `PLAYWRIGHT_BASE_URL` or `LHCI_BASE_URL` when browser or Lighthouse checks should target an already running Preview/production deployment. Never commit populated environment values.

## Deployment

The repository is configured for Vercel. Import the GitHub repository, set the variables listed in `.env.example` through the Vercel project settings, and deploy the branch. Preview deployments should use a safe public URL. Configure isolated Neon and Stripe test variables before exercising authenticated M1 flows; the build remains safe without runtime credentials.

Before promotion, run the repository gates:

```sh
npm run audit:strings
npm test
npm run lint
npm run typecheck
npm run build
npm run test:e2e
npm audit --omit=dev --audit-level=high
```

## Repository guidance

See [`AGENTS.md`](./AGENTS.md) for i18n, accessibility, server-component, test, commit, and secret-handling conventions.