import type { MetadataRoute } from "next";

// PWA manifest — gives shortcuts / "Add to Home Screen" a proper app icon.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Kadex POS",
    short_name: "Kadex POS",
    description: "Boutique point of sale",
    start_url: "/pos",
    display: "standalone",
    background_color: "#f5f7fa",
    theme_color: "#2563eb",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
