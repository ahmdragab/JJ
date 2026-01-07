import { Loader2 } from 'lucide-react';

interface LoadingProps {
  /** The size variant of the loader */
  size?: 'sm' | 'md' | 'lg';
  /** Whether to show as a full page loader */
  fullPage?: boolean;
  /** Optional text to display below the spinner */
  text?: string;
  /** Whether to show the decorative background effect */
  showBackground?: boolean;
}

/**
 * Unified loading component for consistent loading states across the app.
 *
 * @example
 * // Full page loading
 * <Loading fullPage />
 *
 * @example
 * // Inline loading with text
 * <Loading size="sm" text="Loading..." />
 *
 * @example
 * // Medium centered loader with background
 * <Loading size="md" showBackground />
 */
export function Loading({
  size = 'md',
  fullPage = false,
  text,
  showBackground = true
}: LoadingProps) {
  const sizeClasses = {
    sm: {
      container: 'w-10 h-10',
      background: 'w-10 h-10',
      spinner: 'w-5 h-5',
    },
    md: {
      container: 'w-16 h-16',
      background: 'w-16 h-16',
      spinner: 'w-6 h-6',
    },
    lg: {
      container: 'w-20 h-20',
      background: 'w-20 h-20',
      spinner: 'w-8 h-8',
    },
  };

  const { container, background, spinner } = sizeClasses[size];

  const loader = (
    <div className="flex flex-col items-center gap-3">
      <div className={`relative ${container}`}>
        {showBackground && (
          <div
            className={`absolute inset-0 ${background} rounded-full bg-brand-primary/10 animate-pulse`}
          />
        )}
        <Loader2
          className={`${spinner} animate-spin text-brand-primary absolute inset-0 m-auto`}
        />
      </div>
      {text && (
        <p className="text-sm text-neutral-500 font-medium animate-pulse">
          {text}
        </p>
      )}
    </div>
  );

  if (fullPage) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50">
        {loader}
      </div>
    );
  }

  return loader;
}

/**
 * Skeleton loader for content placeholders
 */
interface SkeletonProps {
  className?: string;
  /** Whether to animate the skeleton */
  animate?: boolean;
}

export function Skeleton({ className = '', animate = true }: SkeletonProps) {
  return (
    <div
      className={`bg-neutral-200 rounded-lg ${animate ? 'skeleton' : ''} ${className}`}
    />
  );
}

/**
 * Skeleton card for loading card placeholders
 */
export function SkeletonCard() {
  return (
    <div className="card p-4 sm:p-5 space-y-4">
      <Skeleton className="aspect-[4/3] rounded-2xl" />
      <div className="space-y-2">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
      <div className="flex gap-1.5">
        <Skeleton className="w-6 h-6 rounded-full" />
        <Skeleton className="w-6 h-6 rounded-full" />
        <Skeleton className="w-6 h-6 rounded-full" />
      </div>
    </div>
  );
}

/**
 * Skeleton text for loading text placeholders
 */
interface SkeletonTextProps {
  lines?: number;
  className?: string;
}

export function SkeletonText({ lines = 3, className = '' }: SkeletonTextProps) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={`h-4 ${i === lines - 1 ? 'w-2/3' : 'w-full'}`}
        />
      ))}
    </div>
  );
}

/**
 * Loading overlay for covering content while loading
 */
interface LoadingOverlayProps {
  isLoading: boolean;
  text?: string;
  children: React.ReactNode;
}

export function LoadingOverlay({ isLoading, text, children }: LoadingOverlayProps) {
  return (
    <div className="relative">
      {children}
      {isLoading && (
        <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-10 rounded-xl">
          <Loading size="sm" text={text} />
        </div>
      )}
    </div>
  );
}
