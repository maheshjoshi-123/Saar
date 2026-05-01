import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#172033",
        mist: "#f5f7fb",
        line: "#d9e2ef",
        teal: "#0d7a6b",
        saffron: "#bd7a13"
      }
    },
  },
  plugins: [],
};

export default config;

