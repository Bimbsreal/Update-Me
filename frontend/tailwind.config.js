/** @type {import('tailwindcss').Config} */
const config = {
  content: [
    './app/**/*.{js,jsx}',
    './components/**/*.{js,jsx}',
    './lib/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#E8F5EF',
          100: '#C5E6D4',
          200: '#9AD4B5',
          300: '#6BC294',
          400: '#3DAB73',
          500: '#0A8F54',
          600: '#006D44',
          700: '#005A38',
          800: '#00472C',
          900: '#003320',
        },
        status: {
          normal: '#0A8F54',
          available: '#0A8F54',
          caution: '#E5A100',
          attention: '#E67E22',
          urgent: '#D62828',
          official: '#1B6CA8',
          expired: '#6B7280',
        },
        ink: {
          DEFAULT: '#0F1F17',
          muted: '#5B6B63',
          soft: '#8A968F',
        },
        surface: {
          DEFAULT: '#FFFFFF',
          muted: '#F8F9FA',
          border: '#E6EBE8',
        },
      },
      fontFamily: {
        sans: ['var(--font-plus-jakarta)', 'Segoe UI', 'sans-serif'],
        display: ['var(--font-plus-jakarta)', 'Segoe UI', 'sans-serif'],
      },
      borderRadius: {
        card: '16px',
        control: '10px',
        pill: '999px',
      },
      boxShadow: {
        soft: '0 8px 30px rgba(15, 31, 23, 0.06)',
        card: '0 4px 18px rgba(15, 31, 23, 0.05)',
      },
      maxWidth: {
        container: '1200px',
      },
      spacing: {
        section: '5rem',
        'section-lg': '6.5rem',
      },
    },
  },
  plugins: [],
};

export default config;
