/**
 * Plant/tree chatbot — DYNAMIC answers from APIs (not static JSON tips).
 *
 * Priority:
 *  1. Hugging Face chat (live LLM) + live Wikipedia context
 *  2. Wikipedia REST summary shaped into a natural reply
 *  3. Small local knowledge only as last resort
 *
 * Works WITH or WITHOUT a plant scan. PlantNet is image ID only.
 */

// Free HF Router models that currently accept chat/completions for free tokens.
// Order = try first. Override with CHAT_MODEL in server/.env
const DEFAULT_CHAT_MODELS = [
  process.env.CHAT_MODEL,
  "Qwen/Qwen2.5-7B-Instruct",
  "openai/gpt-oss-120b:together",
  "Qwen/Qwen2.5-1.5B-Instruct",
  "HuggingFaceTB/SmolLM2-1.7B-Instruct",
  "microsoft/Phi-3.5-mini-instruct",
].filter(Boolean);

const WIKI_UA = "PlantScanner/1.0 (educational plant chat; local app)";

/**
 * Common plants (PH + popular houseplants). Used when user names a plant
 * in the question even without scanning.
 * Keys = search aliases (lowercase).
 */
const PLANT_KNOWLEDGE = {
  mangga: {
    name: "Mangga (Mango)",
    scientific: "Mangifera indica",
    care: "Full sun (6–8 oras), deep watering 1–2×/linggo kapag bata pa (mas madalang kapag mature). Well-draining sandy loam. Iwasan ang basang ugat. Prune ang dead branches after fruiting.",
    plant: "Magtanim ng seed o grafted seedling sa maaraw na lugar, butas ~60cm deep, compost sa ilalim. Space ~8–10m mula sa ibang puno. Protektahan ang batang puno sa malakas na hangin.",
  },
  mango: { alias: "mangga" },
  kalamansi: {
    name: "Kalamansi",
    scientific: "Citrus × microcarpa",
    care: "Full sun hanggang partial shade. Dilig kapag tuyo ang top soil; huwag basain ang ugat. Regular compost. Bantayan ang leaf miners at scale insects.",
    plant: "Magtanim sa pot o lupa na may drainage. Mas gusto ng slightly acidic soil. Pwede sa container sa balkonahe kung may sapat na araw.",
  },
  calamansi: { alias: "kalamansi" },
  "calamondin": { alias: "kalamansi" },
  saging: {
    name: "Saging (Banana)",
    scientific: "Musa spp.",
    care: "Maraming tubig + rich organic soil. Full sun hanggang light shade. Regular mulch at potassium-rich fertilizer. Alisin ang dry leaves.",
    plant: "Magtanim ng sucker/pup sa butas na may compost, keep moist. Space ~2–3m. Gusto ng mainit at humid na klima (bagay sa PH).",
  },
  banana: { alias: "saging" },
  niyog: {
    name: "Niyog / Coconut",
    scientific: "Cocos nucifera",
    care: "Full sun, sandy coastal-type soil OK. Deep watering sa unang taon. Mature trees tolerante sa drought. Bantayan ang rhinoceros beetle at scale.",
    plant: "Magtanim ng germinated nut sa maaraw na espasyo (malayo sa bahay/linya). Butas malalim, well-draining.",
  },
  coconut: { alias: "niyog" },
  coco: { alias: "niyog" },
  santol: {
    name: "Santol",
    scientific: "Sandoricum koetjape",
    care: "Full sun, regular watering kapag bata. Well-draining soil + compost. Prune para sa shape.",
    plant: "Seed o seedling sa open area; space ~8m. Tropical, bagay sa PH climate.",
  },
  bayabas: {
    name: "Bayabas (Guava)",
    scientific: "Psidium guajava",
    care: "Full sun, moderate water. Tolerante sa iba't ibang lupa. Prune after harvest. Bantayan ang fruit fly.",
    plant: "Madaling magtanim mula sa seed o cutting. Space ~4–5m. Mabilis tumubo sa PH.",
  },
  guava: { alias: "bayabas" },
  papaya: {
    name: "Papaya / Melon tree",
    scientific: "Carica papaya",
    care: "Full sun, regular water, well-draining soil. Ayaw ng waterlogged roots. Fertilize lightly tuwing buwan kapag fruiting.",
    plant: "Direktang seed sa maaraw na lugar. Space ~2–3m. Fast-growing; protektahan sa malakas na hangin.",
  },
  kapaya: { alias: "papaya" },
  malunggay: {
    name: "Malunggay (Moringa)",
    scientific: "Moringa oleifera",
    care: "Full sun, light watering (drought-tolerant kapag established). Poor soil OK. Regular harvest ng dahon para mag-branch.",
    plant: "Seed o cutting sa open ground. Mabilis tumubo. Iwasan ang sobrang basang lupa.",
  },
  moringa: { alias: "malunggay" },
  kangkong: {
    name: "Kangkong",
    scientific: "Ipomoea aquatica",
    care: "Maraming tubig / moist soil, full sun hanggang partial. Harvest stems regularly para tuloy-tuloy ang shoot.",
    plant: "Cutting sa basang lupa o container na laging moist. Mabilis — days to harvest tips.",
  },
  kamatis: {
    name: "Kamatis (Tomato)",
    scientific: "Solanum lycopersicum",
    care: "Full sun (6+ oras), consistent watering sa base (huwag basain ang dahon). Stake/cage. Well-draining fertile soil. Bantayan ang early blight at whiteflies.",
    plant: "Seedling transplant after 3–4 linggo. Space ~50–60cm. Mulch para panatilihin ang moisture.",
  },
  tomato: { alias: "kamatis" },
  talong: {
    name: "Talong (Eggplant)",
    scientific: "Solanum melongena",
    care: "Full sun, regular water, rich soil. Warm climate OK. Bantayan ang fruit & shoot borer.",
    plant: "Seedling transplant, space ~60cm. Gusto ng mainit na panahon.",
  },
  eggplant: { alias: "talong" },
  sitaw: {
    name: "Sitaw (String bean)",
    scientific: "Vigna unguiculata sesquipedalis",
    care: "Full sun, moderate water, trellis para umakyat. Ayaw ng sobrang nitrogen (dahon > bulaklak).",
    plant: "Direktang seed sa lupa o pot + trellis. Space ~20–30cm. Harvest pods young.",
  },
  monstera: {
    name: "Monstera",
    scientific: "Monstera deliciosa",
    care: "Bright indirect light (iwas direct hot sun). Diligan kapag tuyo ang top 2–3cm. Well-draining aroid mix. Wipe leaves; support pole para sa aerial roots.",
    plant: "Cutting na may node sa water o soil. Keep warm at humid. Ideal indoor plant.",
  },
  monstra: { alias: "monstera" },
  "snake plant": {
    name: "Snake Plant (Sansevieria / Mother-in-law's tongue)",
    scientific: "Dracaena trifasciata",
    care: "Low hanggang bright indirect light. Rare watering — hayaan matuyo ang lupa (sobrang tubig = root rot). Perfect para sa beginners.",
    plant: "Leaf cutting o division. Well-draining soil. Halos neglect-proof.",
  },
  sansevieria: { alias: "snake plant" },
  "money plant": {
    name: "Money Plant / Pothos",
    scientific: "Epipremnum aureum",
    care: "Low hanggang bright indirect light. Diligan kapag tuyo ang top soil. Madaling mag-propagate sa water.",
    plant: "Stem cutting sa tubig hanggang may ugat, tapos lipat sa pot.",
  },
  pothos: { alias: "money plant" },
  "devil's ivy": { alias: "money plant" },
  orchid: {
    name: "Orchid (Orchidaceae)",
    scientific: "Orchidaceae",
    care: "Bright indirect light, high humidity. Water kapag almost dry ang medium (bark). Huwag iwanan sa basang baso. Good airflow.",
    plant: "Repot sa orchid bark, hindi ordinary garden soil. Phalaenopsis common sa bahay.",
  },
  orkid: { alias: "orchid" },
  orkide: { alias: "orchid" },
  "aloe vera": {
    name: "Aloe Vera",
    scientific: "Aloe vera",
    care: "Bright light / some direct sun. Rare watering — succulent, ayaw ng basang lupa. Well-draining cactus mix.",
    plant: "Pups/offsets mula sa mother plant. Madaling alagaan indoor o outdoor.",
  },
  aloe: { alias: "aloe vera" },
  rosas: {
    name: "Rosas (Rose)",
    scientific: "Rosa spp.",
    care: "Full sun (5–6+ oras), regular water sa base, rich soil. Prune dead wood. Bantayan ang aphids at black spot — airflow importante.",
    plant: "Bare-root o potted rose sa maaraw na lugar. Mulch, huwag idikit sa stem.",
  },
  rose: { alias: "rosas" },
  sampaguita: {
    name: "Sampaguita",
    scientific: "Jasminum sambac",
    care: "Full sun hanggang partial, regular water, slightly acidic well-draining soil. Prune after flowering waves.",
    plant: "Cutting sa pot o hardin. National flower — bagay sa mainit na klima ng PH.",
  },
  jasmine: { alias: "sampaguita" },
  "peace lily": {
    name: "Peace Lily",
    scientific: "Spathiphyllum",
    care: "Low hanggang medium indirect light. Keep soil lightly moist (droop = needs water). High humidity OK. Toxic sa pets kung kainin.",
    plant: "Division ng clump. Magandang indoor air plant.",
  },
  "peace lilies": { alias: "peace lily" },
  cactus: {
    name: "Cactus",
    scientific: "Cactaceae",
    care: "Maraming araw, rare watering (bawat 2–4 linggo depende sa init). Gravelly/cactus soil. Sobrang tubig = #1 killer.",
    plant: "Well-draining pot + cactus mix. Huwag basahin ang katawan; dilig sa base.",
  },
  kaktus: { alias: "cactus" },
  succulent: {
    name: "Succulents",
    scientific: "various",
    care: "Bright light, sparse water, excellent drainage. 'Soak and dry' method. Ayaw ng humid basang lupa overnight.",
    plant: "Leaf o stem cuttings, hayaan mag-callus bago itanim sa gritty mix.",
  },
  succulents: { alias: "succulent" },
  "rubber plant": {
    name: "Rubber Plant",
    scientific: "Ficus elastica",
    care: "Bright indirect light, water kapag top soil dry. Wipe leaves. Iwasan ang biglaang cold draft.",
    plant: "Stem cutting o air layer. Popular indoor tree-like plant.",
  },
  ficus: {
    name: "Ficus",
    scientific: "Ficus spp.",
    care: "Bright indirect light, consistent watering (huwag sobra). Ayaw ng frequent moving — madaling mag-drop ng dahon.",
    plant: "Cutting o nursery plant sa well-draining mix.",
  },
  "narra": {
    name: "Narra",
    scientific: "Pterocarpus indicus",
    care: "Full sun, moderate water kapag bata. National tree — large canopy, kailangan ng malawak na espasyo.",
    plant: "Seedling sa open ground, malayo sa buildings. Long-term shade tree.",
  },
  "acacia": {
    name: "Acacia / Rain tree (common PH street trees vary)",
    scientific: "Fabaceae (various)",
    care: "Full sun, drought-tolerant kapag mature. Deep watering sa unang taon.",
    plant: "Open space — malaki ang ugat at canopy. Huwag isiksik sa bakuran na maliit.",
  },
  "lemon": {
    name: "Lemon / Dayap-type citrus",
    scientific: "Citrus limon",
    care: "Full sun, regular water, well-draining slightly acidic soil. Feed citrus fertilizer. Bantayan ang scale at leaf miner.",
    plant: "Container o ground; drainage critical. Grafted trees mas mabilis magbunga.",
  },
  dayap: { alias: "lemon" },
  "chili": {
    name: "Sili / Chili pepper",
    scientific: "Capsicum spp.",
    care: "Full sun, moderate consistent water, warm weather. Harvest regularly para mas maraming bunga.",
    plant: "Seed o seedling, space ~40cm. Bagay sa pots sa balkonahe.",
  },
  sili: { alias: "chili" },
  siling: { alias: "chili" },
  pepper: { alias: "chili" },
  "basil": {
    name: "Basil / Balanoy",
    scientific: "Ocimum basilicum",
    care: "Full sun, keep soil lightly moist, pinch tips para bushy. Ayaw ng malamig na gabi.",
    plant: "Seed sa pot; harvest leaves often. Companion sa kamatis.",
  },
  balanoy: { alias: "basil" },
  "mint": {
    name: "Mint / Yerba buena-type herbs",
    scientific: "Mentha spp.",
    care: "Partial sun, moist soil. Aggressive spreader — best sa sariling pot.",
    plant: "Cutting sa water o soil. Keep trimmed.",
  },
  menta: { alias: "mint" },
};

