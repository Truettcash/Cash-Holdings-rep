import { test, expect } from '@playwright/test';

test('basic smoke', async () => {
  expect(1 + 1).toBe(2);
});
