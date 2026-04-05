import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        cartoon: ['var(--font-fredoka)', 'system-ui', 'sans-serif'],
        hand: ['var(--font-hand)', 'cursive'],
      },
      colors: {
        parchment:      { DEFAULT: '#f5e6c8', dark: '#e8d4a8', light: '#faf3e6' },
        wood:           { DEFAULT: '#8b5e3c', dark: '#5c3a1e', light: '#a67c52' },
        ink:            { DEFAULT: '#2c1810', soft: '#5a4030', faded: '#8a7560' },
        'cart-green':   '#4a9e5c',
        'cart-blue':    '#4a7eb5',
        'cart-red':     '#c0503a',
        'cart-gold':    '#d4a030',
        'cart-purple':  '#7b5ea7',
        'cart-cyan':    '#3a9e9e',
        'cart-pink':    '#c06090',
      },
      boxShadow: {
        'cartoon': '0 4px 0 0 #5c3a1e, 0 6px 12px rgba(44, 24, 16, 0.3)',
        'cartoon-sm': '0 2px 0 0 #5c3a1e, 0 3px 6px rgba(44, 24, 16, 0.2)',
        'cartoon-hover': '0 2px 0 0 #5c3a1e, 0 3px 8px rgba(44, 24, 16, 0.25)',
      },
      borderRadius: {
        'cartoon': '16px',
      },
    },
  },
  plugins: [],
};
export default config;