function resolvePlantEntry(key) {
  let entry = PLANT_KNOWLEDGE[key];
  if (!entry) return null;
  // Follow alias chain once
  if (entry.alias) {
    entry = PLANT_KNOWLEDGE[entry.alias];
  }
  return entry && entry.name ? entry : null;
}

/** Find a known plant mentioned in free text (or from scan). */
function detectMentionedPlant(text, scannedPlant) {
  const q = String(text || "").toLowerCase();

  // Prefer longer keys first (e.g. "snake plant" before "plant")
  const keys = Object.keys(PLANT_KNOWLEDGE).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    // word-ish match
    const re = new RegExp(
      `(^|[^a-zà-ü])${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-zà-ü]|$)`,
      "i"
    );
    if (re.test(q)) {
      const entry = resolvePlantEntry(key);
      if (entry) return { source: "question", key, ...entry };
    }
  }

  // Free-form: "paano alagaan ang X" / "about X plant"
  const freeName = extractPlantNameFromQuestion(q);
  if (freeName) {
    return {
      source: "question",
      key: freeName,
      name: capitalizeWords(freeName),
      scientific: null,
      care: null,
      plant: null,
    };
  }

  // From scan context
  if (scannedPlant && scannedPlant.isPlant !== false) {
    const labels = [
      scannedPlant.commonNameFilipino,
      scannedPlant.commonName,
      scannedPlant.scientificName,
    ]
      .filter(Boolean)
      .map((s) => String(s).toLowerCase());

    for (const label of labels) {
      for (const key of keys) {
        if (label.includes(key) || key.includes(label.split(" ")[0])) {
          const entry = resolvePlantEntry(key);
          if (entry) {
            return {
              source: "scan",
              key,
              ...entry,
              scanName:
                scannedPlant.commonNameFilipino ||
                scannedPlant.commonName ||
                scannedPlant.scientificName,
              description: scannedPlant.description,
              disease: scannedPlant.disease,
            };
          }
        }
      }
    }

    // Unknown scanned plant — still use its name
    const scanName =
      scannedPlant.commonNameFilipino ||
      scannedPlant.commonName ||
      scannedPlant.scientificName;
    if (scanName) {
      return {
        source: "scan",
        name: scanName,
        scientific: scannedPlant.scientificName || null,
        care: null,
        plant: null,
        description: scannedPlant.description,
        disease: scannedPlant.disease,
      };
    }
  }

  return null;
}

