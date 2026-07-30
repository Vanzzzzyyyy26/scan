/**
 * Client-side safeguard: never show a crop-disease label (e.g. Tomato blight)
 * when it does not belong to the identified plant.
 *
 * Server already gates this; this is defense-in-depth for stale responses / bugs.
 */

const TOMATO_HINTS = ["tomato", "kamatis", "lycopersicum", "lycopersicon"];

function norm(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function plantBlob(plant = {}) {
  return norm(
    [
      plant.commonName,
      plant.commonNameFilipino,
      plant.scientificName,
      ...(Array.isArray(plant.commonNames) ? plant.commonNames : []),
    ]
      .filter(Boolean)
      .join(" ")
  );
}

function plantLooksLikeTomato(plant = {}) {
  const blob = plantBlob(plant);
  if (!blob) return false;
  return TOMATO_HINTS.some((hint) => {
    if (hint.includes(" ")) return blob.includes(hint);
    const re = new RegExp(`(?:^|\\s)${hint.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s|$)`);
    return re.test(blob);
  });
}

/**
 * If disease claims a tomato (or generic mismatched) crop on a non-tomato plant,
 * convert to a safe not_covered-style view model for the UI.
 */
export function sanitizeDiseaseForPlant(disease, plant) {
  if (!disease || typeof disease !== "object") return disease;

  const status = String(disease.status || "").toLowerCase();
  if (
    status === "not_covered" ||
    status === "unavailable" ||
    status === "uncertain"
  ) {
    // Still block tomato-branded names leaking into uncertain cards
    if (status === "uncertain" && looksLikeTomatoDiseaseLabel(disease) && !plantLooksLikeTomato(plant)) {
      return notCoveredView(plant, disease);
    }
    return disease;
  }

  if (looksLikeTomatoDiseaseLabel(disease) && !plantLooksLikeTomato(plant)) {
    return notCoveredView(plant, disease);
  }

  // Generic: cropHint present but plant has no overlapping token with cropHint
  const cropHint = norm(disease.cropHint || "");
  if (cropHint && status === "diseased") {
    const blob = plantBlob(plant);
    const cropInPlant =
      blob.includes(cropHint) ||
      (cropHint === "tomato" && plantLooksLikeTomato(plant)) ||
      (cropHint === "potato" && /\b(potato|patatas|tuberosum)\b/.test(blob)) ||
      (cropHint === "pepper" && /\b(pepper|sili|capsicum)\b/.test(blob)) ||
      (cropHint === "apple" && /\b(apple|mansanas|malus)\b/.test(blob)) ||
      (cropHint === "corn" && /\b(corn|maize|mais|zea mays)\b/.test(blob)) ||
      (cropHint === "grape" && /\b(grape|ubas|vitis)\b/.test(blob)) ||
      (cropHint === "orange" && /\b(orange|dalandan|kahel|citrus)\b/.test(blob));

    // If we know the crop key and it clearly isn't this plant, hide diagnosis
    const knownCrops = [
      "tomato",
      "potato",
      "pepper",
      "apple",
      "corn",
      "grape",
      "orange",
      "peach",
      "squash",
      "strawberry",
      "blueberry",
      "cherry",
      "raspberry",
      "soybean",
    ];
    if (knownCrops.includes(cropHint) && !cropInPlant) {
      return notCoveredView(plant, disease);
    }
  }

  return disease;
}

function looksLikeTomatoDiseaseLabel(disease = {}) {
  const text = norm(
    [disease.cropHint, disease.name, disease.condition, disease.summary]
      .filter(Boolean)
      .join(" ")
  );
  if (!text) return false;
  // "tomato: early blight", cropHint tomato, or raw model style
  if (/\btomato\b/.test(text)) return true;
  if (/\bkamatis\b/.test(text)) return true;
  if (norm(disease.cropHint) === "tomato") return true;
  return false;
}

function notCoveredView(plant, disease) {
  const plantLabel =
    plant?.commonName || plant?.scientificName || "ang natukoy na halaman";
  return {
    status: "not_covered",
    severity: "unknown",
    isHealthy: null,
    name: "",
    condition: "",
    cropHint: "",
    confidence: 0,
    cropMatched: false,
    summary:
      `Ang disease checker ay hindi maglalabas ng sakit ng kamatis para sa ${plantLabel}. ` +
      `Sakop lang ang ilang pananim (kamatis, patatas, sili, mansanas, atbp.).`,
    advice:
      disease?.advice ||
      "Para sa ornamental o ibang halaman: alisin ang apektadong dahon, iwasan ang basang dahon sa gabi, at sapat na liwanag.",
    alternatives: [],
    provider: disease?.provider || "client-guard",
  };
}
