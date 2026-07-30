const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const {
  MIN_DISEASE_PLANT_SCORE,
  normalizePlantText,
  matchingDiseaseCrops,
  diseaseCropMatchesPlant,
  parseDiseaseLabel,
  formatDiseaseDisplayName,
  assertDiseaseCropAllowed,
} = require("./cropMatch");

const app = express();
const PORT = process.env.PORT || 5000;
const PLANTNET_KEY = process.env.PLANTNET_API_KEY || "";
const PLANTNET_PROJECT = process.env.PLANTNET_PROJECT || "all";
const HF_TOKEN = process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY || "";

/**
 * PlantNet often still returns a low-score "best guess" plant for non-plants
 * (people, cars, objects). Below this score we treat the image as NOT a plant/tree.
 * Typical real plant photos score ~0.20–0.90; random objects often score <0.10–0.15.
 */
const MIN_PLANT_SCORE = Number(process.env.MIN_PLANT_SCORE || 0.15);

// PlantVillage-trained leaf disease classifier (Hugging Face)
// Heavily tomato-biased (~10/38 classes) — crop gating is mandatory.
const DISEASE_MODEL =
  process.env.DISEASE_MODEL ||
  "linkanjarad/mobilenet_v2_1.0_224-plant-disease-identification";

app.use(cors());
app.use(express.json({ limit: "15mb" }));

function scoreToConfidence(score) {
  if (score >= 0.5) return "high";
  if (score >= 0.25) return "medium";
  return "low";
}

function dataUrlToBuffer(dataUrl) {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s.exec(dataUrl);
  if (!match) {
    throw new Error("Image must be a data URL starting with data:image/...");
  }
  return {
    mime: match[1].toLowerCase(),
    buffer: Buffer.from(match[2], "base64"),
  };
}

function notAPlantResult(notes) {
  return {
    isPlant: false,
    commonName: "Hindi halaman o puno",
    commonNameFilipino: "",
    scientificName: "",
    family: "",
    description:
      "Ang larawang ito ay hindi mukhang halaman o puno. Mag-upload o kumuha ng malinaw na larawan ng dahon, sanga, bulaklak, prutas, o puno.",
    origin: "",
    habitat: "",
    interestingFacts: [],
    confidence: "low",
    notes:
      notes ||
      "Hindi tinanggap bilang halaman/puno. Subukan ulit gamit ang larawan ng halaman.",
    provider: "plantnet",
    score: 0,
    disease: null,
  };
}

