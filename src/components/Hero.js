import { statusPillClass, statusPillText } from "../utils/api";

function Hero({ apiReady }) {
  return (
    <header className="hero">
      <div className="hero-badge">Plant Scanner</div>
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
