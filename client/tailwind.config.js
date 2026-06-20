/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        coral: 'var(--coral)',
        ocean: 'var(--ocean)',
        bg: 'var(--bg)',
        ink: 'var(--ink)',
        pink: 'var(--pink)',
        gold: 'var(--gold)',
        ember: 'var(--ember)',
      },
      borderRadius: {
        card: 'var(--radius)',
      },
      fontFamily: {
        display: ['var(--font-display)', 'sans-serif'],
        body: ['var(--font-body)', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
    },
  },
  plugins: [],
};