function capitalizeWords(s) {
  return String(s || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Pull a plant name from common question patterns when not in dictionary. */
function extractPlantNameFromQuestion(q) {
  const patterns = [
    /(?:paano\s+(?:alagaan|magtanim|taniman)\s+(?:ng\s+|ang\s+)?|alaga\s+(?:ng\s+|sa\s+)?|about\s+|care\s+for\s+|how\s+to\s+(?:care\s+for|plant|grow)\s+)([a-zà-ü0-9][a-zà-ü0-9\s-]{1,40}?)(?:\?|$|\.|!|,)/i,
    /(?:ano\s+(?:ang|ba\s+ang)\s+)([a-zà-ü0-9][a-zà-ü0-9\s-]{1,30}?)(?:\?|$)/i,
    /(?:tungkol\s+sa\s+)([a-zà-ü0-9][a-zà-ü0-9\s-]{1,30}?)(?:\?|$|\.)/i,
  ];
  const stop = new Set([
    "halaman",
    "puno",
    "ito",
    "iyan",
    "iyan",
    "yan",
    "plant",
    "tree",
    "dahon",
    "tubig",
    "lupa",
    "sakit",
    "ako",
    "mo",
    "ko",
  ]);
  for (const re of patterns) {
    const m = q.match(re);
    if (!m) continue;
    let name = m[1].trim().replace(/\s+/g, " ");
    // drop trailing filler
    name = name.replace(/\s+(ba|po|nga|naman|please|pls)$/i, "").trim();
    if (name.length < 2 || name.length > 40) continue;
    if (stop.has(name)) continue;
    if (/^(ang|ng|sa|the|a|an|my|ito)\b/.test(name)) continue;
    return name;
  }
  return null;
}

/**
 * Live Wikipedia summary (dynamic — not from local JSON).
 * Tries English then Tagalog; accepts scientific or common name.
 */
async function fetchWikiSummary(title, lang = "en") {
  if (!title) return null;
  const encoded = encodeURIComponent(String(title).trim().replace(/ /g, "_"));
  const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encoded}`;
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": WIKI_UA },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.type === "disambiguation" || !data.extract) return null;
    return {
      title: data.title,
      description: String(data.extract).trim(),
      url: data.content_urls?.desktop?.page || null,
      lang,
    };
  } catch {
    return null;
  }
}

/** Search Wikipedia when exact title fails (more dynamic coverage). */
async function searchWikiTitle(query, lang = "en") {
  if (!query) return null;
  const url =
    `https://${lang}.wikipedia.org/w/api.php?action=opensearch` +
    `&search=${encodeURIComponent(query)}&limit=1&namespace=0&format=json`;
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": WIKI_UA },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const title = Array.isArray(data?.[1]) ? data[1][0] : null;
    return title || null;
  } catch {
    return null;
  }
}

