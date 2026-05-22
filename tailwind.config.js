/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['selector', '[data-theme="dark"]'],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cyber: {
          bg: '#050816',
          dark: '#070b22',
          light: '#11183c',
          accent: '#00f3ff',
          neonBorder: 'rgba(0, 243, 255, 0.2)',
          redGlow: 'rgba(255, 0, 85, 0.4)',
        },
        emergency: {
          red: '#ff0055',
          orange: '#ffaa00',
          green: '#00ff66',
          blue: '#00ccff',
        }
      },
      fontFamily: {
        mono: ['Courier New', 'Courier', 'monospace', 'Outfit', 'Inter'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'radar-sweep': 'radar 6s linear infinite',
        'neon-glow': 'glow 2s ease-in-out infinite alternate',
        'scanline-scroll': 'scanline 8s linear infinite',
      },
      keyframes: {
        radar: {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' }
        },
        glow: {
          '0%': { boxShadow: '0 0 5px rgba(0, 243, 255, 0.2), 0 0 10px rgba(0, 243, 255, 0.2)' },
          '100%': { boxShadow: '0 0 15px rgba(0, 243, 255, 0.6), 0 0 25px rgba(0, 243, 255, 0.3)' }
        },
        scanline: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' }
        }
      }
    },
  },
  plugins: [],
}
