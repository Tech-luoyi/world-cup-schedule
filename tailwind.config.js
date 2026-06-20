/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cyber: {
          black: '#0A0A0A',
          dark: '#1A1A1A',
          green: '#00FF41',
          pink: '#FF0055',
          blue: '#00D4FF',
          yellow: '#FFD700',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'pulse-border': 'pulse-border 2s ease-in-out infinite',
        'glow': 'glow 1.5s ease-in-out infinite alternate',
        'slide-up': 'slide-up 0.5s ease-out',
      },
      keyframes: {
        'pulse-border': {
          '0%, 100%': { boxShadow: '0 0 5px #00FF41, 0 0 10px #00FF41' },
          '50%': { boxShadow: '0 0 15px #00FF41, 0 0 30px #00FF41' },
        },
        'glow': {
          '0%': { textShadow: '0 0 5px #00FF41, 0 0 10px #00FF41' },
          '100%': { textShadow: '0 0 20px #00FF41, 0 0 40px #00FF41, 0 0 60px #00FF41' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
