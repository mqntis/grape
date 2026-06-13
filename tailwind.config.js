/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        ink: '#1f2d2b',
        surface: '#eef3f0',
        card: '#ffffff',
        accent: '#2f7d6e',
        healthy: '#6aa37f',
        tight: '#d9a441',
        overload: '#c9706a',
        gold: '#b8923a',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
}
