import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        exo: ['Exo', 'sans-serif'],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        // DeHub "brand blue" docs palette. These class names (text-royal-blue,
        // bg-sky-blue, from-middle-blue, text-jet-black, bg-plain-white …) are
        // used across the docs/blog + a few app components but were never
        // registered, so they silently no-op'd. Backed by CSS vars so they
        // resolve to real brand blues globally and to theme-appropriate ink/
        // paper/light tones inside .docs-root (see index.css docs token blocks).
        "royal-blue": "hsl(var(--docs-royal))",
        "middle-blue": "hsl(var(--docs-middle))",
        "sky-blue": "hsl(var(--docs-sky))",
        "jet-black": "hsl(var(--docs-ink))",
        "plain-white": "hsl(var(--docs-paper))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
        "close-button-glitch": {
          "0%": {
            transform: "translate(0)",
            opacity: "1",
          },
          "10%": {
            transform: "translate(-2px, 1px)",
            opacity: "0.8",
          },
          "20%": {
            transform: "translate(2px, -1px)",
            opacity: "1",
          },
          "30%": {
            transform: "translate(-1px, -1px)",
            opacity: "0.9",
          },
          "40%": {
            transform: "translate(1px, 2px)",
            opacity: "1",
          },
          "50%": {
            transform: "translate(-2px, 1px)",
            opacity: "0.85",
          },
          "60%": {
            transform: "translate(2px, 1px)",
            opacity: "1",
          },
          "70%": {
            transform: "translate(-1px, -2px)",
            opacity: "0.9",
          },
          "80%": {
            transform: "translate(1px, 1px)",
            opacity: "1",
          },
          "90%": {
            transform: "translate(-1px, 1px)",
            opacity: "0.95",
          },
          "100%": {
            transform: "translate(0)",
            opacity: "1",
          },
        },
        "lava-flow": {
          "0%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
          "100%": { backgroundPosition: "0% 50%" },
        },
        "float-up": {
          "0%": { transform: "translateY(0)", opacity: "1" },
          "100%": { transform: "translateY(-140px)", opacity: "0" },
        },
        "marquee": {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "close-button-glitch": "close-button-glitch 0.4s ease-in-out",
        "story-shimmer": "story-shimmer-rotate 4s linear infinite",
        "lava-flow": "lava-flow 4s ease infinite",
        "float-up": "float-up 2s ease-out forwards",
        "marquee": "marquee 4s linear infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
