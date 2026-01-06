// Brand color palette
export const BRAND_COLORS = {
  // Primary colors
  royalBlue: '#3531B7',      // Primary actions, buttons, CTAs, accents
  darkBlue: '#0D0D31',        // Headers, dark backgrounds, primary text
  brightSnow: '#F8F7F9',     // Background color
  
  // Secondary colors
  mediumGray: '#6B6F85',     // Secondary text, borders, subtle elements, placeholders
  darkRed: '#840E25',        // Errors, warnings, critical actions, destructive buttons
} as const;

// Convenience exports for UI elements
export const PRIMARY_COLOR = BRAND_COLORS.royalBlue;
export const SECONDARY_COLOR = BRAND_COLORS.royalBlue; // For gradients, can use darkBlue for variety
export const BACKGROUND_COLOR = BRAND_COLORS.brightSnow;
export const TEXT_PRIMARY = BRAND_COLORS.darkBlue;
export const TEXT_SECONDARY = BRAND_COLORS.mediumGray;
export const ERROR_COLOR = BRAND_COLORS.darkRed;
export const BORDER_COLOR = BRAND_COLORS.mediumGray;