/**
 * Resolve live plant facts from Wikipedia using scan + question names.
 * This is what makes answers dynamic instead of static PLANT_KNOWLEDGE JSON.
 */
async function fetchDynamicPlantContext(userText, plant, detected) {
  const candidates = [];
  const push = (v) => {
    const s = String(v || "").trim();
    if (s && !candidates.includes(s)) candidates.push(s);
  };

  if (detected?.scientific) push(detected.scientific);
  if (detected?.name) push(detected.name);
  if (detected?.scanName) push(detected.scanName);
  if (plant?.scientificName) push(plant.scientificName);
  if (plant?.commonName) push(plant.commonName);
  if (plant?.commonNameFilipino) push(plant.commonNameFilipino);

  // Also try free-form name from question
  const free = extractPlantNameFromQuestion(String(userText || "").toLowerCase());
  if (free) push(free);

  for (const name of candidates) {
    for (const lang of ["en", "tl"]) {
      let summary = await fetchWikiSummary(name, lang);
      if (!summary) {
        const found = await searchWikiTitle(name, lang);
        if (found) summary = await fetchWikiSummary(found, lang);
      }
      if (summary?.description) {
        return {
          name: summary.title || name,
          description: summary.description,
          url: summary.url,
          lang: summary.lang,
          query: name,
        };
      }
    }
  }

  // Scanned description from PlantNet/Wikipedia enrich (already dynamic at scan time)
  if (plant?.description && String(plant.description).length > 40) {
    return {
      name:
        plant.commonNameFilipino ||
        plant.commonName ||
        plant.scientificName ||
        "halaman",
      description: String(plant.description),
      url: null,
      lang: "scan",
      query: plant.scientificName || plant.commonName,
    };
  }

  return null;
}

