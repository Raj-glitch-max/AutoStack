import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: '#0a0a0a',
        foreground: '#f5f5f5',
        accent: {
          DEFAULT: '#00bfa6',
          hover: '#00a892',
        },
        card: {
          DEFAULT: '#1a1a1a',
          hover: '#252525',
        },
        border: '#2a2a2a',
        muted: {
          DEFAULT: '#3a3a3a',
          foreground: '#a0a0a0',
        },
      },
      borderRadius: {
        lg: '0.5rem',
        md: '0.375rem',
        sm: '0.25rem',
      },
    },
  },
  plugins: [],
}
export default config

