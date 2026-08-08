import * as Sentry from '@sentry/react';

export function initSentry(options?: { dsn?: string; environment?: string }) {
  const dsn = options?.dsn ?? process.env.VITE_SENTRY_DSN ?? process.env.REACT_APP_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: options?.environment ?? process.env.NODE_ENV ?? 'production',
    tracesSampleRate: 0.1,
  });
}

export default Sentry;