function buildSystemPrompt(plant, wiki = null) {
  const lines = [
    "Ikaw ay Plant Buddy — friendly at helpful chatbot tungkol sa puno at halaman.",
    "IMPORTANT: Sagutin nang NATURAL at conversational (parang kaibigan na expert), HINDI naka-JSON, HINDI bullet dump ng fields, HINDI template.",
    "Gumawa ng orihinal na sagot base sa context at tanong — huwag mag-copy paste ng fixed script.",
    "Pwedeng sumagot kahit WALANG na-scan na halaman.",
    "Sumagot sa Filipino kung Filipino ang tanong; English kung English; mixed OK kung mixed ang tanong.",
    "Maikli, malinaw, at useful (2–6 sentences). Focus: alaga, liwanag, tubig, lupa, pagtatanim, sakit, habitat, facts.",
    "Kung may specific na halaman sa tanong, i-prioritize ang care tips para doon.",
    "Kung hindi ka sure, sabihin nang tapat at magbigay ng safe general tips — huwag mag-imbento ng delikadong medical advice para sa tao.",
    "Huwag pilitin ang user na mag-scan maliban kung kailangan talaga ng photo ID.",
    "Huwag mag-output ng raw JSON, code blocks, o key-value lists bilang sagot.",
  ];

  if (wiki?.description) {
    lines.push("");
    lines.push(
      `LIVE reference mula sa Wikipedia tungkol sa "${wiki.name}" (gamitin bilang base ng sagot, huwag i-dump nang buo):`
    );
    lines.push(String(wiki.description).slice(0, 900));
    if (wiki.url) lines.push(`Source: ${wiki.url}`);
  }

  if (plant && plant.isPlant !== false) {
    const name =
      plant.commonNameFilipino ||
      plant.commonName ||
      plant.scientificName ||
      "hindi pa na-identify";
    lines.push("");
    lines.push("Optional context mula sa huling plant scan ng user (gamitin kung relevant):");
    lines.push(`- Common name: ${plant.commonName || "—"}`);
    if (plant.commonNameFilipino) {
      lines.push(`- Filipino name: ${plant.commonNameFilipino}`);
    }
    if (plant.scientificName) {
      lines.push(`- Scientific name: ${plant.scientificName}`);
    }
    if (plant.family) lines.push(`- Family: ${plant.family}`);
    if (plant.description && !wiki?.description) {
      lines.push(`- Description: ${String(plant.description).slice(0, 500)}`);
    }
    if (plant.disease?.name) {
      lines.push(
        `- Possible leaf disease: ${plant.disease.name} (${plant.disease.status || "check"})`
      );
    }
    lines.push(
      `Kapag relevant ang tanong, i-prioritize ang tips tungkol sa "${name}".`
    );
  } else {
    lines.push(
      "Walang active scan. Sagutin pa rin nang buo ang tanong gamit ang general plant knowledge + Wikipedia context."
    );
  }

  return lines.join("\n");
}

function normalizeMessages(raw, plant, wiki = null) {
  const system = { role: "system", content: buildSystemPrompt(plant, wiki) };
  const history = Array.isArray(raw) ? raw : [];
  const cleaned = history
    .filter(
      (m) =>
        m &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim()
    )
    .slice(-12)
    .map((m) => ({
      role: m.role,
      content: String(m.content).trim().slice(0, 2000),
    }));

  return [system, ...cleaned];
}

