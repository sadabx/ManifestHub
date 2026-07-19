const fs = require("fs");
const path = require("path");

const rootDir = path.join(__dirname, "..");
const countsPath = path.join(rootDir, "data", "download-counts.json");
const trendingPath = path.join(rootDir, "data", "trending-data.json");
const statePath = path.join(rootDir, "data", "download-rollup-state.json");

const TOP_N = 50;
const PAGE_SIZE = 10000;
const args = new Set(process.argv.slice(2));

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function cleanGameName(name) {
  let cleaned = String(name || "Unknown Game").trim() || "Unknown Game";
  const patterns = [
    /\s*[-–]\s*(?:Full\s+)?Manifest\s*\([^)]*\)\s*$/i,
    /\s*[-–]\s*(?:Full\s+)?Manifest\s*$/i,
    /\s*\([^)]*manifest[^)]*\)\s*$/i,
    /\s*\(Live\)\s*$/i,
    /\s*[-–]\s*Lua\s+Keys?\s*$/i,
    /\s*[-–]\s*Lua\s+密钥\s*$/i,
    /\s*\(LUA\)\s*$/i,
    /\s*[-–]\s*(?:Full\s+)?ZIP(?:\s+Download)?\s*$/i,
    /\s*\([^)]*(?:full\s+)?zip(?:ped)?(?:\s+download)?[^)]*\)\s*$/i,
    /\s*[-–]\s*(?:Full\s+)?Legacy\s+Zip\s*$/i,
    /\s*\(Legacy\)\s*$/i,
  ];

  let changed = true;
  while (changed) {
    changed = false;
    for (const pattern of patterns) {
      const next = cleaned.replace(pattern, "").trim();
      if (next !== cleaned) {
        cleaned = next;
        changed = true;
      }
    }
  }
  return cleaned || "Unknown Game";
}

function normalizeCounts(raw) {
  const counts = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  for (const [mainAppId, item] of Object.entries(counts)) {
    item.mainAppId = String(item.mainAppId || mainAppId);
    item.gameName = cleanGameName(item.gameName);
    item.count = Number(item.count) || 0;
    item.includedAppIds = Array.from(
      new Set([...(item.includedAppIds || []), item.mainAppId].map(String)),
    );
  }
  return counts;
}

function buildAliasMap(counts) {
  const aliasMap = new Map();
  for (const item of Object.values(counts)) {
    for (const appId of item.includedAppIds || []) {
      aliasMap.set(String(appId), item.mainAppId);
    }
  }
  return aliasMap;
}

function buildNameMap(counts) {
  const nameMap = new Map();
  for (const item of Object.values(counts)) {
    if (item.gameName && item.gameName !== "Unknown Game") {
      nameMap.set(item.gameName, item.mainAppId);
    }
  }
  return nameMap;
}

function resolveLocalParent(rawName, nameMap) {
  if (!rawName || rawName === "Unknown Game") return null;

  for (const separator of [": ", " - "]) {
    const index = rawName.indexOf(separator);
    if (index === -1) continue;

    const prefix = rawName.slice(0, index).trim();
    const numberedParent = /(?:\d+|[IVX]{2,})$/.test(prefix);
    if (numberedParent && nameMap.has(prefix)) {
      return {
        mainAppId: nameMap.get(prefix),
        gameName: prefix,
      };
    }
  }

  return null;
}

function buildTrending(counts) {
  return Object.values(counts)
    .map((item) => ({
      appId: String(item.mainAppId),
      gameName: item.gameName || "Unknown Game",
      count: Number(item.count) || 0,
    }))
    .sort((a, b) => b.count - a.count || a.gameName.localeCompare(b.gameName))
    .slice(0, TOP_N);
}

function getSupabaseConfig() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }
  return {
    supabaseUrl: supabaseUrl.replace(/\/$/, ""),
    serviceKey,
  };
}

