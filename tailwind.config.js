/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        'playful': ['Poppins', 'sans-serif'],
      },
      colors: {
        // Brand color scheme - Greenish palette inspired by lattice colors
        // Primary: Emerald/Teal green for main actions and CTAs
        // Neutral: Slate for text, borders, and backgrounds
        // Status: Red for errors/danger
        brand: {
          primary: '#10b981', // emerald-500 - Primary actions, buttons, links
          'primary-hover': '#059669', // emerald-600 - Hover states
          'primary-light': '#34d399', // emerald-400 - Focus rings, accents
          'primary-dark': '#047857', // emerald-700 - Active states
        },
      },
    },
  },
  plugins: [],
};
