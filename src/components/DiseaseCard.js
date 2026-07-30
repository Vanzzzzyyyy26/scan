function DiseaseCard({ disease }) {
  if (!disease) return null;

  const status = String(disease.status || "unknown").toLowerCase();
  const title =
    status === "healthy"
      ? "Malusog"
      : status === "diseased"
        ? "May posibleng sakit"
        : status === "uncertain"
          ? "Hindi sigurado"
          : status === "not_covered"
            ? "Hindi sakop ng disease model"
            : status === "unavailable"
              ? "Hindi available ang disease check"
              : "Health check";

  const icon =
    status === "healthy"
      ? "✅"
      : status === "diseased"
        ? "⚠️"
        : status === "not_covered"
          ? "ℹ️"
          : status === "unavailable"
            ? "🔌"
            : "🩺";

  const showDiseaseName =
    disease.name &&
    status !== "healthy" &&
    status !== "unavailable" &&
    status !== "not_covered";

  return (
    <div className={`disease-card disease-${status}`}>
      <div className="disease-header">
        <span className="disease-icon" aria-hidden="true">
          {icon}
        </span>
        <div>
          <p className="disease-eyebrow">Kalagayan ng dahon</p>
          <h4>{title}</h4>
        </div>
        {disease.confidence > 0 && status !== "not_covered" && (
          <span className="disease-conf">{disease.confidence}%</span>
        )}
      </div>

      {showDiseaseName && <p className="disease-name">{disease.name}</p>}

      {disease.summary && <p className="disease-summary">{disease.summary}</p>}

      {disease.advice && (
        <p className="disease-advice">
          <strong>Payo:</strong> {disease.advice}
        </p>
      )}

      {Array.isArray(disease.alternatives) && disease.alternatives.length > 0 && (
        <ul className="disease-alts">
          {disease.alternatives.map((alt, i) => (
            <li key={i}>
              {alt.name}
              {alt.confidence != null ? ` (${alt.confidence}%)` : ""}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default DiseaseCard;
