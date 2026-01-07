/**
 * Brand Color Palette
 *
 * IMPORTANT: This file re-exports from the design system for backwards compatibility.
 * For new code, prefer importing directly from './design-system'.
 */

import { colors } from './design-system';

// Brand color palette (re-export for backwards compatibility)
export const BRAND_COLORS = {
  // Primary colors
  royalBlue: colors.brand.primary,       // Primary actions, buttons, CTAs, accents
  darkBlue: colors.neutral[900],         // Headers, dark backgrounds, primary text
  brightSnow: colors.neutral[50],        // Background color

  // Secondary colors
  mediumGray: colors.neutral[500],       // Secondary text, borders, subtle elements
  darkRed: colors.semantic.errorDark,    // Errors, warnings, critical actions
} as const;

// Convenience exports for UI elements
export const PRIMARY_COLOR = colors.brand.primary;
export const PRIMARY_COLOR_HOVER = colors.brand.primaryHover;
export const SECONDARY_COLOR = colors.brand.primaryHover; // For gradients
export const BACKGROUND_COLOR = colors.neutral[50];
export const TEXT_PRIMARY = colors.neutral[800];
export const TEXT_SECONDARY = colors.neutral[500];
export const ERROR_COLOR = colors.semantic.error;
export const BORDER_COLOR = colors.neutral[200];

// New exports from design system
export { colors } from './design-system';
