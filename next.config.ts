import type {NextConfig} from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {source: "/projects", destination: "/programs/asa", permanent: true},
      {source: "/history", destination: "/about", permanent: true},
      {source: "/members", destination: "/showcase", permanent: false},
      {source: "/members/:id", destination: "/showcase", permanent: false},
    ];
  },
};

export default withNextIntl(nextConfig);
