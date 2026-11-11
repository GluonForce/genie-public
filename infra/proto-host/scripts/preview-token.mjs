// Development helper: print a preview link for a slug, signed like the web app will sign it (M3.4).
// Usage: pnpm --filter proto-host preview-link <slug> [minutes]
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

const [slug, minutes = "60"] = process.argv.slice(2);
if (!slug) {
  console.error("Usage: pnpm --filter proto-host preview-link <slug> [minutes]");
  process.exit(1);
}
const vars = Object.fromEntries(
  readFileSync(new URL("../.dev.vars", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((line) => line.includes("="))
    .map((line) => [line.slice(0, line.indexOf("=")).trim(), line.slice(line.indexOf("=") + 1).trim()]),
);
const expires = Math.floor(Date.now() / 1000) + Number(minutes) * 60;
const signature = createHmac("sha256", vars.PREVIEW_TOKEN_SECRET).update(`${slug}.${expires}`).digest("hex");
console.log(`http://${slug}.localhost:8787/?token=${expires}.${signature}`);
