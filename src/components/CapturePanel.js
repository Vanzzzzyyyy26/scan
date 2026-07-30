function CapturePanel({
  videoRef,
  cameraOn,
  preview,
  loading,
  error,
  onStartCamera,
  onFileSelected,
  onCapturePhoto,
  onReset,
  onIdentify,
}) {
  return (
    <section className="panel capture-panel">
      <h2>1. Kunin ang larawan</h2>

      <div className="actions">
        <button type="button" className="btn primary" onClick={onStartCamera}>
          {cameraOn ? "Restart Camera" : "Open Camera"}
        </button>
        <label className="btn" style={{ display: "inline-flex", cursor: "pointer" }}>
          Upload Photo
          <input
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={onFileSelected}
          />
        </label>
        {cameraOn && (
          <button type="button" className="btn accent" onClick={onCapturePhoto}>
            Capture
          </button>
        )}
        {(preview || cameraOn) && (
          <button type="button" className="btn ghost" onClick={onReset}>
            Reset
          </button>
        )}
      </div>

      <div className="viewport">
        {/* Keep video in DOM while active so stream can attach after mount (mobile fix) */}
        <video
          ref={videoRef}
          className={`media camera-video ${cameraOn ? "is-on" : "is-off"}`}
          playsInline
          muted
          autoPlay
          controls={false}
        />
        {!cameraOn && preview && (
          <img src={preview} alt="Selected plant" className="media" />
        )}
        {!cameraOn && !preview && (
          <div className="placeholder">
            <span className="leaf">🌿</span>
            <p>I-point ang camera sa dahon, puno, o halaman</p>
          </div>
        )}
      </div>

      <button
        type="button"
        className="btn primary scan-btn"
        onClick={onIdentify}
        disabled={!preview || loading}
      >
        {loading ? "Sina-scan..." : "Scan Plant"}
      </button>

      {error && <div className="error-box">{error}</div>}
    </section>
  );
}

export default CapturePanel;