async function fetchWikiSummary(title, lang = "en") {
  if (!title) return null;
  const encoded = encodeURIComponent(title.replace(/ /g, "_"));
  const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encoded}`;
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "PlantScanner/1.0 (local educational app)",
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.type === "disambiguation" || !data.extract) return null;
    return {
      title: data.title,
      description: data.extract,
      url: data.content_urls?.desktop?.page || null,
    };
  } catch {
    return null;
  }
}

async function enrichFromWikipedia(scientificName, commonName) {
  const en =
    (await fetchWikiSummary(scientificName, "en")) ||
    (await fetchWikiSummary(commonName, "en"));
  const tl =
    (await fetchWikiSummary(scientificName, "tl")) ||
    (await fetchWikiSummary(commonName, "tl"));

  return {
    description: en?.description || tl?.description || "",
    commonNameFilipino: tl?.title && tl.title !== scientificName ? tl.title : "",
    wikiUrl: en?.url || tl?.url || null,
  };
}

function notCoveredDiseaseResult(plantInfo = {}, rawGuess = "") {
  const plantLabel =
    plantInfo.commonName ||
    plantInfo.scientificName ||
    "ang natukoy na halaman";
  const coveredList = "kamatis, patatas, sili, mansanas, mais, ubas, atbp.";

  return {
    status: "not_covered",
    severity: "unknown",
    isHealthy: null,
    name: "",
    condition: "",
    cropHint: "",
    confidence: 0,
    cropMatched: false,
    // Kept for debugging only — UI must not show this as a diagnosis
    rawModelGuess: rawGuess || undefined,
    summary:
      `Ang leaf disease checker ay para lang sa ilang pananim (${coveredList}). ` +
      `Hindi sakop ang ${plantLabel}, kaya walang crop-disease diagnosis ` +
      `(hal. hindi kami maglalabas ng sakit ng kamatis/"Tomato blight" para sa ibang halaman).`,
    advice:
      "Kung may brown, yellow, o tuyong dahon: alisin ang apektadong dahon, iwasan ang sobrang basang lupa, " +
      "sapat na liwanag, at huwag diligan ang dahon sa gabi. Para sa ornamental/houseplant o puno, " +
      "mas maganda ang general care o tanong sa local garden center — huwag umasa sa crop-disease label.",
    alternatives: [],
    provider: "huggingface",
    model: DISEASE_MODEL,
  };
}

function lowConfidencePlantDiseaseResult(plantInfo = {}, score = 0) {
  const pct = Math.round(Number(score) * 100);
  return {
    status: "uncertain",
    severity: "unknown",
    isHealthy: null,
    name: "",
    condition: "",
    cropHint: "",
    confidence: 0,
    cropMatched: false,
    summary:
      `Medyo mababa ang confidence sa pagkilala ng halaman (${pct}%), ` +
      `kaya hindi namin ibinibigay ang disease label — madalas kasi magkamali ang model (hal. Tomato blight sa ibang dahon).`,
    advice:
      "Kumuha ng mas malinaw / mas malapit na larawan ng dahon o bulaklak, tapos i-scan ulit. " +
      "Kapag sigurado na ang species, saka reliable ang disease check.",
    alternatives: [],
    provider: "huggingface",
    model: DISEASE_MODEL,
  };
}

/**
 * Reconcile raw disease-model output with the actual plant species.
 * NEVER trust disease.cropMatched alone — always re-check cropHint vs plant.
 * Drops Tomato_* (and any other crop) when the plant is not that crop.
 */
function reconcileDiseaseWithPlant(disease, plantInfo = {}) {
  if (!disease || typeof disease !== "object") return disease;

  if (disease.status === "unavailable") return disease;
  if (disease.status === "not_covered") return disease;
  // Uncertain without a crop claim is fine (e.g. low plant score gate)
  if (disease.status === "uncertain" && !disease.cropHint && !disease.name) {
    return disease;
  }

  const gate = assertDiseaseCropAllowed(disease, plantInfo);
  if (gate.reject) {
    return notCoveredDiseaseResult(
      plantInfo,
      disease.name || disease.condition || disease.cropHint || gate.cropHint || ""
    );
  }

  // Rewrite display so UI shows identified plant + condition (not raw model crop branding)
  const condition = disease.condition || disease.name || "";
  return {
    ...disease,
    cropMatched: true,
    cropHint: gate.cropHint,
    name: formatDiseaseDisplayName(plantInfo, condition, gate.cropHint),
  };
}

/**
 * Detect leaf/plant diseases using a free Hugging Face image classifier.
 * plantInfo (from PlantNet) is required to filter out wrong-crop guesses
 * (e.g. Tomato Late Blight on Aglaonema / mango / any non-tomato).
 *
 * @param {number} [plantScore] PlantNet identity score — low scores skip disease labels
 */
async function detectPlantDisease(imageBuffer, mime, plantInfo = {}, plantScore = 1) {
  // Gate 1: weak plant ID → do not invent crop diseases (often Tomato_*)
  if (Number(plantScore) < MIN_DISEASE_PLANT_SCORE) {
    return lowConfidencePlantDiseaseResult(plantInfo, plantScore);
  }

  // Gate 2: PlantVillage only knows specific crops. Skip HF entirely otherwise.
  // Without this, non-tomato leaves often get "Tomato___Late_blight" at 90%+.
  const allowedCrops = matchingDiseaseCrops(plantInfo);
  if (!allowedCrops.length) {
    return notCoveredDiseaseResult(plantInfo);
  }

  const endpoints = [
    `https://router.huggingface.co/hf-inference/models/${DISEASE_MODEL}`,
    `https://api-inference.huggingface.co/models/${DISEASE_MODEL}`,
  ];

  const headers = {
    Accept: "application/json",
    "Content-Type": mime || "application/octet-stream",
    "x-wait-for-model": "true",
  };
  if (HF_TOKEN) {
    headers.Authorization = `Bearer ${HF_TOKEN}`;
  }

  let lastError = null;

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: imageBuffer,
      });

      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        lastError = `Non-JSON from disease model (${res.status})`;
        continue;
      }

      if (!res.ok) {
        lastError =
          data?.error ||
          data?.message ||
          `Disease API error (${res.status})`;
        if (res.status === 503 && data?.estimated_time) {
          const waitMs = Math.min(
            8000,
            Math.ceil(Number(data.estimated_time) * 1000) || 3000
          );
          await new Promise((r) => setTimeout(r, waitMs));
          const retry = await fetch(url, {
            method: "POST",
            headers,
            body: imageBuffer,
          });
          const retryText = await retry.text();
          try {
            data = JSON.parse(retryText);
            if (!retry.ok) {
              lastError = data?.error || `Disease API error (${retry.status})`;
              continue;
            }
          } catch {
            continue;
          }
        } else {
          continue;
        }
      }

      const predictions = Array.isArray(data)
        ? data
        : Array.isArray(data?.[0])
          ? data[0]
          : null;

      if (!predictions || !predictions.length) {
        lastError = data?.error || "No disease predictions";
        continue;
      }

      const ranked = predictions
        .map((p) => ({
          label: p.label || p.class || "",
          score: typeof p.score === "number" ? p.score : 0,
        }))
        .filter((p) => p.label)
        .sort((a, b) => b.score - a.score);

      if (!ranked.length) {
        lastError = "Empty disease labels";
        continue;
      }

      // Gate 3: keep ONLY labels for this plant's crop(s).
      // Drops Tomato_* when plant is potato, mango, aglaonema, etc.
      const cropFiltered = ranked.filter((p) => {
        const parsed = parseDiseaseLabel(p.label);
        if (!parsed.crop) return false;
        return allowedCrops.some(
          (c) => parsed.crop === c || parsed.crop.startsWith(`${c} `)
        );
      });

      if (!cropFiltered.length) {
        // Classic false positive: model only offered other crops (often all Tomato_*)
        return notCoveredDiseaseResult(
          plantInfo,
          parseDiseaseLabel(ranked[0].label).display
        );
      }

      const best = cropFiltered[0];
      const parsed = parseDiseaseLabel(best.label);

      // Gate 4: cropHint must still be in allowedCrops (belt + suspenders)
      const cropAllowed =
        parsed.crop &&
        (allowedCrops.includes(parsed.crop) ||
          allowedCrops.some((c) => parsed.crop.startsWith(`${c} `)));
      if (!cropAllowed) {
        return notCoveredDiseaseResult(plantInfo, parsed.display);
      }

      const confidencePct = Math.round(best.score * 100);
      const uncertain = best.score < 0.25;

      let status;
      let summary;
      let severity;

      if (uncertain) {
        status = "uncertain";
        severity = "unknown";
        summary =
          "Hindi sigurado ang disease model sa larawang ito. Subukan ang mas malapit na close-up ng dahon (harap at likod).";
      } else if (parsed.isHealthy) {
        status = "healthy";
        severity = "none";
        summary =
          "Mukhang malusog ang halaman base sa leaf disease model. Walang malinaw na sintomas ng sakit.";
      } else {
        status = "diseased";
        severity =
          best.score >= 0.6 ? "high" : best.score >= 0.4 ? "medium" : "low";
        summary = `Posibleng may sakit: ${parsed.condition}. Confidence: ${confidencePct}%.`;
      }

      const alternatives = cropFiltered.slice(1, 4).map((p) => {
        const alt = parseDiseaseLabel(p.label);
        return {
          name: formatDiseaseDisplayName(
            plantInfo,
            alt.condition,
            alt.crop
          ),
          condition: alt.condition,
          cropHint: alt.crop,
          isHealthy: alt.isHealthy,
          confidence: Math.round(p.score * 100),
        };
      });

      return {
        status,
        severity,
        isHealthy: parsed.isHealthy && !uncertain,
        // Use identified plant name — never brand a non-tomato as "Tomato: …"
        name: formatDiseaseDisplayName(
          plantInfo,
          parsed.condition,
          parsed.crop
        ),
        condition: parsed.condition,
        cropHint: parsed.crop || "",
        confidence: confidencePct,
        cropMatched: true,
        allowedCrops,
        summary,
        advice:
          status === "diseased"
            ? "Alisin ang mga apektadong dahon kung maaari, iwasan ang sobrang basang lupa, at huwag diligan ang dahon sa gabi. Kung malala, kumonsulta sa local agri extension o garden center."
            : status === "healthy"
              ? "Panatilihing malinis ang dahon, sapat ang liwanag, at wasto ang pagdidilig."
              : "Kumuha ng mas malinaw na larawan ng apektadong dahon para sa mas tiyak na resulta.",
        alternatives,
        provider: "huggingface",
        model: DISEASE_MODEL,
      };
    } catch (err) {
      lastError = err?.message || String(err);
    }
  }

  const needsTokenHint = !HF_TOKEN;
  return {
    status: "unavailable",
    severity: "unknown",
    isHealthy: null,
    name: "",
    condition: "",
    cropHint: "",
    confidence: 0,
    summary:
      "Hindi available ang disease checker sa ngayon. Natukoy pa rin ang halaman, pero hindi nasuri ang sakit.",
    advice: needsTokenHint
      ? "Magdagdag ng free HF_TOKEN sa server/.env (https://huggingface.co/settings/tokens — Read token), i-restart ang server, tapos i-scan ulit."
      : "May HF_TOKEN na, pero offline/rate-limited ang disease model. Subukan ulit after a few minutes, o i-check ang token sa Hugging Face.",
    alternatives: [],
    provider: "huggingface",
    model: DISEASE_MODEL,
    error: lastError,
  };
}

