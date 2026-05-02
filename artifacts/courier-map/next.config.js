const basePath = process.env.BASE_PATH && process.env.BASE_PATH !== "/" ? process.env.BASE_PATH : "";
const isDev = process.env.NODE_ENV === "development";

const replitDevDomain = process.env.REPLIT_DEV_DOMAIN ?? "";

const allowedOrigins = [
  "*.replit.dev",
  "*.riker.replit.dev",
  "*.picard.replit.dev",
  "*.sisko.replit.dev",
  "*.kirk.replit.dev",
  ...(replitDevDomain ? [replitDevDomain] : []),
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(isDev ? {} : { output: "export" }),
  trailingSlash: false,
  images: { unoptimized: true },
  basePath,
  assetPrefix: basePath || undefined,
  reactStrictMode: false,
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
  allowedDevOrigins: allowedOrigins,
  ...(isDev && {
    async rewrites() {
      const apiUrl = process.env.API_URL ?? "http://127.0.0.1:8080";
      return [
        {
          source: "/api/:path*",
          destination: `${apiUrl}/api/:path*`,
        },
      ];
    },
    async headers() {
      return [
        {
          source: "/:path*",
          headers: [
            { key: "Cache-Control", value: "no-store, no-cache, must-revalidate, proxy-revalidate" },
            { key: "Pragma", value: "no-cache" },
            { key: "Expires", value: "0" },
          ],
        },
      ];
    },
  }),
};

export default nextConfig;