async function supabaseFetch(pathname, options = {}) {
  const { supabaseUrl, serviceKey } = getSupabaseConfig();
  const response = await fetch(`${supabaseUrl}${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Supabase ${response.status}: ${body}`);
  }

  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function fetchEvents(processedAfter, processedUntil) {
  const events = [];
  let offset = 0;

  while (true) {
    const params = new URLSearchParams({
      select: "id,app_id,game_name,download_type,created_at",
      created_at: `lte.${processedUntil}`,
      order: "created_at.asc,id.asc",
      limit: String(PAGE_SIZE),
      offset: String(offset),
    });
    if (processedAfter) params.append("created_at", `gt.${processedAfter}`);

    const page = await supabaseFetch(`/rest/v1/download_events?${params.toString()}`);
    if (!Array.isArray(page) || page.length === 0) break;

    events.push(...page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return events;
}

function applyEvents(counts, events) {
  const aliasMap = buildAliasMap(counts);
  const nameMap = buildNameMap(counts);

  for (const event of events) {
    const downloadedAppId = String(event.app_id || "").trim();
    if (!downloadedAppId) continue;

    const rawName = cleanGameName(event.game_name);
    const existingMainAppId = aliasMap.get(downloadedAppId);
    const localParent = existingMainAppId ? null : resolveLocalParent(rawName, nameMap);
    const mainAppId = existingMainAppId || localParent?.mainAppId || downloadedAppId;
    aliasMap.set(downloadedAppId, mainAppId);

    if (!counts[mainAppId]) {
      counts[mainAppId] = {
        mainAppId,
        gameName: localParent?.gameName || rawName,
        count: 0,
        includedAppIds: [downloadedAppId],
      };
      if (counts[mainAppId].gameName !== "Unknown Game") {
        nameMap.set(counts[mainAppId].gameName, mainAppId);
      }
    }

    const item = counts[mainAppId];
    item.count = (Number(item.count) || 0) + 1;
    item.includedAppIds = Array.from(
      new Set([...(item.includedAppIds || []), downloadedAppId].map(String)),
    );

    if ((!item.gameName || item.gameName === "Unknown Game") && rawName !== "Unknown Game") {
      item.gameName = rawName;
    }
  }
}

async function updateFromSupabase() {
  const counts = normalizeCounts(readJson(countsPath, {}));
  const state = readJson(statePath, {});
  const processedAfter = state.processedUntil || null;
  const processedUntil = new Date().toISOString();
  const events = await fetchEvents(processedAfter, processedUntil);

  if (events.length === 0) {
    console.log("No new Supabase download events to process.");
    return;
  }

  applyEvents(counts, events);

  writeJson(countsPath, counts);
  writeJson(trendingPath, buildTrending(counts));
  writeJson(statePath, {
    processedUntil,
    previousProcessedUntil: processedAfter,
    processedEventCount: events.length,
    updatedAt: new Date().toISOString(),
  });

  console.log(`Processed ${events.length} Supabase download event(s).`);
  console.log(`Updated ${path.relative(rootDir, countsPath)}.`);
  console.log(`Updated ${path.relative(rootDir, trendingPath)}.`);
}

async function cleanupProcessedEvents() {
  const state = readJson(statePath, {});
  if (!state.processedUntil) {
    console.log("No processedUntil state found; skipping cleanup.");
    return;
  }

  const params = new URLSearchParams({
    created_at: `lte.${state.processedUntil}`,
  });
  await supabaseFetch(`/rest/v1/download_events?${params.toString()}`, {
    method: "DELETE",
    headers: {
      Prefer: "return=minimal",
    },
  });

  console.log(`Deleted Supabase download_events through ${state.processedUntil}.`);
}

function generateTrendingOnly() {
  const counts = normalizeCounts(readJson(countsPath, {}));
  writeJson(trendingPath, buildTrending(counts));
  console.log(`Updated ${path.relative(rootDir, trendingPath)} from download counts.`);
}

if (args.has("--generate-trending-only")) {
  generateTrendingOnly();
} else if (args.has("--cleanup-processed")) {
  cleanupProcessedEvents().catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else {
  updateFromSupabase().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
