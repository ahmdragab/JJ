import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import * as Sentry from '@sentry/react';
import App from './App.tsx';
import './index.css';
import { ErrorBoundary } from './components/ErrorBoundary';

// Initialize Sentry
const sentryDsn = import.meta.env.VITE_SENTRY_DSN;

// Debug: Log env status
console.log('🔍 Sentry Debug:', {
  hasDsn: !!sentryDsn,
  dsnLength: sentryDsn?.length || 0,
  dsnPreview: sentryDsn ? `${sentryDsn.substring(0, 20)}...` : 'not set',
  mode: import.meta.env.MODE,
});

if (sentryDsn) {
  try {
    Sentry.init({
      dsn: sentryDsn,
      environment: import.meta.env.MODE,
      integrations: [
        Sentry.browserTracingIntegration(),
        Sentry.replayIntegration({
          maskAllText: true,
          blockAllMedia: true,
        }),
      ],
      // Performance Monitoring
      tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0, // 10% in production, 100% in dev
      // Session Replay
      replaysSessionSampleRate: import.meta.env.PROD ? 0.1 : 1.0, // 10% in production, 100% in dev
      replaysOnErrorSampleRate: 1.0, // Always record replays when errors occur
    });
    console.log('✅ Sentry initialized successfully');
  } catch (error) {
    console.error('❌ Sentry initialization failed:', error);
  }
} else {
  console.warn('⚠️ Sentry DSN not found. Check:');
  console.warn('  1. VITE_SENTRY_DSN is in .env file');
  console.warn('  2. Dev server was restarted after adding it');
  console.warn('  3. Variable name is exactly VITE_SENTRY_DSN (case-sensitive)');
}

// Make Sentry available globally for testing
if (typeof window !== 'undefined') {
  (window as any).Sentry = Sentry;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
