import fs from "node:fs/promises";
const BASE="https://teatmik.haridus.ee/koolid";
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const clean=s=>s?.replace(/<[^>]*>/g," ").replace(/&nbsp;/g," ").replace(/&amp;/g,"&").replace(/&#039;/g,"'").replace(/&quot;/g,'"').replace(/\s+/g," ").trim()||null;
const field=(html,label)=>{const plain=clean(html);const next=["Registrikood","Tüüp","Omandivorm","Aadress (id)","Linnaosa","Õppekeel","Õpilaste arv","Email","Koduleht","Vabu kohti"];const i=plain.indexOf(label);if(i<0)return null;let tail=plain.slice(i+label.length).trim();let end=tail.length;for(const n of next){const p=tail.indexOf(n);if(p>=0&&p<end)end=p}return tail.slice(0,end).trim()||null};
const ownership=x=>{const s=(x||"").toLowerCase();if(s.includes("munitsipaal"))return"Munitsipaalkool";if(s.includes("riigi"))return"Riigikool";if(s.includes("era"))return"Erakool";return x||"Muu"};
const district=x=>(x||"").replace(/ linnaosa$/i,"").replace(/^Põhja-Tallinna$/,"Põhja-Tallinn")||null;
async function geocode(name,address){const qs=[`${address}, Tallinn, Eesti`,`${name}, Tallinn, Eesti`];for(const q of qs){if(!q||q.startsWith("null"))continue;const u=`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=3&countrycodes=ee&viewbox=24.47,59.58,24.97,59.30&bounded=1&q=${encodeURIComponent(q)}`;const r=await fetch(u,{headers:{"User-Agent":"Tallinna-koolide-kaart/2.0","Accept-Language":"et"}});if(r.ok){const a=await r.json();const h=a.find(x=>+x.lat>=59.30&&+x.lat<=59.58&&+x.lon>=24.47&&+x.lon<=24.97);if(h)return{lat:+h.lat,lon:+h.lon}}await sleep(1100)}return{lat:null,lon:null}}
const schools=[];
for(let id=1;id<=350;id++){
  const r=await fetch(`${BASE}/${id}/`,{headers:{"User-Agent":"Tallinna-koolide-kaart/2.0"}});
  if(!r.ok)continue;const html=await r.text();
  const title=clean(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]);
  const type=field(html,"Tüüp"), own=field(html,"Omandivorm"), address=field(html,"Aadress (id)"), dist=field(html,"Linnaosa");
  if(!title||!type||!own||!address||!dist)continue;
  if(!dist.toLowerCase().includes("linnaosa"))continue;
  const map=html.match(/https?:\/\/(?:www\.)?google\.com\/maps[^"'<\s]*?@(-?\d+\.\d+),(-?\d+\.\d+)/i);
  let coords=map?{lat:+map[1],lon:+map[2]}:{lat:null,lon:null};
  if(coords.lat==null)coords=await geocode(title,address);
  schools.push({id,name:title,type,ownership:ownership(own),ownershipRaw:own,address,district:district(dist),lat:coords.lat,lon:coords.lon,source:`${BASE}/${id}/`});
  console.log(`${schools.length}: ${title} | ${ownership(own)} | ${address}`);
  await sleep(150);
}
const unique=[...new Map(schools.map(x=>[`${x.name}|${x.address}`,x])).values()].sort((a,b)=>a.name.localeCompare(b.name,"et"));
await fs.mkdir("src/data",{recursive:true});await fs.writeFile("src/data/schools.json",JSON.stringify(unique,null,2)+"\n","utf8");
const count=unique.reduce((a,x)=>(a[x.ownership]=(a[x.ownership]||0)+1,a),{});console.log("Kokku",unique.length,count,"koordinaatideta",unique.filter(x=>x.lat==null).length);
