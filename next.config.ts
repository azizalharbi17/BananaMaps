import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // BananaMaps Embed (/embed) may be framed from any origin at the header
        // level. The partner check moved into the page itself: the embed reads
        // the host site's origin on mount and only renders the map for our own
        // properties (bananamaps.io, bananascreener.io, local dev) or for an
        // active partner id (?pid=) whose domain list matches. Unknown hosts get
        // a "get a free Embed key" panel instead of a browser-level block, which
        // a header allow-list could never explain to the visitor.
        source: "/embed",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors *",
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
