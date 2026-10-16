/* ATHRTY static flagship contract QA: zero dependencies, no credentials. */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { spawnSync } from "node:child_process";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const contract = JSON.parse(readFileSync(resolve(root, "brand-contract.json"), "utf8"));
const config = JSON.parse(readFileSync(resolve(root, "vercel.json"), "utf8"));
if (Object.hasOwn(contract.authority, "protectedPortfolio") || Object.hasOwn(contract.provenance ?? {}, "authoritativeProject")) {
 console.error("Public ATHRTY design contract must not disclose private operating-system or provider project identifiers.");
 process.exit(1);
}
const errors = [];
const expect = (condition, message) => { if (!condition) errors.push(message); };
const redirects = new Map(config.redirects.map(({ source, destination }) => [source, destination]));
for (const [from, to] of Object.entries(contract.transitions)) {
 if (from.startsWith("/")) expect(redirects.get(from) === to, "Route mismatch: " + from);
}
for (const route of contract.publicRoutes) {
 const path = resolve(root, route === "/" ? "index.html" : route.slice(1) + "/index.html");
 expect(existsSync(path), "Missing public route: " + route);
 if (!existsSync(path)) continue;
 const html = readFileSync(path,"utf8");
 expect(html.includes('<main id="main">'), "Missing main landmark: "+route);
 expect(html.includes('<a href="#main" class="skip-link">'), "Missing focusable skip link: "+route);
 expect(html.includes('aria-label="Primary navigation"'), "Missing nav landmark: "+route);
 expect(html.includes('/assets/athrty-tokens.css'), "Missing generated design tokens: "+route);
 expect(html.includes('/assets/athrty.css'), "Missing flagship components stylesheet: "+route);
 expect(html.includes('/assets/athrty.js'), "Missing navigation runtime: "+route);
 expect((html.match(/<h1\b/g)||[]).length===1,"Must have exactly one h1: "+route);
 for(const match of html.matchAll(/href="([^"]+)"/g)){
   const href=match[1];
   if(!href.startsWith("/") || href.startsWith("//"))continue;
   const cleaned=href.split("?")[0].split("#")[0];
   if(contract.publicRoutes.includes(cleaned)||redirects.has(cleaned))continue;
   if(cleaned.startsWith("/assets/") && existsSync(resolve(root,"."+cleaned)))continue;
   expect(false,"Broken internal route "+href+" on "+route);
 }
}
const notFoundFile=resolve(root,"404.html");
expect(existsSync(notFoundFile),"Missing branded 404 fallback");
if(existsSync(notFoundFile)){
 const html=readFileSync(notFoundFile,"utf8");
 expect(html.includes("Page not found | ATHRTY"),"404 page has incorrect brand title");
 expect(html.includes('name="robots" content="noindex,follow"'),"404 page must remain noindex");
 expect(html.includes('<main id="main">')&&html.includes('href="/"'),"404 missing semantic recovery");
 expect(html.includes("/assets/athrty-tokens.css"),"404 missing shared design tokens");
}
const tokenCheck=spawnSync(process.execPath,[resolve(root,"scripts/generate-brand-tokens.mjs"),"--check"],{encoding:"utf8"});
expect(tokenCheck.status===0,"Generated CSS differs from contract: "+(tokenCheck.stderr||tokenCheck.stdout).trim());
expect(contract.responsiveWidths.includes(375)&&contract.responsiveWidths.includes(1920),"Responsive contract incomplete");
if(errors.length){console.error(errors.join("\n"));process.exit(1)}
console.log("ATHRTY contract checks passed: "+contract.publicRoutes.length+" routes, "+redirects.size+" product handoffs, "+contract.responsiveWidths.length+" responsive targets.");
