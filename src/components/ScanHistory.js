import { useEffect, useMemo, useState } from "react";
import {
  deleteScanHistory as deleteScanHistoryApi,
  fetchScanHistory,
} from "../utils/api";

const SCAN_MEMORY_KEY = "plantBuddy.scannedPlants";
const ACTIVE_PLANT_KEY = "plantBuddy.activePlantKey";
const HISTORY_PAGE_SIZE = 10;

function plantDisplayName(plant) {
  return (
    plant?.commonNameFilipino ||
    plant?.commonName ||
    plant?.scientificName ||
    "Unknown plant"
  );
}

function plantMemoryKey(plant) {
  return [
    plant?.scientificName || "",
    plant?.commonName || "",
    plant?.commonNameFilipino || "",
  ]
    .join("|")
    .toLowerCase();
}

function loadSavedPlants() {
  try {
    const raw = window.localStorage.getItem(SCAN_MEMORY_KEY);
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function scanToPlant(scan) {
  return {
    ...(scan.plant || {}),
    savedAt: scan.savedAt || scan.plant?.savedAt || "",
    historyId: scan.id,
    imageDataUrl: scan.imageDataUrl || "",
  };
}

function saveActivePlant(plant) {
  try {
    window.localStorage.setItem(ACTIVE_PLANT_KEY, plantMemoryKey(plant));
  } catch {
    // Ignore storage errors; selected card can still open in the UI.
  }
}

function formatDate(value) {
  if (!value) return "No date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No date";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function HistoryIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 12a8 8 0 1 0 2.35-5.65" />
      <path d="M4 5v5h5" />
      <path d="M12 8v5l3 2" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" />
      <path d="m16 16 5 5" />
    </svg>
  );
}

function ArrowLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M19 12H5" />
      <path d="m12 5-7 7 7 7" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function diseaseStatus(plant) {
  return String(plant?.disease?.status || "unknown").toLowerCase();
}

function diseaseLabel(status) {
  if (status === "healthy") return "Healthy";
  if (status === "diseased") return "May sakit";
  if (status === "uncertain") return "Hindi sigurado";
  if (status === "not_covered") return "Not covered";
  if (status === "unavailable") return "Unavailable";
  return "No check";
}

function ScanHistory({ onBack, onSelectPlant }) {
  const [plants, setPlants] = useState(loadSavedPlants);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");

  const refreshHistory = async () => {
    setLoading(true);
    setHistoryError("");
    try {
      const scans = await fetchScanHistory(100);
      setPlants(scans.map(scanToPlant));
    } catch (err) {
      setHistoryError(
        err.message ||
          "Hindi ma-load ang MySQL history. I-check kung naka-run ang backend at database."
      );
      setPlants(loadSavedPlants());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshHistory();
  }, []);

  const filteredPlants = useMemo(() => {
    const q = query.trim().toLowerCase();
    return plants.filter((plant) => {
      const status = diseaseStatus(plant);
      const matchesStatus = statusFilter === "all" || status === statusFilter;
      const blob = [
        plant.commonName,
        plant.commonNameFilipino,
        plant.scientificName,
        plant.family,
        plant.description,
        plant.disease?.name,
        plant.disease?.condition,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const matchesQuery = !q || blob.includes(q);
      return matchesStatus && matchesQuery;
    });
  }, [plants, query, statusFilter]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredPlants.length / HISTORY_PAGE_SIZE)
  );
  const pageStart = (currentPage - 1) * HISTORY_PAGE_SIZE;
  const pageEnd = Math.min(pageStart + HISTORY_PAGE_SIZE, filteredPlants.length);
  const paginatedPlants = filteredPlants.slice(pageStart, pageEnd);

  useEffect(() => {
    setCurrentPage(1);
  }, [query, statusFilter]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const openPlant = (plant) => {
    saveActivePlant(plant);
    onSelectPlant(plant);
  };

  const deletePlant = async (plant) => {
    if (!plant.historyId) return;
    setHistoryError("");
    try {
      await deleteScanHistoryApi(plant.historyId);
      setPlants((prev) => prev.filter((item) => item.historyId !== plant.historyId));
    } catch (err) {
      setHistoryError(err.message || "Hindi ma-delete ang history item.");
    }
  };

  return (
    <main className="history-page">
      <div className="history-page-header">
        <button type="button" className="history-back-btn" onClick={onBack}>
          <ArrowLeftIcon />
          Back
        </button>
        <div className="history-heading">
          <span className="history-heading-icon" aria-hidden="true">
            <HistoryIcon />
          </span>
          <div>
            <h2>Scan History</h2>
          <p>{loading ? "Loading history..." : `${plants.length} saved scanned plants`}</p>
          </div>
        </div>
      </div>

      <section className="history-tools" aria-label="History filters">
        <label className="history-search">
          <SearchIcon />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, family, disease..."
          />
        </label>
        <select
          className="history-filter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter by disease status"
        >
          <option value="all">All scans</option>
          <option value="healthy">Healthy</option>
          <option value="diseased">May sakit</option>
          <option value="uncertain">Hindi sigurado</option>
          <option value="not_covered">Not covered</option>
          <option value="unavailable">Unavailable</option>
          <option value="unknown">No check</option>
        </select>
        <button type="button" className="history-refresh-btn" onClick={refreshHistory}>
          Refresh
        </button>
      </section>

      {historyError && (
        <section className="history-error" role="status">
          {historyError}
        </section>
      )}

      {filteredPlants.length === 0 ? (
        <section className="history-empty">
          <p>{loading ? "Loading saved scans..." : "Wala pang scan na tugma sa filter."}</p>
        </section>
      ) : (
        <>
          <section className="history-grid" aria-label="Saved scanned plants">
            {paginatedPlants.map((plant) => {
              const status = diseaseStatus(plant);
              const label = plantDisplayName(plant);
              return (
                <article className="history-card" key={`${plantMemoryKey(plant)}-${plant.savedAt || ""}`}>
                  {plant.imageDataUrl && (
                    <img
                      className="history-image"
                      src={plant.imageDataUrl}
                      alt={label}
                      loading="lazy"
                    />
                  )}
                  <div className="history-card-head">
                    <div>
                      <p className="history-date">{formatDate(plant.savedAt)}</p>
                      <h3>{label}</h3>
                      {plant.scientificName && (
                        <p className="history-scientific">{plant.scientificName}</p>
                      )}
                    </div>
                    <span className={`history-status history-status-${status}`}>
                      {diseaseLabel(status)}
                    </span>
                  </div>

                  {plant.family && (
                    <p className="history-family">Family: {plant.family}</p>
                  )}

                  {plant.disease?.name && status === "diseased" && (
                    <p className="history-disease">
                      Possible: {plant.disease.name}
                      {plant.disease.confidence ? ` (${plant.disease.confidence}%)` : ""}
                    </p>
                  )}

                  {plant.description && (
                    <p className="history-desc">{plant.description}</p>
                  )}

                  <div className="history-card-actions">
                    <button
                      type="button"
                      className="history-open-btn"
                      onClick={() => openPlant(plant)}
                    >
                      Open scan
                    </button>
                    {plant.historyId && (
                      <button
                        type="button"
                        className="history-delete-btn"
                        onClick={() => deletePlant(plant)}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </section>

          {totalPages > 1 && (
            <nav className="history-pagination" aria-label="Scan history pagination">
              <p className="history-pagination-summary">
                Showing {pageStart + 1}-{pageEnd} of {filteredPlants.length}
              </p>
              <div className="history-pagination-controls">
                <button
                  type="button"
                  className="history-page-btn"
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  disabled={currentPage === 1}
                  aria-label="Previous page"
                >
                  <ChevronLeftIcon />
                </button>
                {Array.from({ length: totalPages }, (_, index) => {
                  const page = index + 1;
                  return (
                    <button
                      type="button"
                      className={`history-page-btn${page === currentPage ? " is-active" : ""}`}
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      aria-current={page === currentPage ? "page" : undefined}
                    >
                      {page}
                    </button>
                  );
                })}
                <button
                  type="button"
                  className="history-page-btn"
                  onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                  disabled={currentPage === totalPages}
                  aria-label="Next page"
                >
                  <ChevronRightIcon />
                </button>
              </div>
            </nav>
          )}
        </>
      )}
    </main>
  );
}

export default ScanHistory;
