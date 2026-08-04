/**
 * Capture UI: idle / live camera / natural preview (no green paint on photo).
 */
function CapturePanel({
  videoRef,
  cameraOn,
  preview,
  loading,
  error,
  liveDetect,
  onStartCamera,
  onStopCamera,
  onFileSelected,
  onCapturePhoto,
  onReset,
  onIdentify,
}) {
  const showLive = cameraOn;
  const showPreview = !cameraOn && preview;
  const displayImage = preview;

  const status = liveDetect?.status;
  const guideClass =
    status === "multi_plant"
      ? "cam-guide warn"
      : status === "no_plant" || status === "too_far"
        ? "cam-guide soft"
        : status === "ok"
          ? "cam-guide good"
          : "cam-guide";

  return (
    <section className={`panel capture-panel ${showLive ? "camera-mode" : ""}`}>
      <div className="capture-header">
        <h2>{showLive ? "Live Camera" : "1. Kunin ang larawan"}</h2>
        {showLive && (
          <button
            type="button"
            className="btn ghost cam-close-btn"
            onClick={onStopCamera}
            aria-label="Isara ang camera"
          >
            ✕ Isara
          </button>
        )}
      </div>

      {!showLive && (
        <div className="actions">
          <button type="button" className="btn primary cam-open-btn" onClick={onStartCamera}>
            <span className="cam-open-icon" aria-hidden>
              📷
            </span>
            Open Camera
          </button>
          <label className="btn cam-upload-btn" style={{ display: "inline-flex", cursor: "pointer" }}>
            <span aria-hidden>🖼️</span>
            Upload Photo
            <input
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={onFileSelected}
            />
          </label>
          {(preview || cameraOn) && (
            <button type="button" className="btn ghost" onClick={onReset}>
              Reset
            </button>
          )}
        </div>
      )}

      <div className={`viewport ${showLive ? "viewport-live" : ""} ${showPreview ? "viewport-preview" : ""}`}>
        {/* Live video — kept in DOM for mobile stream attach */}
        <video
          ref={videoRef}
          className={`media camera-video ${cameraOn ? "is-on" : "is-off"}`}
          playsInline
          muted
          autoPlay
          controls={false}
        />

        {showPreview && (
          <img
            src={displayImage}
            alt="Selected plant"
            className="media preview-img"
          />
        )}

        {!cameraOn && !preview && (
          <div className="placeholder">
            <div className="placeholder-ring">
              <span className="leaf">🌿</span>
            </div>
            <p className="placeholder-title">I-scan ang isang halaman</p>
            <p className="placeholder-sub">
              I-open ang camera o mag-upload · isang subject lang
            </p>
          </div>
        )}

        {/* Live camera chrome */}
        {showLive && (
          <>
            <div className="cam-vignette" aria-hidden />
            <div className="cam-scan-frame" aria-hidden>
              <span className="corner tl" />
              <span className="corner tr" />
              <span className="corner bl" />
              <span className="corner br" />
              <div className="cam-scan-line" />
            </div>

            {/* Multi-plant warning boxes only — single plant stays natural (no green box) */}
            {liveDetect?.multiPlant && liveDetect?.mainBoxNorm && (
              <div
                className="plant-box main-plant is-multi"
                style={normBoxStyle(liveDetect.mainBoxNorm)}
              >
                <span className="plant-box-label">Halaman 1</span>
              </div>
            )}
            {liveDetect?.multiPlant &&
              (liveDetect.otherBoxesNorm || []).map((box, i) => (
                <div
                  key={i}
                  className="plant-box extra-plant"
                  style={normBoxStyle(box)}
                >
                  <span className="plant-box-label">Halaman {i + 2}</span>
                </div>
              ))}

            <div className={guideClass}>
              <span className="cam-guide-dot" />
              <span>
                {liveDetect?.message ||
                  "I-align ang ISANG halaman sa gitna ng frame"}
              </span>
            </div>

            <div className="cam-bottom-bar">
              <label className="cam-side-btn" title="Upload">
                <span aria-hidden>🖼️</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  hidden
                  onChange={onFileSelected}
                />
              </label>

              <button
                type="button"
                className="cam-shutter"
                onClick={onCapturePhoto}
                disabled={liveDetect?.multiPlant || liveDetect?.noPlant}
                aria-label="Capture photo"
                title={
                  liveDetect?.multiPlant
                    ? "Isang halaman lang ang pwedeng i-scan"
                    : "Capture"
                }
              >
                <span className="cam-shutter-ring" />
                <span className="cam-shutter-core" />
              </button>

              <button
                type="button"
                className="cam-side-btn"
                onClick={onStopCamera}
                title="Isara"
                aria-label="Isara ang camera"
              >
                ✕
              </button>
            </div>
          </>
        )}

        {showPreview && liveDetect?.multiPlant && !loading && (
          <div className="preview-badge warn">⚠️ Maraming halaman</div>
        )}

        {/* Scanning overlay while waiting for plant name + description */}
        {showPreview && loading && (
          <div className="identify-scan-overlay" aria-live="polite" aria-busy="true">
            <div className="identify-scan-frame" aria-hidden>
              <span className="corner tl" />
              <span className="corner tr" />
              <span className="corner bl" />
              <span className="corner br" />
              <div className="identify-scan-beam" />
              <div className="identify-scan-grid" />
            </div>
            <div className="identify-scan-status">
              <span className="identify-scan-pulse" aria-hidden />
              <span>Sina-scan ang halaman…</span>
            </div>
          </div>
        )}
      </div>

      {!showLive && (
        <>
          {preview && liveDetect?.multiPlant && (
            <div className="multi-plant-banner">
              <strong>Hindi pwedeng i-scan</strong>
              <p>
                May dalawa o higit pang halaman sa larawan. Mag-focus sa{" "}
                <em>isang</em> halaman lang — mas malapit, o i-crop ang iba.
              </p>
            </div>
          )}

          <button
            type="button"
            className="btn primary scan-btn"
            onClick={onIdentify}
            disabled={
              !preview ||
              loading ||
              liveDetect?.multiPlant ||
              liveDetect?.noPlant
            }
          >
            {loading ? (
              <span className="scan-btn-loading">
                <span className="scan-btn-dots" aria-hidden>
                  <i />
                  <i />
                  <i />
                </span>
                Sina-scan…
              </span>
            ) : liveDetect?.multiPlant ? (
              "Isang halaman lang ang pwedeng i-scan"
            ) : (
              "Scan Plant"
            )}
          </button>
        </>
      )}

      {error && <div className="error-box">{error}</div>}
    </section>
  );
}

function normBoxStyle(box) {
  if (!box) return { display: "none" };
  return {
    left: `${box.x * 100}%`,
    top: `${box.y * 100}%`,
    width: `${box.w * 100}%`,
    height: `${box.h * 100}%`,
  };
}

export default CapturePanel;
