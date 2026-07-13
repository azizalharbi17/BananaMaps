import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // /embed is iframe-able by partner origins (BananaScreener) + local dev.
        source: "/embed",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "frame-ancestors 'self' https://bananascreener.io https://*.bananascreener.io http://localhost:* http://127.0.0.1:*",
          },
        ],
      },
      {
        // Every other route refuses framing outright.
        source: "/((?!embed).*)",
        headers: [{ key: "X-Frame-Options", value: "DENY" }],
      },
    ];
  },
};

export default nextConfig;
