/**
 * Quick sanity checks for disease crop gating (run: node server/_test_crop_match.js)
 * Uses the same helpers as production (server/cropMatch.js).
 */
const {
  matchingDiseaseCrops,
  diseaseCropMatchesPlant,
  parseDiseaseLabel,
  assertDiseaseCropAllowed,
  reconcileLike,
} = (() => {
  const m = require("./cropMatch");
  // Local reconcile mirror of server final gate for unit tests
  function reconcileLike(disease, plantInfo) {
    if (!disease || typeof disease !== "object") return disease;
    if (disease.status === "unavailable") return disease;
    if (disease.status === "not_covered") return disease;
    if (disease.status === "uncertain" && !disease.cropHint && !disease.name) {
      return disease;
    }
    const gate = m.assertDiseaseCropAllowed(disease, plantInfo);
    if (gate.reject) {
      return { status: "not_covered", cropHint: "", name: "" };
    }
    return { ...disease, cropMatched: true, cropHint: gate.cropHint };
  }
  return { ...m, reconcileLike };
})();

const cases = [
  {
    name: "Aglaonema must NOT get tomato",
    plant: { commonName: "Chinese evergreen", scientificName: "Aglaonema commutatum" },
    expect: [],
  },
  {
    name: "Mango must NOT get tomato",
    plant: { commonName: "Mango", scientificName: "Mangifera indica", commonNames: ["Mango"] },
    expect: [],
  },
  {
    name: "Tomato matches tomato",
    plant: {
      commonName: "Tomato",
      scientificName: "Solanum lycopersicum",
      commonNames: ["Tomato", "Kamatis"],
    },
    expect: ["tomato"],
  },
  {
    name: "Kamatis matches tomato",
    plant: { commonName: "Kamatis", scientificName: "Solanum lycopersicum" },
    expect: ["tomato"],
  },
  {
    name: "Potato is potato, not tomato",
    plant: { commonName: "Potato", scientificName: "Solanum tuberosum" },
    expect: ["potato"],
  },
  {
    name: "Eggplant (Solanum melongena) is NOT tomato",
    plant: {
      commonName: "Eggplant",
      scientificName: "Solanum melongena",
      commonNames: ["Talong"],
    },
    expect: [],
  },
  {
    name: "Talong must NOT get tomato",
    plant: { commonName: "Talong", scientificName: "Solanum melongena" },
    expect: [],
  },
  {
    name: "Pineapple must NOT match apple",
    plant: { commonName: "Pineapple", scientificName: "Ananas comosus" },
    expect: [],
  },
  {
    name: "Family Solanaceae alone must NOT unlock tomato",
    plant: {
      commonName: "Deadly nightshade",
      scientificName: "Atropa belladonna",
      family: "Solanaceae",
    },
    expect: [],
  },
  {
    name: "Bare lycopersicon alias removed — only full scientific names",
    plant: { commonName: "Mystery", scientificName: "Lycopersicon something" },
    // "lycopersicon esculentum" is multi-word; bare lycopersicon no longer in aliases
    expect: [],
  },
  {
    name: "Sili matches pepper, not tomato",
    plant: { commonName: "Sili", scientificName: "Capsicum annuum" },
    expect: ["pepper"],
  },
];

let failed = 0;

function pass(name, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"} — ${name}`);
  if (detail) console.log(`  ${detail}`);
  if (!ok) failed += 1;
}

for (const c of cases) {
  const got = matchingDiseaseCrops(c.plant);
  const ok = JSON.stringify(got) === JSON.stringify(c.expect);
  pass(c.name, ok, `got: ${JSON.stringify(got)} expected: ${JSON.stringify(c.expect)}`);
}

// Disease label parsing
{
  const p = parseDiseaseLabel("Tomato___Late_blight");
  pass(
    "parse Tomato___Late_blight",
    p.crop === "tomato" && /late blight/i.test(p.condition),
    JSON.stringify(p)
  );
}

// Tomato disease must NOT stick on mango even if cropMatched was true (old bug)
{
  const mango = {
    commonName: "Mango",
    scientificName: "Mangifera indica",
  };
  const fake = {
    status: "diseased",
    name: "Tomato: Late blight",
    condition: "Late blight",
    cropHint: "tomato",
    cropMatched: true,
    confidence: 92,
  };
  const out = reconcileLike(fake, mango);
  pass(
    "reconcile drops Tomato blight on mango even if cropMatched=true",
    out.status === "not_covered",
    JSON.stringify(out)
  );
}

// Tomato disease OK on real tomato
{
  const tomato = {
    commonName: "Kamatis",
    scientificName: "Solanum lycopersicum",
  };
  const real = {
    status: "diseased",
    name: "Tomato: Late blight",
    condition: "Late blight",
    cropHint: "tomato",
    cropMatched: true,
  };
  const out = reconcileLike(real, tomato);
  pass(
    "reconcile keeps Late blight on kamatis",
    out.status === "diseased" && out.cropHint === "tomato",
    JSON.stringify(out)
  );
}

// diseaseCropMatchesPlant: no loose includes ("acorn" must not match "corn")
{
  const cornPlant = { commonName: "Corn", scientificName: "Zea mays" };
  pass(
    "acorn cropHint does not match corn plant",
    diseaseCropMatchesPlant("acorn", cornPlant) === false,
    ""
  );
  pass(
    "corn cropHint matches corn plant",
    diseaseCropMatchesPlant("corn", cornPlant) === true,
    ""
  );
}

// assertDiseaseCropAllowed
{
  const gate = assertDiseaseCropAllowed(
    { status: "diseased", cropHint: "tomato", name: "Tomato: x" },
    { commonName: "Rose", scientificName: "Rosa rubiginosa" }
  );
  pass("assert rejects tomato on rose", gate.reject === true, JSON.stringify(gate));
}

process.exit(failed ? 1 : 0);