async function identifyWithPlantNet(imageDataUrl) {
  if (!PLANTNET_KEY) {
    throw new Error(
      "Missing PLANTNET_API_KEY. Get a FREE key at https://my.plantnet.org/ (Sign up → API access)."
    );
  }

  const { mime, buffer } = dataUrlToBuffer(imageDataUrl);
  if (!/^image\/(jpeg|jpg|png|webp)$/i.test(mime)) {
    throw new Error("Please use a JPG, PNG, or WEBP image.");
  }

  const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
  const form = new FormData();
  form.append(
    "images",
    new Blob([buffer], { type: mime }),
    `plant.${ext}`
  );
  form.append("organs", "auto");

  const url =
    `https://my-api.plantnet.org/v2/identify/${encodeURIComponent(PLANTNET_PROJECT)}` +
    `?api-key=${encodeURIComponent(PLANTNET_KEY)}` +
    `&include-related-images=false` +
    `&no-reject=false` +
    `&lang=en` +
    `&nb-results=5`;

  const res = await fetch(url, { method: "POST", body: form });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`PlantNet returned non-JSON (${res.status}): ${text.slice(0, 200)}`);
  }

  if (!res.ok) {
    const msg =
      data?.message ||
      data?.error ||
      (res.status === 401 || res.status === 403
        ? "Invalid PlantNet API key."
        : res.status === 429
          ? "PlantNet daily quota reached. Try again tomorrow."
          : `PlantNet error (${res.status})`);
    throw new Error(msg);
  }

  const results = Array.isArray(data.results) ? data.results : [];
  const top = results[0] || null;
  const score = typeof top?.score === "number" ? top.score : 0;

  // No match OR score too low → NOT a plant/tree (do not fake an ID)
  if (!top || !top.species || score < MIN_PLANT_SCORE) {
    const pct = Math.round(score * 100);
    return notAPlantResult(
      !top || !top.species
        ? "Walang plant match mula sa PlantNet."
        : `Masyadong mababa ang match score (${pct}%, minimum ${Math.round(MIN_PLANT_SCORE * 100)}%). Karaniwan ito kapag hindi halaman/puno ang larawan.`
    );
  }

  const species = top.species;
  const scientificName =
    species.scientificNameWithoutAuthor ||
    species.scientificName ||
    data.bestMatch ||
    "";
  const commonNames = Array.isArray(species.commonNames)
    ? species.commonNames.filter(Boolean)
    : [];
  const commonName = commonNames[0] || scientificName || "Unknown plant";
  const family =
    species.family?.scientificNameWithoutAuthor ||
    species.family?.scientificName ||
    "";
  const confidence = scoreToConfidence(score);

  // Plant identity first — disease model must know the crop or it invents Tomato_*.
  const plantInfoBase = {
    commonName,
    commonNameFilipino: "",
    scientificName,
    family,
    commonNames,
  };

  // Run Wikipedia + disease check in parallel after plant is confirmed.
  // Pass PlantNet score so weak IDs do not unlock tomato (or any) disease labels.
  const [wiki, rawDisease] = await Promise.all([
    enrichFromWikipedia(scientificName, commonName),
    detectPlantDisease(buffer, mime, plantInfoBase, score),
  ]);

  // Final cross-check (never trust raw model crop if it ≠ identified plant)
  const plantInfo = {
    ...plantInfoBase,
    commonNameFilipino: wiki.commonNameFilipino || "",
  };
  let disease = reconcileDiseaseWithPlant(rawDisease, plantInfo);

  // Absolute last line of defense before JSON leaves the server
  if (disease && disease.status !== "unavailable" && disease.status !== "not_covered") {
    const gate = assertDiseaseCropAllowed(disease, plantInfo);
    // uncertain-without-crop (low plant score) is allowed through reconcile
    const isBareUncertain =
      disease.status === "uncertain" && !disease.cropHint && !disease.name;
    if (gate.reject && !isBareUncertain) {
      disease = notCoveredDiseaseResult(
        plantInfo,
        disease.name || disease.condition || disease.cropHint || ""
      );
    }
  }

  const alts = results
    .slice(1, 4)
    .map((r) => {
      const sn =
        r.species?.scientificNameWithoutAuthor || r.species?.scientificName;
      const cn = r.species?.commonNames?.[0];
      const sc = typeof r.score === "number" ? Math.round(r.score * 100) : null;
      if (!sn && !cn) return null;
      return `${cn || sn}${sc != null ? ` (${sc}%)` : ""}`;
    })
    .filter(Boolean);

  const interestingFacts = [];
  if (commonNames.length > 1) {
    interestingFacts.push(`Also known as: ${commonNames.slice(1, 4).join(", ")}`);
  }
  if (alts.length) {
    interestingFacts.push(`Other possible matches: ${alts.join("; ")}`);
  }
  if (typeof data.remainingIdentificationRequests === "number") {
    interestingFacts.push(
      `PlantNet free IDs remaining today: ${data.remainingIdentificationRequests}`
    );
  }

  return {
    isPlant: true,
    commonName,
    commonNameFilipino: wiki.commonNameFilipino || "",
    scientificName,
    family,
    description:
      wiki.description ||
      `${commonName} (${scientificName}) was identified by PlantNet` +
        (family ? ` in the ${family} family` : "") +
        `. Confidence score: ${Math.round(score * 100)}%.`,
    origin: wiki.wikiUrl
      ? `See Wikipedia for native range: ${wiki.wikiUrl}`
      : "See scientific sources / Wikipedia for native range.",
    habitat: "",
    interestingFacts,
    confidence,
    notes:
      confidence === "low"
        ? "Medyo mababa ang confidence — kumuha ng mas malinaw na close-up ng dahon o bulaklak."
        : "Identified with free PlantNet API + Wikipedia. Disease check via leaf disease model.",
    provider: "plantnet",
    score,
    disease,
  };
}

