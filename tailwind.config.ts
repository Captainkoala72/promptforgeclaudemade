import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          900: "#111215",
          850: "#17181C",
          800: "#1E2025",
          700: "#26282D",
          600: "#303238",
          500: "#45474D",
        },
        haze: {
          100: "#F3F0EB",
          300: "#D5D1CB",
          500: "#A8ABB2",
        },
        beam: "#FF6A1A",
        ember: "#FF8A3D",
        glow: "#C43B16",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      keyframes: {
        pulseDot: {
          "0%, 100%": { opacity: "0.25" },
          "50%": { opacity: "1" },
        },
      },
      animation: {
        pulseDot: "pulseDot 1.1s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
