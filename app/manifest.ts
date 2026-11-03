import type {MetadataRoute} from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Hong Kong Wireless Technology Industry Association",
    short_name: "WTIA",
    start_url: "/",
    display: "browser",
    background_color: "#FFFFFF",
    theme_color: "#0F4C81",
    icons: [
      {src: "/favicon.svg", type: "image/svg+xml", sizes: "any"},
      {src: "/favicon-32x32.png", type: "image/png", sizes: "32x32"},
      {src: "/apple-touch-icon.png", type: "image/png", sizes: "180x180"},
      {src: "/android-chrome-512x512.png", type: "image/png", sizes: "512x512"},
    ],
  };
}
