/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        base: "#0B0E11",
        surface: "#14181D",
        raised: "#1B2027",
        hairline: "#262C34",
        ink: "#E8EAED",
        muted: "#8A939F",
        signal: {
          DEFAULT: "#F2A93B",
          dim: "#8A661F",
        },
        active: "#4FAE8A",
        danger: "#E0654F",
      },
      fontFamily: {
        display: ["'Space Grotesk'", "sans-serif"],
        body: ["'Inter'", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
      },
    },
  },
  plugins: [],
};