async function callHfChat(messages, token) {
  const bodyBase = {
    messages,
    max_tokens: 420,
    temperature: 0.55,
    stream: false,
  };

  const endpoints = [
    "https://router.huggingface.co/v1/chat/completions",
    "https://api-inference.huggingface.co/v1/chat/completions",
  ];

  let lastError = null;

  for (const model of DEFAULT_CHAT_MODELS) {
    for (const url of endpoints) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ ...bodyBase, model }),
        });

        const text = await res.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch {
          lastError = `Non-JSON chat response (${res.status})`;
          continue;
        }

        if (!res.ok) {
          lastError =
            data?.error?.message ||
            data?.error ||
            data?.message ||
            `Chat API error (${res.status})`;
          continue;
        }

        const reply =
          data?.choices?.[0]?.message?.content ||
          data?.choices?.[0]?.text ||
          data?.generated_text;

        if (reply && String(reply).trim()) {
          return {
            reply: String(reply).trim(),
            provider: "huggingface",
            model,
          };
        }
        lastError = "Empty chat reply";
      } catch (err) {
        lastError = err.message || "HF chat request failed";
      }
    }
  }

  throw new Error(lastError || "Hugging Face chat unavailable");
}

function displayName(detected, wiki) {
  if (wiki?.name) return wiki.name;
  if (!detected) return null;
  return detected.scanName || detected.name || null;
}

function isFilipinoQuestion(q) {
  return /[àáâãäåæçèéêëìíîïñòóôõöùúûü]|(\b(ang|ng|sa|mga|para|paano|ano|bakit|kung|ito|yan|yung|po|ba|ako|mo|naman|halaman|puno|dilig|alagaan|magtanim)\b)/i.test(
    q
  );
}

/**
 * Build a natural, dynamic paragraph from live Wikipedia + question intent.
 * Not a static JSON dump — reads like a short helpful answer.
 */
