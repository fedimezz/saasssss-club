import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Owner-uploaded photos (page content editor, gallery, avatars, etc.)
      { protocol: "https", hostname: "res.cloudinary.com" },
      // Placeholder/stock photos used as defaults in the content schema
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
  // Baseline security headers. The app already sets its own auth cookie
  // flags (httpOnly/secure/sameSite) in lib/auth.ts — these cover the
  // browser-level protections that aren't per-route.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Prevent the site from being framed by other origins (clickjacking),
          // while still allowing same-origin framing for the admin page-preview iframe.
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          // Stop browsers from MIME-sniffing responses away from their
          // declared Content-Type.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Don't leak the full referrer URL to third-party origins.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Force HTTPS for a year once a browser has seen it once.
          // Harmless in local dev (only enforced by browsers over https).
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          // Disable powerful browser features this app doesn't use.
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          // Content-Security-Policy: locks down where scripts/styles/images/
          // frames/connections can come from. 'unsafe-inline' on script-src
          // is required by the two small inline theme/language init scripts
          // in app/layout.tsx (they run before hydration to avoid a
          // flash-of-wrong-theme); everything else is scoped to same-origin
          // plus the two known third-party asset hosts already allow-listed
          // in images.remotePatterns above. frame-ancestors 'self' backs up
          // X-Frame-Options for browsers that only honor CSP.
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // React requires eval() in dev mode for callstack reconstruction.
              // 'unsafe-eval' is stripped in production to stay strict.
              `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https://res.cloudinary.com https://images.unsplash.com",
              "font-src 'self' data:",
              // blob: needed for Three.js GLB embedded texture extraction (creates blob URLs internally)
              // data: needed for Three.js data URIs
              "connect-src 'self' blob: data:",
              // Three.js can spawn Web Workers from blob: URLs for geometry processing
              "worker-src 'self' blob:",
              "media-src 'self' https://res.cloudinary.com",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;