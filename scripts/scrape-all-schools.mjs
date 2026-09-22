import fs from "node:fs/promises";
import { Agent, fetch, setGlobalDispatcher } from "undici";

const BASE = "https://teatmik.haridus.ee/koolid";

setGlobalDispatcher(
  new Agent({
    connect: {
      timeout: 60_000,
    },
  })
);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchWithRetry(url, options = {}, attempts = 5) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      console.log(`Päring ${attempt}/${attempts}: ${url}`);

      const response = await fetch(url, {
        ...options,
        headers: {
          "User-Agent":
            "Tallinna-koolide-kaart/2.0 (GitHub Pages school directory)",
          "Accept-Language": "et",
          ...(options.headers || {}),
        },
        signal: AbortSignal.timeout(90_000),
      });

      if (response.status === 429 || response.status >= 500) {
        throw new Error(`Ajutine HTTP viga ${response.status}`);
      }

      return response;
    } catch (error) {
      lastError = error;

      console.warn(
        `Katse ${attempt}/${attempts} ebaõnnestus: ${error.message}`
      );

      if (attempt < attempts) {
        const waitTime = attempt * 10_000;
        console.log(`Ootan ${waitTime / 1000} sekundit...`);
        await sleep(waitTime);
      }
    }
  }

  throw lastError;
}

function clean(value) {
  return (
    value
      ?.replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&#039;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, " ")
      .trim() || null
  );
}

function field(html, label) {
  const plain = clean(html);

  const nextFields = [
    "Registrikood",
    "Tüüp",
    "Omandivorm",
    "Aadress (id)",
    "Linnaosa",
    "Õppekeel",
    "Õpilaste arv",
    "Email",
    "Koduleht",
    "Vabu kohti",
  ];

  const start = plain.indexOf(label);

  if (start < 0) {
    return null;
  }

  let tail = plain.slice(start + label.length).trim();
  let end = tail.length;

  for (const nextField of nextFields) {
    const position = tail.indexOf(nextField);

    if (position >= 0 && position < end) {
      end = position;
    }
  }

  return tail.slice(0, end).trim() || null;
}

function normalizeOwnership(value) {
  const normalized = (value || "").toLowerCase();

  if (normalized.includes("munitsipaal")) {
    return "Munitsipaalkool";
  }

  if (normalized.includes("riigi")) {
    return "Riigikool";
  }

  if (normalized.includes("era")) {
    return "Erakool";
  }

  return value || "Muu";
}

function normalizeDistrict(value) {
  return (
    (value || "")
      .replace(/ linnaosa$/i, "")
      .replace(/^Põhja-Tallinna$/, "Põhja-Tallinn") || null
  );
}

async function geocode(name, address) {
  const queries = [
    `${address}, Tallinn, Eesti`,
    `${name}, Tallinn, Eesti`,
  ];

  for (const query of queries) {
    if (!query || query.startsWith("null")) {
      continue;
    }

    const url =
      "https://nominatim.openstreetmap.org/search" +
      "?format=jsonv2" +
      "&limit=3" +
      "&countrycodes=ee" +
      "&viewbox=24.47,59.58,24.97,59.30" +
      "&bounded=1" +
      `&q=${encodeURIComponent(query)}`;

    try {
      const response = await fetchWithRetry(url, {}, 3);

      if (response.ok) {
        const results = await response.json();

        const hit = results.find(
          (item) =>
            Number(item.lat) >= 59.3 &&
            Number(item.lat) <= 59.58 &&
            Number(item.lon) >= 24.47 &&
            Number(item.lon) <= 24.97
        );

        if (hit) {
          return {
            lat: Number(hit.lat),
            lon: Number(hit.lon),
          };
        }
      }
    } catch (error) {
      console.warn(`Geokodeerimine ebaõnnestus: ${query}`);
    }

    await sleep(1200);
  }

  return {
    lat: null,
    lon: null,
  };
}

const schools = [];
const failedPages = [];

for (let id = 1; id <= 350; id += 1) {
  try {
    const response = await fetchWithRetry(`${BASE}/${id}/`, {}, 4);

    if (!response.ok) {
      continue;
    }

    const html = await response.text();

    const title = clean(
      html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]
    );

    const type = field(html, "Tüüp");
    const ownershipRaw = field(html, "Omandivorm");
    const address = field(html, "Aadress (id)");
    const districtRaw = field(html, "Linnaosa");

    if (
      !title ||
      !type ||
      !ownershipRaw ||
      !address ||
      !districtRaw
    ) {
      continue;
    }

    if (!districtRaw.toLowerCase().includes("linnaosa")) {
      continue;
    }

    const mapMatch = html.match(
      /https?:\/\/(?:www\.)?google\.com\/maps[^"'<\s]*?@(-?\d+\.\d+),(-?\d+\.\d+)/i
    );

    let coordinates = mapMatch
      ? {
          lat: Number(mapMatch[1]),
          lon: Number(mapMatch[2]),
        }
      : {
          lat: null,
          lon: null,
        };

    if (coordinates.lat === null) {
      coordinates = await geocode(title, address);
    }

    const school = {
      id,
      name: title,
      type,
      ownership: normalizeOwnership(ownershipRaw),
      ownershipRaw,
      address,
      district: normalizeDistrict(districtRaw),
      lat: coordinates.lat,
      lon: coordinates.lon,
      source: `${BASE}/${id}/`,
    };

    schools.push(school);

    console.log(
      `${schools.length}: ${school.name} | ` +
      `${school.ownership} | ${school.address}`
    );

    await sleep(300);
  } catch (error) {
    failedPages.push({
      id,
      url: `${BASE}/${id}/`,
      error: error.message,
    });

    console.warn(
      `Leht ${id} jäeti pärast korduskatseid vahele: ${error.message}`
    );

    await sleep(2000);
  }
}

const uniqueSchools = [
  ...new Map(
    schools.map((school) => [
      `${school.name}|${school.address}`,
      school,
    ])
  ).values(),
].sort((a, b) => a.name.localeCompare(b.name, "et"));

await fs.mkdir("src/data", {
  recursive: true,
});

await fs.writeFile(
  "src/data/schools.json",
  JSON.stringify(uniqueSchools, null, 2) + "\n",
  "utf8"
);

await fs.writeFile(
  "src/data/failed-school-pages.json",
  JSON.stringify(failedPages, null, 2) + "\n",
  "utf8"
);

const ownershipCounts = uniqueSchools.reduce((counts, school) => {
  counts[school.ownership] =
    (counts[school.ownership] || 0) + 1;

  return counts;
}, {});

console.log("Kokku:", uniqueSchools.length);
console.log("Omandivormid:", ownershipCounts);
console.log(
  "Koordinaatideta:",
  uniqueSchools.filter(
    (school) => school.lat === null || school.lon === null
  ).length
);
console.log(
  "Võrgutõrke tõttu vahele jäetud lehti:",
  failedPages.length
);

if (uniqueSchools.length === 0) {
  throw new Error(
    "Ühtegi kooli ei leitud. Haridusameti server ei olnud kättesaadav."
  );
}