function replyFromWiki(userText, plant, detected, wiki) {
  const q = String(userText || "").toLowerCase().trim();
  const fil = isFilipinoQuestion(q);
  const name = displayName(detected, wiki);
  const extract = wiki?.description ? String(wiki.description).trim() : "";
  // Keep 1–2 sentences from wiki so reply stays readable
  const wikiBit = extract
    ? extract.split(/(?<=[.!?])\s+/).slice(0, 2).join(" ")
    : "";

  const wantsPlantHow =
    /paano\s+magtanim|how\s+to\s+plant|magtanim|taniman|pagtatanim|propagate|cutting|seedling|magtan[ií]m|grow/.test(
      q
    );
  const wantsCare =
    /alagaan|alaga|care|paano\s+alaga|maintain|tips|gabay|how\s+to\s+care/.test(q);
  const wantsWater = /tubig|water|dilig|irig|moisture|basa|tuy[oô]/.test(q);
  const wantsLight = /araw|sun|liwanag|light|shade|dilim|indoor|outdoor/.test(q);
  const wantsSoil = /lupa|soil|potting|compost|abono|fertiliz|pataba/.test(q);
  const wantsDisease =
    /sakit|disease|blight|fungus|pest|insekto|insect|dilaw|yellow|lanta|wilting|mabulok|root\s*rot/.test(
      q
    );
  const wantsId =
    /ano\s+(itong|ito|yang|yung)\s+(halaman|puno)|what\s+(plant|tree)|identify|anong\s+(halaman|puno)|pangalan\s+nito/.test(
      q
    );
  const isGreeting =
    /^(hi|hello|hey|yo|kumusta|musta|good\s*(morning|afternoon|evening)|magandang\s*(umaga|hapon|gabi))[\s!.,?]*$/i.test(
      q
    );

  if (isGreeting) {
    return fil
      ? "Hi! Ako si Plant Buddy 🌿 — tanungin mo ako tungkol sa anumang puno o halaman. Halimbawa: “Paano alagaan ang mangga?” o “Bakit dilaw ang dahon?”. Kung may picture, i-Scan Plant para mas personal ang tips."
      : "Hi! I'm Plant Buddy 🌿 — ask me about any plant or tree. Try “How do I care for a mango tree?” or “Why are my leaves yellow?”. Scan a photo if you want species-specific tips.";
  }

  const parts = [];

  if (name && wikiBit) {
    if (fil) {
      parts.push(
        `Tungkol sa **${name}**: ${wikiBit}`
      );
    } else {
      parts.push(`About **${name}**: ${wikiBit}`);
    }
  } else if (name && detected?.care) {
    // Local dictionary only as soft supplement when wiki missing
    parts.push(
      fil
        ? `Para sa **${name}**: ${detected.care}`
        : `For **${name}**: ${detected.care}`
    );
  }

  // Intent-based practical tips (natural sentences, not JSON fields)
  if (wantsWater) {
    parts.push(
      fil
        ? `Sa pagdidilig${name ? ` ng ${name}` : ""}: diligan kapag tuyo na ang itaas na 2–3 cm ng lupa. Mas okay ang deep watering minsan kaysa basang-basa araw-araw, at iwasan ang tubig na naiipon sa baso.`
        : `Watering tip${name ? ` for ${name}` : ""}: water when the top 2–3 cm of soil feels dry. Deep, less frequent watering beats daily light sprinkles — empty saucers so roots don’t sit wet.`
    );
  }
  if (wantsLight) {
    parts.push(
      fil
        ? `Para sa liwanag${name ? ` ng ${name}` : ""}: karamihan ng indoor plants gusto ng bright indirect light; fruit trees at sun crops (mangga, kamatis) kailangan ng full sun nang 6+ oras.`
        : `Light tip${name ? ` for ${name}` : ""}: most houseplants like bright indirect light; fruit trees and sun crops need 6+ hours of direct sun.`
    );
  }
  if (wantsSoil) {
    parts.push(
      fil
        ? `Sa lupa: gumamit ng well-draining mix (lupa + compost + buhangin/perlite). Huwag sobrang denseng putik para hindi mabulok ang ugat.`
        : `Soil tip: use a well-draining mix (soil + compost + sand/perlite). Heavy clay that stays wet invites root rot.`
    );
  }
  if (wantsPlantHow) {
    if (detected?.plant) {
      parts.push(fil ? `Pagtatanim: ${detected.plant}` : `Planting: ${detected.plant}`);
    } else {
      parts.push(
        fil
          ? `Kapag magtatanim${name ? ` ng ${name}` : ""}: piliin ang angkop na liwanag, butas na sapat sa ugat, haluan ng compost, dilig pagkatapos, at mag-mulch sa paligid (huwag idikit sa stem).`
          : `When planting${name ? ` ${name}` : ""}: match the light needs, dig a hole wide enough for roots, mix in compost, water in well, and mulch without piling against the stem.`
      );
    }
  }
  if (wantsCare && !wantsWater && !wantsLight && !wantsSoil && !wantsPlantHow) {
    if (wikiBit) {
      // Keep practical add-on short — don't dump static dictionary blocks
      parts.push(
        fil
          ? `Sa praktikal na alaga: bigyan ng sapat na araw, diligan nang deep kapag tuyo ang top soil, at tiyaking may drainage ang lupa — lalo na sa tag-ulan sa Pilipinas.`
          : `Practically: give it the light it needs, water deeply when the top soil dries, and keep drainage good — especially in wet seasons.`
      );
    } else if (detected?.care) {
      parts.push(
        fil
          ? `Praktikal na tips: ${detected.care}`
          : `Practical tips: ${detected.care}`
      );
    } else {
      parts.push(
        fil
          ? `Basic alaga${name ? ` para sa ${name}` : ""}: tamang liwanag, dilig kapag kailangan, well-draining lupa, alisin ang patay na dahon, at bantayan ang peste.`
          : `Basic care${name ? ` for ${name}` : ""}: right light, water when needed, well-draining soil, remove dead leaves, and watch for pests.`
      );
    }
  }
  if (wantsDisease) {
    const diseaseNote =
      detected?.disease?.name && detected.disease.status !== "healthy"
        ? fil
          ? ` Sa huling scan, possible issue: **${detected.disease.name}**.`
          : ` Last scan hinted at: **${detected.disease.name}**.`
        : "";
    if (/dilaw|yellow/.test(q)) {
      parts.push(
        fil
          ? `Kung dilaw ang dahon${name ? ` ng ${name}` : ""}: madalas dahil sa sobra/kulang sa tubig, mahinang liwanag, o kakulangan sa nutrients. Suriin muna ang top soil bago magdagdag ng abono.${diseaseNote}`
          : `Yellow leaves${name ? ` on ${name}` : ""} often mean over/under-watering, low light, or nutrient stress. Check soil moisture before adding fertilizer.${diseaseNote}`
      );
    } else {
      parts.push(
        fil
          ? `Para sa sakit o peste${name ? ` sa ${name}` : ""}: alisin ang apektadong dahon, pagandahin ang airflow, huwag basain ang dahon sa gabi.${diseaseNote}`
          : `For disease or pests${name ? ` on ${name}` : ""}: remove affected leaves, improve airflow, and avoid wetting foliage at night.${diseaseNote}`
      );
    }
  }
  if (wantsId) {
    if (name) {
      parts.push(
        fil
          ? `Base sa available info, mukhang **${name}**${detected?.scientific ? ` (*${detected.scientific}*)` : ""}.`
          : `From available info, this looks like **${name}**${detected?.scientific ? ` (*${detected.scientific}*)` : ""}.`
      );
    } else {
      parts.push(
        fil
          ? "Para malaman ang exact pangalan mula sa picture, mag-upload at pindutin ang **Scan Plant**. Samantala, sabihin mo ang itsura (dahon, bulaklak) o tanungin nang general."
          : "To identify from a photo, upload and tap **Scan Plant**. Or describe the leaf/flower and I’ll help generally."
      );
    }
  }

  if (!parts.length) {
    if (wikiBit) {
      parts.push(
        fil
          ? `Eto ang alam ko tungkol sa **${name || "halaman na ito"}**: ${wikiBit} Magtanong ka pa about dilig, liwanag, o pagtatanim.`
          : `Here’s what I know about **${name || "this plant"}**: ${wikiBit} Ask me about watering, light, or planting for more.`
      );
    } else if (name) {
      parts.push(
        fil
          ? `Pwede kitang tulungan tungkol sa **${name}** — tanungin mo ako about pagdidilig, liwanag, lupa, sakit, o pagtatanim.`
          : `I can help with **${name}** — ask about watering, light, soil, disease, or planting.`
      );
    } else {
      parts.push(
        fil
          ? "Sabihin mo ang pangalan ng halaman o ang problema (hal. dilaw na dahon, paano magtanim ng mangga). Sasagot ako gamit ang live plant info mula sa web kapag available."
          : "Tell me the plant name or problem (e.g. yellow leaves, how to plant mango). I’ll answer with live web plant info when available."
      );
    }
  }

  // Dedupe + cap length for chat UI
  const unique = [...new Set(parts.map((p) => p.trim()).filter(Boolean))];
  let reply = unique.slice(0, 3).join("\n\n");
  if (wiki?.url && name && !reply.includes(wiki.url)) {
    reply += fil
      ? `\n\n_Source: Wikipedia — ${wiki.url}_`
      : `\n\n_Source: Wikipedia — ${wiki.url}_`;
  }
  return reply;
}

