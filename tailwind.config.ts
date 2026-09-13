import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          900: "#101219",
          800: "#161926",
          700: "#1D2130",
          600: "#262B3D",
          500: "#333A50",
        },
        haze: {
          100: "#E7E9F2",
          300: "#AEB4C8",
          500: "#7E869E",
        },
        beam: "#7C9CFF",
        ember: "#F2B66D",
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
