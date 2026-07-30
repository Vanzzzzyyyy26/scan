function ConfidenceBadge({ level }) {
  if (!level) return null;
  const normalized = String(level).toLowerCase();
  return (
    <span className={`badge badge-${normalized}`}>
      Confidence: {normalized}
    </span>
  );
}

export default ConfidenceBadge;
