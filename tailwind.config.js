/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/chrome/**/*.{js,ts,jsx,tsx}', './demo/chrome.html'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
