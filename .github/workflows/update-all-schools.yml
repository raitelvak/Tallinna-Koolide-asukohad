import fs from "node:fs/promises";
import { Agent, fetch, setGlobalDispatcher } from "undici";
import * as cheerio from "cheerio";

const BASE_URL = "https://teatmik.haridus.ee/koolid";
const FIRST_ID = 1;
const LAST_ID = 350;
const OUTPUT_FILE = "src/data/schools.json";
const FAILED_FILE = "src/data/failed-school-pages.json";

setGlobalDispatcher(
  new Agent({
    connect: { timeout: 60_000 },
    headersTimeout: 90_000,
    bodyTimeout: 90_000,
  })
);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchWithRetry(url, attempts = 4) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      console.log(`Päring ${attempt}/${attempts}: ${url}`);

      const response = await fetch(url, {
        headers: {
          "User-Agent": "Tallinna-koolide-kaart/3.0 (school directory updater)",
          "Accept-Language": "et-EE,et;q=0.9,en;q=0.5",
          Accept: "text/html,application/xhtml+xml",
        },
        signal: AbortSignal.timeout(90_000),
        redirect: "follow",
      });

      if (response.status === 404) return response;
      if (response.status === 429 || response.status >= 500) {
        throw new Error(`Ajutine HTTP viga ${response.status}`);
      }

      return response;
    } catch (error) {
      lastError = error;
      console.warn(`Katse ${attempt}/${attempts} ebaõnnestus: ${error.message}`);

      if (attempt < attempts) {
        await sleep(attempt * 5000);
      }
    }
  }

  throw lastError;
}

