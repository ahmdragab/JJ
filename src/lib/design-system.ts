/**
 * Design System - Single Source of Truth
 *
 * This file defines all design tokens for the application.
 * Import from here instead of hardcoding values.
 */

// =============================================================================
// COLOR PALETTE
// =============================================================================

export const colors = {
  // Brand Colors
  brand: {
    primary: '#3531B7',      // Royal Blue - Primary actions, CTAs, links
    primaryHover: '#2a26a0', // Darker blue for hover states
    primaryLight: '#4844c7', // Lighter for focus rings
    primaryMuted: '#3531B715', // For subtle backgrounds
  },

  // Neutral Scale
  neutral: {
    50: '#F8F7F9',   // Background
    100: '#f1f0f3',  // Subtle backgrounds
    200: '#e4e3e8',  // Borders, dividers
    300: '#d1d0d6',  // Disabled states
    400: '#9d9ca3',  // Placeholder text
    500: '#6B6F85',  // Secondary text
    600: '#4a4d5e',  // Body text
    700: '#2d2f3a',  // Headings
    800: '#1a1b23',  // Primary text
    900: '#0D0D31',  // Dark backgrounds
  },

  // Semantic Colors
  semantic: {
    error: '#dc2626',
    errorLight: '#fef2f2',
    errorDark: '#840E25',
    success: '#10b981',
    successLight: '#ecfdf5',
    warning: '#f59e0b',
    warningLight: '#fffbeb',
    info: '#3b82f6',
    infoLight: '#eff6ff',
  },

  // Surface Colors
  surface: {
    base: '#F8F7F9',
    elevated: '#ffffff',
    overlay: 'rgba(0, 0, 0, 0.4)',
    glass: 'rgba(255, 255, 255, 0.95)',
    glassMuted: 'rgba(255, 255, 255, 0.8)',
  },
} as const;

// =============================================================================
// TYPOGRAPHY
// =============================================================================

export const typography = {
  // Font Families
  fonts: {
    display: "'Playfair Display', Georgia, serif",  // Headlines, hero text
    heading: "'Poppins', system-ui, sans-serif",    // Section headings
    body: "'Inter', system-ui, sans-serif",         // Body text, UI
    mono: "'JetBrains Mono', monospace",            // Code, technical
  },

  // Font Sizes (in rem)
  sizes: {
    xs: '0.75rem',    // 12px
    sm: '0.875rem',   // 14px
    base: '1rem',     // 16px
    lg: '1.125rem',   // 18px
    xl: '1.25rem',    // 20px
    '2xl': '1.5rem',  // 24px
    '3xl': '1.875rem', // 30px
    '4xl': '2.25rem', // 36px
    '5xl': '3rem',    // 48px
    '6xl': '3.75rem', // 60px
  },

  // Font Weights
  weights: {
    light: 300,
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
    extrabold: 800,
  },

  // Line Heights
  lineHeights: {
    tight: 1.25,
    snug: 1.375,
    normal: 1.5,
    relaxed: 1.625,
    loose: 2,
  },
} as const;

// =============================================================================
// SPACING SCALE
// =============================================================================

export const spacing = {
  0: '0',
  px: '1px',
  0.5: '0.125rem',  // 2px
  1: '0.25rem',     // 4px
  1.5: '0.375rem',  // 6px
  2: '0.5rem',      // 8px
  2.5: '0.625rem',  // 10px
  3: '0.75rem',     // 12px
  3.5: '0.875rem',  // 14px
  4: '1rem',        // 16px
  5: '1.25rem',     // 20px
  6: '1.5rem',      // 24px
  7: '1.75rem',     // 28px
  8: '2rem',        // 32px
  9: '2.25rem',     // 36px
  10: '2.5rem',     // 40px
  12: '3rem',       // 48px
  14: '3.5rem',     // 56px
  16: '4rem',       // 64px
  20: '5rem',       // 80px
  24: '6rem',       // 96px
} as const;

// =============================================================================
// BORDER RADIUS
// =============================================================================

export const radius = {
  none: '0',
  sm: '0.25rem',    // 4px - Subtle rounding
  md: '0.5rem',     // 8px - Default buttons, inputs
  lg: '0.75rem',    // 12px - Cards, containers
  xl: '1rem',       // 16px - Modals, large cards
  '2xl': '1.5rem',  // 24px - Feature cards
  '3xl': '2rem',    // 32px - Hero elements
  full: '9999px',   // Pills, avatars
} as const;

// =============================================================================
// SHADOWS
// =============================================================================

export const shadows = {
  none: 'none',
  sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)',
  lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)',
  xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
  '2xl': '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
  inner: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.05)',
  // Brand shadow with color
  glow: `0 0 20px ${colors.brand.primary}30`,
  glowStrong: `0 0 40px ${colors.brand.primary}50`,
} as const;

// =============================================================================
// TRANSITIONS & ANIMATIONS
// =============================================================================

export const transitions = {
  // Durations
  durations: {
    fast: '150ms',
    normal: '200ms',
    slow: '300ms',
    slower: '500ms',
  },

  // Easings
  easings: {
    default: 'cubic-bezier(0.4, 0, 0.2, 1)',
    in: 'cubic-bezier(0.4, 0, 1, 1)',
    out: 'cubic-bezier(0, 0, 0.2, 1)',
    inOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
    bounce: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
  },
} as const;

// =============================================================================
// Z-INDEX SCALE
// =============================================================================

