import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        db: {
          bg:      "#020203",
          bg1:     "#0f0f12",
          bg2:     "#1a1a1f",
          bg3:     "#26262d",
          purple:  "#bf5af2",
          purple2: "#9b43cc",
          green:   "#30d158",
          red:     "#ff453a",
          orange:  "#ff9f0a",
          blue:    "#0a84ff",
          text:    "#ffffff",
          muted:   "rgba(255,255,255,0.55)",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        glass: "0 8px 32px rgba(0,0,0,0.5)",
        purple: "0 0 24px rgba(191,90,242,0.25)",
      },
      backdropBlur: {
        glass: "20px",
      },
      borderRadius: {
        sm: "6px",
        md: "10px",
        lg: "14px",
        xl: "20px",
      },
      transitionTimingFunction: {
        spring: "cubic-bezier(0.16,1,0.3,1)",
      },
    },
  },
  plugins: [],
} satisfies Config;
