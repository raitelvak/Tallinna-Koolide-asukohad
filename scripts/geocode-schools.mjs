import fs from "node:fs/promises";
const input = JSON.parse(await fs.readFile("src/data/schools-roster.json", "utf8"));
const out = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const districtMap = {
  "Kesklinna linnaosa":"Kesklinn", "Põhja-Tallinna linnaosa":"Põhja-Tallinn",
  "Lasnamäe linnaosa":"Lasnamäe", "Mustamäe linnaosa":"Mustamäe",
  "Haabersti linnaosa":"Haabersti", "Nõmme linnaosa":"Nõmme",
  "Kristiine linnaosa":"Kristiine", "Pirita linnaosa":"Pirita"
};
for (const school of input) {
  const query = `${school.name}, Tallinn, Eesti`;
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&namedetails=1&limit=5&countrycodes=ee&viewbox=24.47,59.58,24.97,59.30&bounded=1&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {headers:{"User-Agent":"Tallinna-koolide-kaart/1.0 (GitHub Pages)","Accept-Language":"et"}});
  if (!res.ok) throw new Error(`${school.name}: HTTP ${res.status}`);
  const hits = await res.json();
  const hit = hits.find(x => Number(x.lat)>=59.30 && Number(x.lat)<=59.58 && Number(x.lon)>=24.47 && Number(x.lon)<=24.97) || hits[0];
  if (!hit) { console.warn(`EI LEITUD: ${school.name}`); out.push(school); await sleep(1100); continue; }
  const a=hit.address||{};
  const road=a.road||a.pedestrian||a.residential||a.neighbourhood||"";
  const number=a.house_number||"";
  const districtRaw=a.city_district||a.suburb||"";
  out.push({...school,address:[road,number].filter(Boolean).join(" ")||hit.display_name.split(",")[0],district:districtMap[districtRaw]||districtRaw||null,lat:Number(hit.lat),lon:Number(hit.lon),geocodedAt:new Date().toISOString(),geocoder:"OpenStreetMap Nominatim"});
  console.log(`${out.length}/${input.length} ${school.name}`);
  await sleep(1100);
}
await fs.writeFile("src/data/schools.json", JSON.stringify(out,null,2)+"\n", "utf8");
const missing=out.filter(x=>x.lat==null||x.lon==null||!x.address);
console.log(`Valmis: ${out.length}; kontrollimist vajab: ${missing.length}`);
if(missing.length) process.exitCode=2;
