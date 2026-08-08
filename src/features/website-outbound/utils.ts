export function safeParseJson(input: unknown) {
  try {
    return JSON.parse(String(input));
  } catch (e) {
    return null;
  }
}
