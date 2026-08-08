import posthog from 'posthog-js';

export function initPostHog(options?: { key?: string; apiHost?: string }) {
  const key = options?.key ?? process.env.VITE_POSTHOG_KEY ?? process.env.REACT_APP_POSTHOG_KEY;
  if (!key) return;

  const apiHost =
    options?.apiHost ??
    process.env.VITE_POSTHOG_HOST ??
    process.env.REACT_APP_POSTHOG_HOST ??
    'https://app.posthog.com';

  posthog.init(key, { api_host: apiHost });
}

export default posthog;
