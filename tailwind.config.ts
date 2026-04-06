import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        aura: {
          bg: "#F2EFEA",
          text: "#2C2824",
          accent: "#C48C56",
          muted: "rgba(44, 40, 36, 0.4)",
          light: "rgba(44, 40, 36, 0.1)",
          inverse: "#F2EFEA",
        },
      },
      fontFamily: {
        jakarta: ['"Plus Jakarta Sans"', "sans-serif"],
        geist: ['"Geist"', "sans-serif"],
        inter: ['"Inter"', "sans-serif"],
      },
      animation: {
        "slide-down": "slideDownLetter 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "fade-in": "fadeIn 0.5s ease-out forwards",
        "slide-up": "slideUp 0.4s ease-out forwards",
        beam: "beam 2s linear infinite",
        sonar: "sonar 2s cubic-bezier(0, 0, 0.2, 1) infinite",
        pulse_dot: "pulseDot 1.5s ease-in-out infinite",
      },
      keyframes: {
        slideDownLetter: {
          "0%": { transform: "translateY(-120%)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        fadeIn: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        beam: {
          "0%": { backgroundPosition: "0% 50%" },
          "100%": { backgroundPosition: "200% 50%" },
        },
        sonar: {
          "0%": { transform: "scale(1)", opacity: "0.8" },
          "100%": { transform: "scale(2.5)", opacity: "0" },
        },
        pulseDot: {
          "0%, 100%": { opacity: "0.4" },
          "50%": { opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
