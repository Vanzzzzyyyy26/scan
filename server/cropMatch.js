/**
 * PlantVillage disease model only knows specific food crops.
 * It often returns Tomato_* even for unrelated leaves — crop gating is required.
 *
 * Rules:
 * - Match on common / scientific names only (never family alone).
 * - Tomato aliases must be specific (no bare "solanum").
 * - Disease cropHint must equal an allowed crop; never trust cropMatched alone.
 */

const DISEASE_CROP_ALIASES = {
  apple: ["apple", "mansanas", "malus domestica", "malus pumila"],
  blueberry: ["blueberry", "vaccinium corymbosum"],
  cherry: [
    "cherry",
    "seresa",
    "prunus cerasus",
    "prunus avium",
    "sweet cherry",
    "sour cherry",
  ],
  corn: ["corn", "maize", "mais", "zea mays"],
  grape: ["grape", "ubas", "vitis vinifera"],
  orange: [
    "orange",
    "dalandan",
    "kahel",
    "citrus sinensis",
    "citrus reticulata",
  ],
  peach: ["peach", "prunus persica"],
  pepper: [
    "bell pepper",
    "sweet pepper",
    "capsicum annuum",
    "chili pepper",
    "chilli pepper",
    "sili",
  ],
  potato: ["potato", "patatas", "solanum tuberosum"],
  raspberry: ["raspberry", "rubus idaeus"],
  soybean: ["soybean", "soya", "glycine max"],
  squash: ["squash", "kalabasa", "cucurbita pepo", "cucurbita moschata"],
  strawberry: ["strawberry", "fragaria ananassa", "fresa"],
  // Specific only — bare "solanum" would match potato/eggplant/talong.
  tomato: [
    "tomato",
    "kamatis",
    "solanum lycopersicum",
    "lycopersicon esculentum",
  ],
};

/** Minimum PlantNet score before we trust crop identity enough for disease labels. */
const MIN_DISEASE_PLANT_SCORE = 0.25;

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizePlantText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Searchable identity text — names only, never family. */
function buildPlantSearchBlob(plantInfo = {}) {
  return normalizePlantText(
    [
      plantInfo.commonName,
      plantInfo.commonNameFilipino,
      plantInfo.scientificName,
      ...(Array.isArray(plantInfo.commonNames) ? plantInfo.commonNames : []),
    ]
      .filter(Boolean)
      .join(" ")
  );
}

/**
 * Whole-phrase / whole-word match so apple ≠ pineapple, and short tokens
 * do not false-positive inside longer words.
 */
function blobHasAlias(plantBlob, alias) {
  const a = normalizePlantText(alias);
  if (!a || !plantBlob) return false;

  if (a.includes(" ")) {
    return plantBlob.includes(a);
  }

  const re = new RegExp(`(?:^|\\s)${escapeRegExp(a)}(?:\\s|$)`);
  return re.test(plantBlob);
}

/**
 * Which PlantVillage crop keys match this plant?
 * Empty = disease model must NOT diagnose (ornamental, tree, unknown crop).
 */
function matchingDiseaseCrops(plantInfo = {}) {
  const plantBlob = buildPlantSearchBlob(plantInfo);
  if (!plantBlob) return [];

  const matched = [];
  for (const [crop, aliases] of Object.entries(DISEASE_CROP_ALIASES)) {
    if (aliases.some((alias) => blobHasAlias(plantBlob, alias))) {
      matched.push(crop);
    }
  }
  return matched;
}

/**
 * True only when the disease-model crop key is one of the plant's allowed crops.
 * Uses exact crop key equality (after normalize) — no loose substring includes.
 */
function diseaseCropMatchesPlant(cropHint, plantInfo = {}) {
  const crop = normalizePlantText(cropHint);
  if (!crop) return false;

  const allowed = matchingDiseaseCrops(plantInfo);
  if (!allowed.length) return false;

  // Accept "tomato" or rare "tomato something" but NOT "potato".includes("to") style.
  return allowed.some(
    (allowedCrop) => crop === allowedCrop || crop.startsWith(`${allowedCrop} `)
  );
}

/**
 * Parse PlantVillage-style labels into crop + condition.
 */
function parseDiseaseLabel(raw) {
  const text = String(raw || "").trim();
  if (!text) {
    return { crop: "", condition: "Unknown", isHealthy: false, display: "Unknown" };
  }

  let crop = "";
  let condition = "";

  if (text.includes("___")) {
    const parts = text.split("___");
    crop = (parts[0] || "").replace(/_/g, " ").trim();
    condition = (parts[1] || "").replace(/_/g, " ").trim();
  } else if (text.includes(" - ")) {
    const parts = text.split(" - ");
    crop = (parts[0] || "").replace(/_/g, " ").trim();
    condition = parts.slice(1).join(" - ").replace(/_/g, " ").trim();
  } else {
    const normalized = text.replace(/_/g, " ").trim();
    const knownCrops = Object.keys(DISEASE_CROP_ALIASES);
    // Longest crop key first so "bell pepper" style keys win if added later
    const sorted = [...knownCrops].sort((a, b) => b.length - a.length);
    const matchedCrop = sorted.find((c) => {
      const re = new RegExp(`^${escapeRegExp(c)}\\b`, "i");
      return re.test(normalized);
    });
    if (matchedCrop) {
      crop = matchedCrop;
      condition = normalized.slice(matchedCrop.length).trim();
    } else {
      condition = normalized;
    }
  }

  const isHealthy = /healthy/i.test(condition) || /healthy/i.test(text);
  const cropNorm = normalizePlantText(crop);
  const display = cropNorm
    ? `${cropNorm}: ${condition || "unknown"}`
    : condition || text.replace(/_/g, " ");

  return {
    crop: cropNorm,
    condition: condition || "Unknown",
    isHealthy,
    display,
  };
}

/**
 * Human-facing disease title tied to the *identified plant*, not the model crop string.
 * Avoids "Tomato: Early blight" branding when we already verified crop match —
 * still OK for real tomato; for other crops uses plant common name.
 */
function formatDiseaseDisplayName(plantInfo = {}, condition = "", cropHint = "") {
  const plantLabel =
    plantInfo.commonName ||
    plantInfo.commonNameFilipino ||
    plantInfo.scientificName ||
    cropHint ||
    "Plant";
  const cond = String(condition || "").trim() || "unknown";
  return `${plantLabel}: ${cond}`;
}

/**
 * Final hard gate: drop any diseased/healthy result whose cropHint is not allowed
 * for this plant. Never trust disease.cropMatched alone.
 */
function assertDiseaseCropAllowed(disease, plantInfo = {}) {
  if (!disease || typeof disease !== "object") return disease;
  if (disease.status === "unavailable") return disease;
  if (disease.status === "not_covered") return disease;

  const allowed = matchingDiseaseCrops(plantInfo);
  if (!allowed.length) {
    return { reject: true, reason: "plant_not_covered" };
  }

  const cropHint = normalizePlantText(disease.cropHint || "");
  if (!cropHint || !diseaseCropMatchesPlant(cropHint, plantInfo)) {
    return { reject: true, reason: "crop_mismatch", cropHint, allowed };
  }

  return { reject: false, allowed, cropHint };
}

module.exports = {
  DISEASE_CROP_ALIASES,
  MIN_DISEASE_PLANT_SCORE,
  escapeRegExp,
  normalizePlantText,
  buildPlantSearchBlob,
  blobHasAlias,
  matchingDiseaseCrops,
  diseaseCropMatchesPlant,
  parseDiseaseLabel,
  formatDiseaseDisplayName,
  assertDiseaseCropAllowed,
};
