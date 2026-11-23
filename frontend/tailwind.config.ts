import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        background: "#070d12",
        surface: {
          DEFAULT: "#0b141b",
          card: "#0c161e",
          border: "#152532",
          code: "#050b10",
        },
        mint: {
          DEFAULT: "#54f2a3",
          hover: "#6ef5b4",
          active: "#0e261f",
          border: "#175c44",
          text: "#041c13",
        },
        primary: {
          DEFAULT: "#54f2a3",
          hover: "#42e896",
        },
        accent: {
          DEFAULT: "#2dd4bf",
          hover: "#14b8a6",
        },
      },
    },
  },
  plugins: [],
};
export default config;