function normalizeSpace(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtmlText(html) {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg").remove();
  return normalizeSpace($("body").text());
}

function readBetween(text, label, nextLabels) {
  const start = text.indexOf(label);
  if (start < 0) return null;

  const tail = text.slice(start + label.length).trim();
  let end = tail.length;

  for (const nextLabel of nextLabels) {
    const position = tail.indexOf(nextLabel);
    if (position >= 0 && position < end) end = position;
  }

  return normalizeSpace(tail.slice(0, end)) || null;
}

const FIELD_LABELS = [
  "Registrikood",
  "Tüüp",
  "Omandivorm",
  "Aadress (id)",
  "Aadress",
  "Linnaosa",
  "Õppekeel",
  "Õpilaste arv",
  "Poisid",
  "Tüdrukud",
  "Email",
  "Koduleht",
  "Vabu kohti",
  "Endised nimed",
  "Kontaktandmed",
];

function field(text, label) {
  return readBetween(text, label, FIELD_LABELS.filter((item) => item !== label));
}

function extractTitle(html) {
  const $ = cheerio.load(html);
  return normalizeSpace($("h1").first().text()) || null;
}

function normalizeOwnership(value) {
  const text = normalizeSpace(value).toLowerCase();
  if (text.includes("munitsipaal")) return "Munitsipaalkool";
  if (text.includes("riigi")) return "Riigikool";
  if (text.includes("era")) return "Erakool";
  return "Muu";
}

function normalizeDistrict(value) {
  return normalizeSpace(value)
    .replace(/ linnaosa$/i, "")
    .replace(/^Põhja-Tallinna$/i, "Põhja-Tallinn") || null;
}

function extractGoogleCoordinates(html) {
  const patterns = [
    /google\.com\/maps[^"'<>\s]*?@(-?\d+\.\d+),(-?\d+\.\d+)/i,
    /maps\/place\/[^"'<>\s]*?\/\@(-?\d+\.\d+),(-?\d+\.\d+)/i,
    /[?&]query=(-?\d+\.\d+)%2C(-?\d+\.\d+)/i,
    /[?&]query=(-?\d+\.\d+),(-?\d+\.\d+)/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return { lat: Number(match[1]), lon: Number(match[2]) };
  }

  return null;
}

function isInTallinn(lat, lon) {
  return lat >= 59.30 && lat <= 59.58 && lon >= 24.47 && lon <= 24.97;
}

async function geocode(name, address) {
  const queries = [
    address ? `${address}, Tallinn, Eesti` : null,
    name ? `${name}, Tallinn, Eesti` : null,
  ].filter(Boolean);

  for (const query of queries) {
    const url =
      "https://nominatim.openstreetmap.org/search" +
      "?format=jsonv2&addressdetails=1&limit=5&countrycodes=ee" +
      "&viewbox=24.47,59.58,24.97,59.30&bounded=1" +
      `&q=${encodeURIComponent(query)}`;

    try {
      const response = await fetchWithRetry(url, 3);
      if (!response.ok) continue;

      const results = await response.json();
      const hit = results.find((item) =>
        isInTallinn(Number(item.lat), Number(item.lon))
      );

      if (hit) {
        return { lat: Number(hit.lat), lon: Number(hit.lon) };
      }
    } catch (error) {
      console.warn(`Geokodeerimine ebaõnnestus: ${query}: ${error.message}`);
    }

    await sleep(1200);
  }

  return { lat: null, lon: null };
}

const schools = [];
const failedPages = [];

for (let id = FIRST_ID; id <= LAST_ID; id += 1) {
  const url = `${BASE_URL}/${id}/`;

  try {
    const response = await fetchWithRetry(url, 4);
    if (response.status === 404 || !response.ok) continue;

    const html = await response.text();
    const text = decodeHtmlText(html);
    const name = extractTitle(html);

    const registrationCode = field(text, "Registrikood");
    const type = field(text, "Tüüp");
    const ownershipRaw = field(text, "Omandivorm");
    const address = field(text, "Aadress (id)") || field(text, "Aadress");
    const districtRaw = field(text, "Linnaosa");

    // Detaillehe tunnused. Mitte-koolide, tühjade ja ümbersuunatud lehtede vahelejätmine.
    if (!name || !type || !ownershipRaw || !address || !districtRaw) continue;
    if (!districtRaw.toLowerCase().includes("linnaosa")) continue;
    if (!text.includes("Registrikood") || !text.includes("Omandivorm")) continue;

    let coordinates = extractGoogleCoordinates(html);
    if (!coordinates || !isInTallinn(coordinates.lat, coordinates.lon)) {
      coordinates = await geocode(name, address);
    }

    const school = {
      id,
      registrationCode,
      name,
      type,
      ownership: normalizeOwnership(ownershipRaw),
      ownershipRaw,
      address,
      district: normalizeDistrict(districtRaw),
      lat: coordinates.lat,
      lon: coordinates.lon,
      source: url,
    };

    schools.push(school);
    console.log(
      `LEITUD ${schools.length}: ${school.name} | ${school.ownership} | ${school.address}`
    );

    await sleep(250);
  } catch (error) {
    failedPages.push({ id, url, error: error.message });
    console.warn(`Leht ${id} jäeti vahele: ${error.message}`);
    await sleep(1500);
  }
}

const uniqueSchools = [
  ...new Map(
    schools.map((school) => [
      school.registrationCode || `${school.name}|${school.address}`,
      school,
    ])
  ).values(),
].sort((a, b) => a.name.localeCompare(b.name, "et"));

await fs.mkdir("src/data", { recursive: true });

if (uniqueSchools.length === 0) {
  throw new Error(
    "Ühtegi kooli ei parsitud. Haridusameti lehestruktuur võis muutuda. Olemasolevat schools.json faili ei kirjutatud üle."
  );
}

await fs.writeFile(
  OUTPUT_FILE,
  JSON.stringify(uniqueSchools, null, 2) + "\n",
  "utf8"
);

await fs.writeFile(
  FAILED_FILE,
  JSON.stringify(failedPages, null, 2) + "\n",
  "utf8"
);

const ownershipCounts = uniqueSchools.reduce((counts, school) => {
  counts[school.ownership] = (counts[school.ownership] || 0) + 1;
  return counts;
}, {});

const missingCoordinates = uniqueSchools.filter(
  (school) => school.lat === null || school.lon === null
);

console.log("\n=== KOKKUVÕTE ===");
console.log(`Kokku koole: ${uniqueSchools.length}`);
console.log("Omandivormid:", ownershipCounts);
console.log(`Koordinaatideta: ${missingCoordinates.length}`);
console.log(`Võrgutõrke tõttu vahele jäetud lehti: ${failedPages.length}`);

if (missingCoordinates.length > 0) {
  console.log("Koordinaatideta koolid:");
  for (const school of missingCoordinates) console.log(`- ${school.name}: ${school.address}`);
}
