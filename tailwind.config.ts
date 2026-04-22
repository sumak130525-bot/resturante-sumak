import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        sumak: {
          red:          '#C0392B',
          'red-dark':   '#922B21',
          'red-light':  '#E74C3C',
          gold:         '#D4A017',
          'gold-light': '#F5C842',
          'gold-pale':  '#FBE99A',
          cream:        '#FDF6EC',
          'cream-dark': '#F5E8D3',
          brown:        '#3E1C00',
          'brown-mid':  '#6B3A1F',
          'brown-light':'#8B6F47',
          'brown-pale': '#C9A882',
        },
      },
      fontFamily: {
        serif: ['Playfair Display', 'Georgia', 'serif'],
        sans:  ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: '1.25rem',
        pill: '9999px',
      },
      boxShadow: {
        'card-rest':  '0 2px 12px rgba(62,28,0,0.08)',
        'card-hover': '0 20px 60px rgba(62,28,0,0.18)',
        'gold-glow':  '0 0 24px rgba(212,160,23,0.45)',
        'red-glow':   '0 0 20px rgba(192,57,43,0.4)',
        'premium':    '0 8px 32px rgba(62,28,0,0.12), 0 2px 8px rgba(62,28,0,0.06)',
        'drawer':     '-8px 0 40px rgba(0,0,0,0.25)',
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(20px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.93)' },
          to:   { opacity: '1', transform: 'scale(1)' },
        },
        'slide-in-right': {
          from: { transform: 'translateX(110%)' },
          to:   { transform: 'translateX(0)' },
        },
        'slide-out-right': {
          from: { transform: 'translateX(0)' },
          to:   { transform: 'translateX(110%)' },
        },
        'badge-pop': {
          '0%':   { transform: 'scale(1)' },
          '40%':  { transform: 'scale(1.35)' },
          '70%':  { transform: 'scale(0.9)' },
          '100%': { transform: 'scale(1)' },
        },
        'shimmer': {
          from: { backgroundPosition: '-200% 0' },
          to:   { backgroundPosition: '200% 0' },
        },
        'pulse-ring': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(212,160,23,0.5)' },
          '50%':      { boxShadow: '0 0 0 10px rgba(212,160,23,0)' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%':      { transform: 'translateY(-6px)' },
        },
        'spin-slow': {
          from: { transform: 'rotate(0deg)' },
          to:   { transform: 'rotate(360deg)' },
        },
      },
      animation: {
        'fade-up':         'fade-up 0.45s cubic-bezier(0.16,1,0.3,1) both',
        'fade-in':         'fade-in 0.3s ease-out both',
        'scale-in':        'scale-in 0.35s cubic-bezier(0.16,1,0.3,1) both',
        'slide-in-right':  'slide-in-right 0.4s cubic-bezier(0.16,1,0.3,1) both',
        'badge-pop':       'badge-pop 0.4s cubic-bezier(0.34,1.56,0.64,1) both',
        'shimmer':         'shimmer 1.8s linear infinite',
        'pulse-ring':      'pulse-ring 1.8s ease-in-out infinite',
        'float':           'float 3s ease-in-out infinite',
        'spin-slow':       'spin-slow 8s linear infinite',
      },
      backgroundImage: {
        'andean-stripe': 'repeating-linear-gradient(90deg, #C0392B 0px, #C0392B 8px, #D4A017 8px, #D4A017 16px, #3E1C00 16px, #3E1C00 24px, #D4A017 24px, #D4A017 32px)',
        'hero-gradient': 'linear-gradient(135deg, #3E1C00 0%, #6B3A1F 40%, #3E1C00 100%)',
        'card-gradient': 'linear-gradient(to top, rgba(62,28,0,0.85) 0%, rgba(62,28,0,0.3) 50%, transparent 100%)',
        'gold-gradient':       'linear-gradient(135deg, #D4A017 0%, #F5C842 50%, #D4A017 100%)',
        'sumak-gold-gradient': 'linear-gradient(135deg, #D4A017 0%, #F5C842 50%, #D4A017 100%)',
        'shimmer-base':  'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.06) 50%, transparent 100%)',
      },
      transitionTimingFunction: {
        'spring': 'cubic-bezier(0.34,1.56,0.64,1)',
        'smooth': 'cubic-bezier(0.16,1,0.3,1)',
      },
    },
  },
  plugins: [],
}

export default config
