/*
 * ATHRTY PX-V1 browser release gate.
 * Runs the production static files in a local HTTP server.
 * No credentials, business APIs or private data.
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const dir=dirname(fileURLToPath(import.meta.url));
const root=resolve(dir,"../../website");
const contract=JSON.parse(readFileSync(resolve(root,"brand-contract.json"),"utf8"));
const config=JSON.parse(readFileSync(resolve(root,"vercel.json"),"utf8"));
const redirects=new Map(config.redirects.map(r=>[r.source,r.destination]));
const types={".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"application/javascript; charset=utf-8",".json":"application/json"};
const server=createServer((req,res)=>{
 const url=new URL(req.url||"/","http://localhost");
 let pathname;
 try{pathname=decodeURIComponent(url.pathname)}catch{res.writeHead(400).end();return}
 if(redirects.has(pathname)){res.writeHead(307,{Location:redirects.get(pathname),"Cache-Control":"no-store"}).end();return}
 const path=resolve(root,"."+pathname,(pathname.endsWith("/")||!extname(pathname))?"index.html":"");
 if(!path.startsWith(root+"/")&&!path.endsWith("/website/index.html")){res.writeHead(403).end();return}
 if(!existsSync(path)){res.writeHead(404).end();return}
 res.writeHead(200,{"Content-Type":types[extname(path)]||"application/octet-stream","Cache-Control":"no-store"});
 res.end(readFileSync(path));
});
const errors=[];
const check=(condition,message)=>{if(!condition)errors.push(message)};
let browser;
try{
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 const base="http://127.0.0.1:"+server.address().port;
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage();
 const widths=[320,375,390,430,768,880,881,1024,1090,1440,1920];
 let cases=0;
 for(const route of contract.publicRoutes){
  for(const width of widths){
   await page.setViewportSize({width,height:900});
   const response=await page.goto(base+route,{waitUntil:"domcontentloaded",timeout:15000});
   check(response?.status()===200,route+" @"+width+": HTTP "+response?.status());
   const result=await page.evaluate(()=>{
    const visible=e=>!!e&&getComputedStyle(e).display!=="none"&&getComputedStyle(e).visibility!=="hidden";
    const header=document.querySelector(".site-header");
    const nav=document.querySelector(".primary-nav");
    const ctas=[document.querySelector(".header-cta"),nav?.querySelector(".button")].filter(visible);
    const leaks=[...document.querySelectorAll("main *")].filter(e=>{
      const s=getComputedStyle(e),r=e.getBoundingClientRect();
      return r.width>0&&r.height>0&&r.right>innerWidth+3&&s.position!=="fixed"&&s.position!=="absolute"&&!e.closest("[hidden]");
    }).slice(0,3).map(e=>e.tagName+"." +String(e.className).slice(0,40));
    return {
      doc:document.documentElement.scrollWidth,view:innerWidth,
      h1:document.querySelectorAll("main h1").length,
      ctas:ctas.length,hasNav:!!nav,hasMain:!!document.querySelector("main#main"),
      skip:!!document.querySelector('a.skip-link[href="#main"]'),
      menu:visible(document.querySelector(".menu-button")),leaks,
      foot:!!document.querySelector("footer")
    };
   });
   check(result.doc<=width+1,route+" @"+width+": horizontal overflow "+result.doc);
   check(result.leaks.length===0,route+" @"+width+": offscreen nodes "+result.leaks.join(","));
   check(result.h1===1,route+" @"+width+": expected one main h1");
   check(result.ctas===1,route+" @"+width+": visible CTAs="+result.ctas);
   check(result.hasNav&&result.hasMain&&result.skip&&result.foot,route+" @"+width+": missing landmarks");
   check(result.menu===(width<=880),route+" @"+width+": nav breakpoint mismatch");
   cases++;
  }
 }
 // Browser-driven menu and keyboard behavior (not synthetic DOM event).
 await page.setViewportSize({width:375,height:812});
 await page.goto(base,{waitUntil:"domcontentloaded"});
 await page.locator(".menu-button").click();
 check(await page.locator(".menu-button").getAttribute("aria-expanded")==="true","mobile menu did not open");
 check(await page.evaluate(()=>document.body.style.overflow)==="hidden","mobile scroll is not locked");
 check(await page.evaluate(()=>document.querySelector(".primary-nav")?.contains(document.activeElement)),"mobile focus did not enter nav");
 await page.keyboard.press("Escape");
 check(await page.locator(".menu-button").getAttribute("aria-expanded")==="false","Escape did not close menu");
 check(await page.locator(".menu-button").evaluate(el=>el===document.activeElement),"Escape did not return focus");
 check(await page.evaluate(()=>document.body.style.overflow)==="","mobile scroll was not restored");
 await page.locator(".menu-button").click();
 await page.locator('.primary-nav a[href="/products"]').click();
 check(new URL(page.url()).pathname==="/products","mobile route activation failed");
 check(await page.locator(".menu-button").getAttribute("aria-expanded")==="false","mobile menu remained open");
 // Honor reduced motion.
 await page.emulateMedia({reducedMotion:"reduce"});
 const reduced=await page.locator(".button").first().evaluate(el=>parseFloat(getComputedStyle(el).transitionDuration)<=0.001);
 check(reduced,"reduced-motion override did not suppress transitions");
 await page.emulateMedia({reducedMotion:"no-preference"});
 // Automated axe checks: serious and critical issues are blockers.
 let axePass=0;
 for(const route of contract.publicRoutes){
  for(const width of [375,1440]){
   await page.setViewportSize({width,height:900});
   await page.goto(base+route,{waitUntil:"domcontentloaded"});
   const result=await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21a","wcag21aa"]).analyze();
   const blocking=result.violations.filter(v=>v.impact==="critical"||v.impact==="serious");
   for(const violation of blocking)errors.push(route+" @"+width+": axe "+violation.id+" ("+violation.impact+"), "+violation.nodes.length+" nodes");
   axePass++;
  }
 }
 // All external handoffs stay owned by the Hatchable application.
 for(const [route,destination] of redirects){
  const response=await fetch(base+route,{redirect:"manual"});
  check(response.status===307,route+": local redirect status "+response.status);
  check(response.headers.get("location")===destination,route+": incorrect redirect destination");
 }
 console.log(JSON.stringify({routes:contract.publicRoutes.length,viewports:widths.length,responsiveCases:cases,axeScans:axePass,redirects:redirects.size,errors},null,2));
 if(errors.length)process.exitCode=1;
}catch(error){console.error("ATHRTY browser QA failed:",error);process.exitCode=1;
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