/**
 * Last-resort local tips when Wikipedia + HF both unavailable.
 */
function localPlantReply(userText, plant) {
  const detected = detectMentionedPlant(userText, plant);
  return replyFromWiki(userText, plant, detected, null);
}

/**
 * @param {{ message: string, history?: array, plant?: object|null, hfToken?: string }} opts
 */
async function answerPlantChat({ message, history = [], plant = null, hfToken = "" }) {
  const userMessage = String(message || "").trim();
  if (!userMessage) {
    throw new Error("Walang tanong. Mag-type ng mensahe tungkol sa puno o halaman.");
  }
  if (userMessage.length > 2000) {
    throw new Error("Masyadong mahaba ang tanong (max 2000 characters).");
  }

  const detected = detectMentionedPlant(userMessage, plant);

  // Always pull LIVE Wikipedia context first (dynamic, not static JSON)
  let wiki = null;
  try {
    wiki = await fetchDynamicPlantContext(userMessage, plant, detected);
  } catch (err) {
    console.warn("Wikipedia context fetch failed:", err?.message || err);
  }

  const messages = normalizeMessages(
    [...history, { role: "user", content: userMessage }],
    plant,
    wiki
  );

  // 1) Prefer live Hugging Face chat API (true dynamic natural language)
  if (hfToken) {
    try {
      const result = await callHfChat(messages, hfToken);
      return {
        reply: result.reply,
        provider: result.provider,
        model: result.model,
        offline: false,
        source: wiki ? "ai+wikipedia" : "ai",
      };
    } catch (err) {
      console.warn("HF chat failed, using Wikipedia/dynamic fallback:", err?.message || err);
      // 2) Dynamic Wikipedia-shaped reply (still not static JSON dump)
      if (wiki?.description) {
        return {
          reply: replyFromWiki(userMessage, plant, detected, wiki),
          provider: "wikipedia",
          model: null,
          offline: false,
          source: "wikipedia",
          note:
            err.message ||
            "AI chat temporarily unavailable — ginamit ang live Wikipedia.",
        };
      }
      return {
        reply: replyFromWiki(userMessage, plant, detected, null),
        provider: "local-fallback",
        model: null,
        offline: true,
        source: "local",
        note:
          err.message ||
          "AI chat unavailable — temporary local tips.",
      };
    }
  }

  // No HF token: still dynamic via Wikipedia when possible
  if (wiki?.description) {
    return {
      reply: replyFromWiki(userMessage, plant, detected, wiki),
      provider: "wikipedia",
      model: null,
      offline: false,
      source: "wikipedia",
      note: "Live Wikipedia answer (mag-set ng HF_TOKEN para sa full AI chat).",
    };
  }

  return {
    reply: replyFromWiki(userMessage, plant, detected, null),
    provider: "local",
    model: null,
    offline: true,
    source: "local",
    note: "Walang HF_TOKEN / Wikipedia hit — basic tips. Mag-set ng HF_TOKEN sa server/.env para dynamic AI.",
  };
}

module.exports = {
  answerPlantChat,
  buildSystemPrompt,
  localPlantReply,
  detectMentionedPlant,
  fetchDynamicPlantContext,
  replyFromWiki,
  PLANT_KNOWLEDGE,
};
