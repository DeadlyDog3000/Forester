// Checks that every named import in js/ resolves to a real export of the module it names. Run before a release:
//   node tools/checkimports.cjs js
const fs=require("fs"),path=require("path");
const root=process.argv[2]; const files=[];
(function walk(d){for(const f of fs.readdirSync(d)){const p=path.join(d,f);if(fs.statSync(p).isDirectory())walk(p);else if(f.endsWith(".js"))files.push(p);}})(root);
const exportsOf={};
const ex=p=>{ if(exportsOf[p])return exportsOf[p]; const s=fs.readFileSync(p,"utf8"); const set=new Set();
  for(const m of s.matchAll(/export\s+(?:async\s+)?(?:const|let|var|function\*?|class)\s+([A-Za-z_$][\w$]*)/g)) set.add(m[1]);
  for(const m of s.matchAll(/export\s+(?:const|let|var)\s+\{([^}]*)\}/g)) m[1].split(",").forEach(x=>set.add(x.split(":").pop().trim()));
  for(const m of s.matchAll(/export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=[^;]*?,\s*([A-Za-z_$][\w$]*)\s*=/g)) set.add(m[2]);
  for(const m of s.matchAll(/^export\s+(?:const|let|var)\s+(.*)$/gm)) for(const n of m[1].matchAll(/(?:^|,\s*)([A-Za-z_$][\w$]*)\s*=/g)) set.add(n[1]);
  for(const m of s.matchAll(/export\s*\{([^}]*)\}/g)) m[1].split(",").forEach(x=>{const t=x.trim().split(/\s+as\s+/).pop().trim(); if(t)set.add(t);});
  if(/export\s+default/.test(s))set.add("default");
  return exportsOf[p]=set; };
let bad=0;
for(const f of files){ const s=fs.readFileSync(f,"utf8");
  for(const m of s.matchAll(/import\s*\{([^}]*)\}\s*from\s*["'](\.[^"']+)["']/g)){ const tgt=path.resolve(path.dirname(f),m[2]); if(!fs.existsSync(tgt)){console.log("MISSING FILE",f,m[2]);bad++;continue;}
    const e=ex(tgt); for(const n of m[1].split(",")){const name=n.trim().split(/\s+as\s+/)[0].trim(); if(name&&!e.has(name)){console.log(path.relative(root,f),"imports",name,"from",m[2]);bad++;}}}}
console.log(bad?bad+" problems":"all imports resolve");
