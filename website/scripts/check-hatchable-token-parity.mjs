/* ATHRTY cross-runtime token drift gate.
 * Compares the versioned Vercel source contract to the LIVE canonical Hatchable PX13 stylesheet.
 * Node >=20. No secrets, no build-time mutation.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const c = JSON.parse(readFileSync(resolve(root,"brand-contract.json"),"utf8"));
const remote = "https://athrty-customer.hatchable.site/obsidian/px13-mint.css";
const response = await fetch(remote,{signal:AbortSignal.timeout(12000),headers:{Accept:"text/css"}});
if(!response.ok)throw Error("Hatchable token source unavailable (HTTP "+response.status+"). No parity certification.");
const css=await response.text();
const fields={
 canvas:"px13-obsidian",
 surface:"px13-deep",
 raised:"px13-graphite",
 hover:"px13-raised",
 ink:"px13-text",
 muted:"px13-muted",
 edge:"px13-edge",
 mint:"px13-primary",
 cyan:"px13-cyan",
 onMint:"athrty-on-accent",
 cardRadius:"px13-radius-card"
};
const mismatches=[];
for(const [contractName,remoteName] of Object.entries(fields)){
 const pattern=new RegExp("--"+remoteName+"\\s*:\\s*([^;\\s}]+)","i");
 const sourceValue=css.match(pattern)?.[1];
 const actual=c.tokens[contractName];
 if(!sourceValue||actual?.toLowerCase()!==sourceValue.toLowerCase())
   mismatches.push(contractName+": expected "+actual+", Hatchable reported "+(sourceValue??"missing"));
}
if(mismatches.length){
 console.error("ATHRTY design-source drift:\n"+mismatches.join("\n"));
 process.exit(1);
}
console.log("ATHRTY Obsidian Mint parity passed: "+Object.keys(fields).length+" authoritative tokens match "+remote);
