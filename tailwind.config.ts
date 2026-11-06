import type { Config } from "tailwindcss";

// Colours come from CSS variables in globals.css (light + dark), matching the prototype.
const v = (name: string) => `var(--${name})`;

export default {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: "media",
  theme: {
    extend: {
      colors: {
        bg: v("bg"),
        surface: v("surface"),
        sunk: v("sunk"),
        line: v("line"),
        fg: v("fg"),
        muted: v("muted"),
        accent: { DEFAULT: v("accent"), ink: v("accent-ink"), soft: v("accent-soft") },
        signal: { DEFAULT: v("signal"), soft: v("signal-soft") },
        good: { DEFAULT: v("good"), soft: v("good-soft") },
        warn: { DEFAULT: v("warn"), soft: v("warn-soft") },
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', '"Avenir Next"', '"Segoe UI"', "sans-serif"],
        sans: ['"Instrument Sans"', '"Segoe UI"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "Menlo", "monospace"],
      },
      borderRadius: { card: "10px" },
    },
  },
  plugins: [],
} satisfies Config;