app.get("/api/health", (_req, res) => {
  let message;
  if (!PLANTNET_KEY) {
    message =
      "Add free PLANTNET_API_KEY to server/.env — https://my.plantnet.org/";
  } else if (!HF_TOKEN) {
    message =
      "PlantNet ready. Optional HF_TOKEN improves disease detection — https://huggingface.co/settings/tokens";
  } else {
    message = "PlantNet ready · plant filter + disease check (HF token set)";
  }

  res.json({
    ok: true,
    hasApiKey: Boolean(PLANTNET_KEY),
    hasDiseaseCheck: true,
    hasHfToken: Boolean(HF_TOKEN),
    minPlantScore: MIN_PLANT_SCORE,
    provider: PLANTNET_KEY ? "plantnet" : "none",
    message,
  });
});

app.post("/api/identify", async (req, res) => {
  try {
    const { image } = req.body;
    if (!image || typeof image !== "string") {
      return res.status(400).json({
        error: "Please send an image as a base64 data URL in the body field `image`.",
      });
    }

    if (!image.startsWith("data:image/")) {
      return res.status(400).json({
        error: "Image must be a data URL starting with data:image/...",
      });
    }

    const plant = await identifyWithPlantNet(image);
    res.json({ plant });
  } catch (err) {
    console.error("Identify error:", err);
    res.status(500).json({
      error: err?.message || "Failed to identify plant. Please try again.",
    });
  }
});

