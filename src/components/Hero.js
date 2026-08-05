import { statusPillClass, statusPillText } from "../utils/api";

function HistoryIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 12a8 8 0 1 0 2.35-5.65" />
      <path d="M4 5v5h5" />
      <path d="M12 8v5l3 2" />
    </svg>
  );
}

function Hero({ apiReady, onOpenHistory, historyActive = false }) {
  return (
    <header className="hero">
      <div className="hero-topbar">
        <div className="hero-badge">Plant Scanner</div>
        <button
          type="button"
          className={`history-top-btn ${historyActive ? "is-active" : ""}`}
          onClick={onOpenHistory}
          aria-label={historyActive ? "Bumalik sa scanner" : "Buksan ang scan history"}
        >
          <HistoryIcon />
          {historyActive ? "Scanner" : "History"}
        </button>
      </div>
      <h1>I-scan ang Puno o Halaman</h1>
      <p>Vanz dev.</p>
      {apiReady && (
        <div className={`status-pill ${statusPillClass(apiReady)}`}>
          {statusPillText(apiReady)}
        </div>
      )}
    </header>
  );
}

export default Hero;
