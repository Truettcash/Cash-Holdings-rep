// ATHRTY brand-token compiler. Uses only Node built-ins; safe for static Vercel builds.
// Usage: node website/scripts/generate-brand-tokens.mjs [--check]
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const contract = JSON.parse(readFileSync(resolve(root, "brand-contract.json"), "utf8"));
const t = contract.tokens;
const map = {
  canvas:"canvas",surface:"surface",raised:"surface-2",hover:"surface-3",ink:"ink",muted:"muted",
  edge:"edge",mint:"mint",cyan:"cyan",onMint:"on-mint",cardRadius:"radius"
};
for (const key of Object.keys(map)) {
  if (typeof t[key] !== "string" || !/^(#[0-9a-fA-F]{6}|[0-9]+px)$/.test(t[key]))
    throw new Error("Invalid ATHRTY token: " + key);
}
const bodyFont = 'Manrope,"DM Sans",ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';
const lines = [
  "/* GENERATED FILE. Source: website/brand-contract.json. Do not edit manually. */",
  "/* Design authority: ATHRTY Obsidian Mint / Hatchable PX13. */",
  ":root {",
  ...Object.entries(map).map(([name, cssName]) => "  --" + cssName + ": " + t[name] + ";"),
  "  --athrty-font-body: " + bodyFont + ";",
  "  --athrty-canvas: var(--canvas);",
  "  --athrty-surface: var(--surface);",
  "  --athrty-surface-raised: var(--surface-2);",
  "  --athrty-accent: var(--mint);",
  "  --athrty-focus-color: var(--mint);",
  "}",
  ""
];
const output = lines.join("\n");
const file = resolve(root, "assets/athrty-tokens.css");
if (process.argv.includes("--check")) {
  if (readFileSync(file, "utf8") !== output) {
    console.error("ATHRTY design token drift detected. Run the generator and commit its output.");
    process.exitCode = 1;
  } else console.log("ATHRTY design tokens synchronized:", contract.id);
} else {
  writeFileSync(file, output, "utf8");
  console.log("Generated", file);
}