// Serve React production build (same origin for phone / Dev Tunnel on one port)
const buildPath = path.join(__dirname, "..", "build");
const indexHtml = path.join(buildPath, "index.html");
const hasFrontendBuild = fs.existsSync(indexHtml);

if (hasFrontendBuild) {
  app.use(express.static(buildPath));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(indexHtml);
  });
}

// Export for Vercel serverless (api/index.js). Only listen when run directly (npm run server).
module.exports = app;

if (require.main === module) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Plant scanner API running on http://localhost:${PORT}`);
    console.log("Listening on 0.0.0.0 — reachable via LAN / Dev Tunnel");
    console.log(
      `Non-plant filter: reject scores below ${Math.round(MIN_PLANT_SCORE * 100)}%`
    );
    console.log(
      `Disease model: ${DISEASE_MODEL}${HF_TOKEN ? " (HF token set)" : " (no HF token)"}`
    );
    if (hasFrontendBuild) {
      console.log("Serving React build from /build (open this port on phone)");
    } else {
      console.log(
        "No /build yet — for phone use: npm run dev (tunnel port 3000) or npm run start:all"
      );
    }
    if (!PLANTNET_KEY) {
      console.warn(
        "Warning: PLANTNET_API_KEY is not set. Get a FREE key at https://my.plantnet.org/"
      );
    } else {
      console.log("Provider: PlantNet (free plant identification)");
    }
  });
}
