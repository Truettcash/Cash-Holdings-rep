import { z } from 'zod';

export const BrowserEnvSchema = z.object({
  NODE_ENV: z.string().optional(),
  VITE_APP_FEATURE_FLAGS: z.string().optional(),
});

export type BrowserEnv = z.infer<typeof BrowserEnvSchema>;

export function parseBrowserEnv(raw: Record<string, string | undefined>) {
  return BrowserEnvSchema.parse(raw);
}
