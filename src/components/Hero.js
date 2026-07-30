import { statusPillClass, statusPillText } from "../utils/api";

function Hero({ apiReady }) {
  return (
    <header className="hero">
      <div className="hero-badge">Plant Scanner</div>
      <h1>I-scan ang Puno o Halaman</h1>
      <p>
        Tanging halaman at puno lang ang tinatanggap. May disease check din
        para sa posibleng sakit ng dahon.
      </p>
      {apiReady && (
        <div className={`status-pill ${statusPillClass(apiReady)}`}>
          {statusPillText(apiReady)}
        </div>
      )}
    </header>
  );
}

export default Hero;
