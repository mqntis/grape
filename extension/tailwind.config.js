/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        ink: '#f4f1fb',
        muted: '#a89fc0',
        surface: '#16121f',
        void: '#16121f',
        card: '#211a33',
        panel: '#211a33',
        raised: '#2a2140',
        accent: '#7c3aed',
        grape: '#7c3aed',
        'grape-bright': '#9d5cff',
        vineyard: '#5b2bb5',
        lime: '#c4f000',
        healthy: '#6ad19a',
        tight: '#f0c04a',
        overload: '#ff6b6b',
        gold: '#e8b84b',
      },
      fontFamily: {
        display: ['Space Grotesk', 'Bricolage Grotesque', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
}
