/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      // =============================================================================
      // COLORS
      // =============================================================================
      colors: {
        // Brand colors
        brand: {
          primary: '#3531B7',
          'primary-hover': '#2a26a0',
          'primary-light': '#4844c7',
          'primary-muted': 'rgba(53, 49, 183, 0.08)',
        },
        // Neutral scale (matching design system)
        neutral: {
          50: '#F8F7F9',
          100: '#f1f0f3',
          200: '#e4e3e8',
          300: '#d1d0d6',
          400: '#9d9ca3',
          500: '#6B6F85',
          600: '#4a4d5e',
          700: '#2d2f3a',
          800: '#1a1b23',
          900: '#0D0D31',
        },
      },

      // =============================================================================
      // TYPOGRAPHY
      // =============================================================================
      fontFamily: {
        display: ["'Playfair Display'", 'Georgia', 'serif'],
        heading: ['Poppins', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
        mono: ["'JetBrains Mono'", 'monospace'],
        // Landing page font
        dm: ["'DM Sans'", 'sans-serif'],
        // Legacy alias
        playful: ['Poppins', 'sans-serif'],
      },

      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '1' }],
      },

      // =============================================================================
      // SPACING (extending defaults)
      // =============================================================================
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
        '128': '32rem',
      },

      // =============================================================================
      // BORDER RADIUS
      // =============================================================================
      borderRadius: {
        '4xl': '2rem',
        '5xl': '2.5rem',
      },

      // =============================================================================
      // SHADOWS
      // =============================================================================
      boxShadow: {
        'glow': '0 0 20px rgba(53, 49, 183, 0.2)',
        'glow-strong': '0 0 40px rgba(53, 49, 183, 0.35)',
        'glow-lg': '0 0 60px rgba(53, 49, 183, 0.25)',
        'inner-lg': 'inset 0 4px 8px 0 rgba(0, 0, 0, 0.1)',
        'elevated': '0 20px 40px -10px rgba(0, 0, 0, 0.15)',
      },

      // =============================================================================
      // ANIMATIONS
      // =============================================================================
      animation: {
        // Fade animations
        'fade-in': 'fadeIn 0.5s ease-out forwards',
        'fade-in-up': 'fadeInUp 0.5s ease-out forwards',
        'fade-in-down': 'fadeInDown 0.5s ease-out forwards',
        'fade-in-scale': 'fadeInScale 0.3s ease-out forwards',

        // Slide animations
        'slide-in-right': 'slideInRight 0.3s ease-out forwards',
        'slide-in-left': 'slideInLeft 0.3s ease-out forwards',
        'slide-in-up': 'slideInUp 0.3s ease-out forwards',
        'slide-in-down': 'slideInDown 0.3s ease-out forwards',

        // Special animations
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'shimmer': 'shimmer 2s linear infinite',
        'spin-slow': 'spin 3s linear infinite',

        // Stagger delays (use with animation-delay utility)
        'stagger-1': 'fadeInUp 0.5s ease-out 0.1s forwards',
        'stagger-2': 'fadeInUp 0.5s ease-out 0.2s forwards',
        'stagger-3': 'fadeInUp 0.5s ease-out 0.3s forwards',
        'stagger-4': 'fadeInUp 0.5s ease-out 0.4s forwards',
        'stagger-5': 'fadeInUp 0.5s ease-out 0.5s forwards',
      },

      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeInDown: {
          '0%': { opacity: '0', transform: 'translateY(-20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeInScale: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        slideInLeft: {
          '0%': { opacity: '0', transform: 'translateX(-20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        slideInUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInDown: {
          '0%': { opacity: '0', transform: 'translateY(-10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },

      // =============================================================================
      // TRANSITIONS
      // =============================================================================
      transitionDuration: {
        '400': '400ms',
      },

      // =============================================================================
      // BACKDROP BLUR
      // =============================================================================
      backdropBlur: {
        xs: '2px',
      },

      // =============================================================================
      // Z-INDEX
      // =============================================================================
      zIndex: {
        '60': '60',
        '70': '70',
        '80': '80',
      },
    },
  },
  plugins: [],
};