export const zIndex = {
  hide: -1,
  base: 0,
  dropdown: 10,
  sticky: 20,
  fixed: 30,
  overlay: 40,
  modal: 50,
  popover: 60,
  toast: 70,
  tooltip: 80,
} as const;

// =============================================================================
// BREAKPOINTS
// =============================================================================

export const breakpoints = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
} as const;

// =============================================================================
// COMPONENT TOKENS
// =============================================================================

export const components = {
  // Button variants
  button: {
    primary: {
      bg: colors.brand.primary,
      bgHover: colors.brand.primaryHover,
      text: '#ffffff',
      radius: radius.lg,
    },
    secondary: {
      bg: colors.neutral[800],
      bgHover: colors.neutral[700],
      text: '#ffffff',
      radius: radius.lg,
    },
    ghost: {
      bg: 'transparent',
      bgHover: colors.neutral[100],
      text: colors.neutral[600],
      radius: radius.lg,
    },
    danger: {
      bg: colors.semantic.error,
      bgHover: colors.semantic.errorDark,
      text: '#ffffff',
      radius: radius.lg,
    },
  },

  // Input styles
  input: {
    bg: '#ffffff',
    border: colors.neutral[200],
    borderFocus: colors.brand.primary,
    text: colors.neutral[800],
    placeholder: colors.neutral[400],
    radius: radius.lg,
  },

  // Card styles
  card: {
    bg: colors.surface.elevated,
    border: colors.neutral[200],
    radius: radius.xl,
    shadow: shadows.lg,
  },

  // Modal styles
  modal: {
    bg: colors.surface.glass,
    backdrop: colors.surface.overlay,
    radius: radius['2xl'],
    shadow: shadows['2xl'],
  },
} as const;

// =============================================================================
// CSS VARIABLE GENERATOR
// =============================================================================

export function generateCSSVariables(): string {
  return `
    :root {
      /* Brand Colors */
      --color-brand-primary: ${colors.brand.primary};
      --color-brand-primary-hover: ${colors.brand.primaryHover};
      --color-brand-primary-light: ${colors.brand.primaryLight};
      --color-brand-primary-muted: ${colors.brand.primaryMuted};

      /* Neutral Colors */
      --color-neutral-50: ${colors.neutral[50]};
      --color-neutral-100: ${colors.neutral[100]};
      --color-neutral-200: ${colors.neutral[200]};
      --color-neutral-300: ${colors.neutral[300]};
      --color-neutral-400: ${colors.neutral[400]};
      --color-neutral-500: ${colors.neutral[500]};
      --color-neutral-600: ${colors.neutral[600]};
      --color-neutral-700: ${colors.neutral[700]};
      --color-neutral-800: ${colors.neutral[800]};
      --color-neutral-900: ${colors.neutral[900]};

      /* Semantic Colors */
      --color-error: ${colors.semantic.error};
      --color-success: ${colors.semantic.success};
      --color-warning: ${colors.semantic.warning};
      --color-info: ${colors.semantic.info};

      /* Typography */
      --font-display: ${typography.fonts.display};
      --font-heading: ${typography.fonts.heading};
      --font-body: ${typography.fonts.body};
      --font-mono: ${typography.fonts.mono};

      /* Transitions */
      --transition-fast: ${transitions.durations.fast};
      --transition-normal: ${transitions.durations.normal};
      --transition-slow: ${transitions.durations.slow};
      --ease-default: ${transitions.easings.default};
      --ease-bounce: ${transitions.easings.bounce};
    }
  `;
}

// =============================================================================
// UTILITY CLASSES (for use with cn() or clsx())
// =============================================================================

export const buttonStyles = {
  base: 'inline-flex items-center justify-center font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation',
  sizes: {
    sm: 'px-3 py-1.5 text-sm min-h-[36px]',
    md: 'px-4 py-2 text-sm min-h-[40px]',
    lg: 'px-6 py-3 text-base min-h-[48px]',
  },
  variants: {
    primary: 'bg-brand-primary text-white hover:bg-brand-primary-hover focus:ring-brand-primary active:scale-[0.98]',
    secondary: 'bg-neutral-800 text-white hover:bg-neutral-700 focus:ring-neutral-500 active:scale-[0.98]',
    ghost: 'bg-transparent text-neutral-600 hover:bg-neutral-100 hover:text-neutral-800 focus:ring-neutral-300',
    danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500 active:scale-[0.98]',
    outline: 'border-2 border-brand-primary text-brand-primary hover:bg-brand-primary hover:text-white focus:ring-brand-primary',
  },
  rounded: {
    md: 'rounded-lg',
    full: 'rounded-full',
  },
} as const;

export const cardStyles = {
  base: 'bg-white border border-neutral-200 transition-all duration-300',
  variants: {
    default: 'shadow-lg hover:shadow-xl',
    elevated: 'shadow-xl hover:shadow-2xl',
    flat: 'shadow-none',
    interactive: 'shadow-lg hover:shadow-xl hover:scale-[1.02] cursor-pointer',
  },
  rounded: {
    lg: 'rounded-xl',
    xl: 'rounded-2xl',
    '2xl': 'rounded-3xl',
  },
} as const;

export const inputStyles = {
  base: 'w-full bg-white border border-neutral-200 text-neutral-800 placeholder:text-neutral-400 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-brand-primary focus:border-brand-primary',
  sizes: {
    sm: 'px-3 py-2 text-sm rounded-lg',
    md: 'px-4 py-3 text-base rounded-lg',
    lg: 'px-4 py-4 text-lg rounded-xl',
  },
} as const;
