/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: '#030712',
        gold: '#fbbf24',
        'gold-dark': '#f59e0b',
        glass: 'rgba(255, 255, 255, 0.05)',
      },
      fontFamily: {
        arabic: ['Tajawal', 'Segoe UI', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
