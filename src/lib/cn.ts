/**
 * Utility for merging class names
 * Simple implementation without external dependencies
 */
export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}
