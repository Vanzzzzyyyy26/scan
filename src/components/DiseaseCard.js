function StatusIcon({ status }) {
  if (status === "healthy") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="m5 12 4 4 10-10" />
      </svg>
    );
  }

  if (status === "diseased") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M12 3 2.8 19h18.4L12 3Z" />
        <path d="M12 8v5" />
        <path d="M12 16.5v.1" />
      </svg>
    );
  }

  if (status === "unavailable") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M7 7h10v10H7z" />
        <path d="M9 3v4" />
        <path d="M15 3v4" />
        <path d="M9 17v4" />
        <path d="M15 17v4" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 17h.01" />
      <path d="M12 13a3 3 0 1 0-3-3" />
      <path d="M12 22a10 10 0 1 0-10-10 10 10 0 0 0 10 10Z" />
    </svg>
  );
}

function DiseaseCard({ disease }) {
  if (!disease) return null;

  const status = String(disease.status || "unknown").toLowerCase();
  const title =
    status === "healthy"
      ? "Mukhang healthy"
      : status === "diseased"
        ? "May posibleng sakit"
        : status === "uncertain"
          ? "Hindi pa sigurado"
          : status === "not_covered"
            ? "Hindi sakop ng disease model"
            : status === "unavailable"
              ? "Hindi available ang disease check"
              : "Health check";

  const showDiseaseName =
    disease.name &&
    status !== "healthy" &&
    status !== "unavailable" &&
    status !== "not_covered";

  const hasAlternatives =
    Array.isArray(disease.alternatives) && disease.alternatives.length > 0;

  return (
    <div className={`disease-card disease-${status}`}>
      <div className="disease-header">
        <span className="disease-icon" aria-hidden="true">
          <StatusIcon status={status} />
        </span>
        <div>
          <p className="disease-eyebrow">Kalagayan ng dahon</p>
          <h4>{title}</h4>
        </div>
        {disease.confidence > 0 && status !== "not_covered" && (
          <span className="disease-conf">{disease.confidence}%</span>
        )}
      </div>

      {showDiseaseName && (
        <p className="disease-name">Possible: {disease.name}</p>
      )}

      {disease.summary && <p className="disease-summary">{disease.summary}</p>}

      {disease.advice && (
        <p className="disease-advice">
          <strong>Payo:</strong> {disease.advice}
        </p>
      )}

      {hasAlternatives && (
        <div className="disease-alt-block">
          <p className="disease-alt-title">Iba pang possible na nakita:</p>
          <ul className="disease-alts">
            {disease.alternatives.map((alt, i) => (
              <li key={i}>
                {alt.name}
                {alt.confidence != null ? ` (${alt.confidence}%)` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default DiseaseCard;
