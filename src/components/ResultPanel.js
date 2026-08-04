import ConfidenceBadge from "./ConfidenceBadge";
import DiseaseCard from "./DiseaseCard";
import { sanitizeDiseaseForPlant } from "../utils/disease";

function RejectedResult({ plant }) {
  return (
    <article className="result-card rejected-card">
      <div className="result-header">
        <div>
          <p className="eyebrow eyebrow-danger">Hindi tinanggap</p>
          <h3>{plant.commonName || "Hindi halaman o puno"}</h3>
        </div>
        <span className="badge badge-rejected">Not a plant</span>
      </div>
      {plant.description && (
        <div className="block">
          <h4>Bakit?</h4>
          <p>{plant.description}</p>
        </div>
      )}
      {plant.notes && (
        <div className="block notes">
          <h4>Notes</h4>
          <p>{plant.notes}</p>
        </div>
      )}
      <div className="block tip-block">
        <h4>Paano mag-scan nang tama</h4>
        <ul>
          <li>I-focus ang dahon, bulaklak, prutas, o balat ng puno</li>
          <li>Iwasan ang tao, hayop, gamit, o random objects</li>
          <li>Malapit at maliwanag ang larawan</li>
        </ul>
      </div>
    </article>
  );
}

function PlantResult({ plant }) {
  return (
    <article className="result-card">
      <div className="result-header">
        <div>
          <p className="eyebrow">Natukoy na halaman / puno</p>
          <h3>{plant.commonName || "Unknown plant"}</h3>
          {plant.commonNameFilipino && (
            <p className="filipino-name">{plant.commonNameFilipino}</p>
          )}
          {plant.scientificName && (
            <p className="scientific">{plant.scientificName}</p>
          )}
        </div>
        <ConfidenceBadge level={plant.confidence} />
      </div>

      <DiseaseCard disease={sanitizeDiseaseForPlant(plant.disease, plant)} />

      {plant.family && (
        <div className="meta-row">
          <span className="meta-label">Family</span>
          <span>{plant.family}</span>
        </div>
      )}

      {plant.description && (
        <div className="block">
          <h4>Description</h4>
          <p>{plant.description}</p>
        </div>
      )}

      {plant.origin && (
        <div className="block highlight">
          <h4>Origin</h4>
          <p>{plant.origin}</p>
        </div>
      )}

      {plant.habitat && (
        <div className="block">
          <h4>Habitat</h4>
          <p>{plant.habitat}</p>
        </div>
      )}

      {Array.isArray(plant.interestingFacts) &&
        plant.interestingFacts.length > 0 && (
          <div className="block">
            <h4>Interesting facts</h4>
            <ul>
              {plant.interestingFacts.map((fact, i) => (
                <li key={i}>{fact}</li>
              ))}
            </ul>
          </div>
        )}

      {plant.notes && (
        <div className="block notes">
          <h4>Notes</h4>
          <p>{plant.notes}</p>
        </div>
      )}
    </article>
  );
}

function ResultPanel({ loading, plant }) {
  return (
    <section className="panel result-panel">
      <h2>2. Resulta</h2>

      {loading && (
        <div className="loading-card identify-loading" aria-live="polite" aria-busy="true">
          <div className="identify-radar" aria-hidden>
            <div className="identify-radar-ring ring-1" />
            <div className="identify-radar-ring ring-2" />
            <div className="identify-radar-ring ring-3" />
            <div className="identify-radar-core">🌿</div>
            <div className="identify-radar-sweep" />
          </div>
          <p className="identify-loading-title">Sina-scan ang halaman…</p>
          <p className="identify-loading-sub">
            Kinikilala ang pangalan at description. Sandali lang.
          </p>
          <ul className="identify-loading-steps" aria-hidden>
            <li className="step active">Sinusuri ang larawan</li>
            <li className="step active delay-1">Hinahanap ang pangalan</li>
            <li className="step delay-2">Kinukuha ang description</li>
          </ul>
        </div>
      )}

      {!loading && !plant && (
        <div className="empty-result">
          <p>
            Pagkatapos mag-scan, lalabas dito kung halaman/puno ba ito, ang
            pangalan nito, at kung may posibleng sakit ang dahon.
          </p>
        </div>
      )}

      {!loading && plant && plant.isPlant === false && (
        <RejectedResult plant={plant} />
      )}

      {!loading && plant && plant.isPlant !== false && (
        <PlantResult plant={plant} />
      )}
    </section>
  );
}

export default ResultPanel;
