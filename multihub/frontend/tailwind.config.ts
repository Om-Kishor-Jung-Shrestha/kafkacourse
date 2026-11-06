import type { Config } from 'tailwindcss';

// RULE-21: no purple/indigo/blue-purple/green gradients, white background, teal primary.
// The Udemy-style look comes from flat colour, strong typography and a dark "ink" hero/footer.
const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        bg: '#ffffff',
        surface: '#f7f9fa',
        border: '#d1d7dc',
        ink: { DEFAULT: '#1c1d1f', soft: '#2d2f31', muted: '#6a6f73' },
        primary: { DEFAULT: '#0f766e', hover: '#115e59', soft: '#e6f4f2' },
        accent: '#ea580c',
        success: '#16a34a',
        warning: '#d97706',
        error: '#dc2626',
        star: '#e59819',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
      boxShadow: {
        card: '0 2px 4px rgba(0,0,0,.08), 0 4px 12px rgba(0,0,0,.08)',
        pop: '0 8px 24px rgba(0,0,0,.16)',
      },
      keyframes: {
        fadeIn: { from: { opacity: '0', transform: 'translateY(4px)' }, to: { opacity: '1', transform: 'none' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
      },
      animation: { fadeIn: 'fadeIn .18s ease-out', shimmer: 'shimmer 1.4s infinite' },
    },
  },
  plugins: [],
};
export default config;
