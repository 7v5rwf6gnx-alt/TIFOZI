/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        night: {
          DEFAULT: '#111111',
          card:    '#1A1A1A',
          hover:   '#242424',
          border:  '#2A2A2A',
        },
        fifa: {
          red:    '#E8122D',
          gold:   '#FFD700',
          blue:   '#1B4FD8',
          green:  '#00A550',
          purple: '#6B2FA0',
        },
        panini: {
          blue:   '#1B4FD8',
          red:    '#E8122D',
          gold:   '#FFD700',
          green:  '#00A550',
          purple: '#6B2FA0',
          orange: '#F97316',
        },
      },
      backgroundImage: {
        'gradient-main':   'linear-gradient(135deg, #1B4FD8 0%, #E8122D 100%)',
        'gradient-header': 'linear-gradient(135deg, #1B4FD8 0%, #6B2FA0 50%, #E8122D 100%)',
        'gradient-gold':   'linear-gradient(135deg, #FFD700 0%, #F97316 100%)',
        'gradient-green':  'linear-gradient(135deg, #00A550 0%, #1B4FD8 100%)',
        'gradient-hero':   'linear-gradient(160deg, #050508 0%, #0D1B4B 50%, #1B0A14 100%)',
        'gradient-card':   'linear-gradient(135deg, #1A1A1A 0%, #242424 100%)',
      },
      boxShadow: {
        'glow':       '0 0 30px rgba(27, 79, 216, 0.3)',
        'glow-gold':  '0 0 30px rgba(255, 215, 0, 0.35)',
        'glow-red':   '0 0 30px rgba(232, 18, 45, 0.3)',
        'card':       '0 2px 8px rgba(0, 0, 0, 0.4)',
        'card-lg':    '0 8px 32px rgba(0, 0, 0, 0.6)',
      },
      fontFamily: {
        sans:    ['Inter', 'system-ui', 'sans-serif'],
        display: ['AdidasWC2026', '"Bebas Neue"', '"Russo One"', 'Impact', 'sans-serif'],
      },
      animation: {
        'fade-in':  'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
      },
      keyframes: {
        fadeIn:  { '0%': { opacity: 0 }, '100%': { opacity: 1 } },
        slideUp: { '0%': { opacity: 0, transform: 'translateY(16px)' }, '100%': { opacity: 1, transform: 'translateY(0)' } },
      },
    },
  },
  plugins: [],
}
