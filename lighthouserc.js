const baseUrl = process.env.LHCI_BASE_URL ?? process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';

const config = {
  ci: {
    collect: {
      url: [`${baseUrl}/`, `${baseUrl}/zh`, `${baseUrl}/membership`, `${baseUrl}/zh/membership`],
      numberOfRuns: 1,
      startServerCommand: 'npm.cmd run start',
      startServerReadyPattern: 'Ready in',
      startServerReadyTimeout: 120_000,
      settings: {
        chromeFlags: '--no-sandbox --disable-gpu --disable-dev-shm-usage'
      }
    },
    assert: {
      assertions: {
        'categories:performance': ['error', {minScore: 0.9}],
        'categories:accessibility': ['error', {minScore: 0.95}],
        'categories:seo': ['error', {minScore: 0.95}]
      }
    },
    upload: {target: 'temporary-public-storage'}
  }
};

export const ci = config.ci;
export default config;