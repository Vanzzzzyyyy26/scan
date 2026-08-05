import { useCallback, useEffect, useRef, useState } from "react";
import Hero from "./Hero";
import CapturePanel from "./CapturePanel";
import ResultPanel from "./ResultPanel";
import Footer from "./Footer";
import PlantChatbot from "./PlantChatbot";
import ScanHistory from "./ScanHistory";
import {
  fetchHealth,
  identifyPlant as identifyPlantApi,
  saveScanHistory,
} from "../utils/api";
import { fileToDataUrl, toJpegDataUrl } from "../utils/image";
import {
  requestCameraStream,
  cameraErrorMessage,
  captureFrameFromVideo,
} from "../utils/camera";
import {
  analyzeVideoFrame,
  analyzePlantRegions,
} from "../utils/plantDetect";

const SCAN_MEMORY_KEY = "plantBuddy.scannedPlants";
const ACTIVE_PLANT_KEY = "plantBuddy.activePlantKey";
const ACTIVE_PLANT_DATA_KEY = "plantBuddy.activePlant";

function plantMemoryKey(plant) {
  return [
    plant?.scientificName || "",
    plant?.commonName || "",
    plant?.commonNameFilipino || "",
  ]
    .join("|")
    .toLowerCase();
}

function loadJson(key, fallback) {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "null");
    return parsed == null ? fallback : parsed;
  } catch {
    return fallback;
  }
}

function saveLocalPlant(plant, imageDataUrl = "") {
  if (!plant || plant.isPlant === false) return;

  try {
    const savedAt = plant.savedAt || new Date().toISOString();
    const savedPlant = { ...plant, savedAt };
    const key = plantMemoryKey(savedPlant);
    const previous = Array.isArray(loadJson(SCAN_MEMORY_KEY, []))
      ? loadJson(SCAN_MEMORY_KEY, [])
      : [];
    const withoutDuplicate = previous.filter(
      (item) => plantMemoryKey(item) !== key
    );
    const next = [
      { ...savedPlant, imageDataUrl },
      ...withoutDuplicate,
    ].slice(0, 100);

    window.localStorage.setItem(SCAN_MEMORY_KEY, JSON.stringify(next));
    window.localStorage.setItem(ACTIVE_PLANT_KEY, key);
    window.localStorage.setItem(ACTIVE_PLANT_DATA_KEY, JSON.stringify(savedPlant));
  } catch {
    // Local memory is a convenience fallback; the app can continue without it.
  }
}

function loadActivePlant() {
  const activePlant = loadJson(ACTIVE_PLANT_DATA_KEY, null);
  if (activePlant) return activePlant;

  const activeKey = (() => {
    try {
      return window.localStorage.getItem(ACTIVE_PLANT_KEY) || "";
    } catch {
      return "";
    }
  })();
  const savedPlants = loadJson(SCAN_MEMORY_KEY, []);
  if (!activeKey || !Array.isArray(savedPlants)) return null;
  return savedPlants.find((item) => plantMemoryKey(item) === activeKey) || null;
}

function clearActivePlant() {
  try {
    window.localStorage.removeItem(ACTIVE_PLANT_KEY);
    window.localStorage.removeItem(ACTIVE_PLANT_DATA_KEY);
  } catch {
    // Ignore storage errors.
  }
}

/**
 * Main plant scanner screen: camera/upload, single-plant gate, identify.
 * Preview stays natural (no green highlight paint on the photo).
 */
function PlantScanner() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const detectTimerRef = useRef(null);

  const [cameraOn, setCameraOn] = useState(false);
  const [preview, setPreview] = useState(null);
  const [liveDetect, setLiveDetect] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [plant, setPlant] = useState(loadActivePlant);
  const [apiReady, setApiReady] = useState(null);
  const [view, setView] = useState(() =>
    window.location.hash === "#history" ? "history" : "scanner"
  );

  useEffect(() => {
    fetchHealth().then(setApiReady);

    const onHashChange = () => {
      setView(window.location.hash === "#history" ? "history" : "scanner");
    };
    window.addEventListener("hashchange", onHashChange);

    return () => {
      window.removeEventListener("hashchange", onHashChange);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (detectTimerRef.current) {
        clearInterval(detectTimerRef.current);
      }
    };
  }, []);

  // Attach + play only after cameraOn (so video is visible; mobile needs this for play())
  useEffect(() => {
    if (!cameraOn || !streamRef.current || !videoRef.current) return;

    const video = videoRef.current;
    const stream = streamRef.current;
    video.srcObject = stream;
    video.setAttribute("playsinline", "true");
    video.setAttribute("webkit-playsinline", "true");
    video.muted = true;

    const play = async () => {
      try {
        await video.play();
      } catch (err) {
        console.error("video.play failed:", err);
      }
    };

    if (video.readyState >= 2) {
      play();
    } else {
      video.onloadedmetadata = () => play();
    }

    return () => {
      video.onloadedmetadata = null;
    };
  }, [cameraOn]);

  // Live plant detection loop while camera is on
  useEffect(() => {
    if (detectTimerRef.current) {
      clearInterval(detectTimerRef.current);
      detectTimerRef.current = null;
    }

    if (!cameraOn) return undefined;

    let busy = false;
    detectTimerRef.current = setInterval(async () => {
      if (busy || !videoRef.current) return;
      busy = true;
      try {
        const result = await analyzeVideoFrame(videoRef.current);
        setLiveDetect(result);
      } catch {
        // ignore frame errors
      } finally {
        busy = false;
      }
    }, 450);

    return () => {
      if (detectTimerRef.current) {
        clearInterval(detectTimerRef.current);
        detectTimerRef.current = null;
      }
    };
  }, [cameraOn]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraOn(false);
  }, []);

  const processImage = useCallback(async (dataUrl) => {
    setPreview(dataUrl);
    setPlant(null);
    setError("");

    try {
      const analysis = await analyzePlantRegions(dataUrl);
      setLiveDetect(analysis);

      if (analysis.multiPlant) {
        setError(
          "May dalawa o higit pang halaman sa larawan. Mag-focus sa ISANG halaman lang para ma-scan."
        );
      } else if (analysis.noPlant) {
        setError(
          "Walang malinaw na halaman sa larawan. Subukan ulit na mas malapit at maliwanag."
        );
      }
    } catch (err) {
      console.error(err);
      setLiveDetect(null);
    }
  }, []);

  const startCamera = async () => {
    setError("");
    setPlant(null);
    setPreview(null);
    setLiveDetect(null);

    try {
      stopCamera();
      const stream = await requestCameraStream();
      streamRef.current = stream;
      setCameraOn(true);
    } catch (err) {
      console.error(err);
      setError(cameraErrorMessage(err));
    }
  };

  const capturePhoto = async () => {
    try {
      // Block capture when multi-plant is clearly detected live
      if (liveDetect?.multiPlant) {
        setError(
          "May dalawang halaman sa frame. I-focus ang ISANG halaman, tapos Capture ulit."
        );
        return;
      }

      const dataUrl = await captureFrameFromVideo(videoRef.current);
      stopCamera();
      await processImage(dataUrl);
    } catch (err) {
      setError(err.message || "Camera is not ready yet.");
    }
  };

  const onFileSelected = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setError("");
    setPlant(null);
    stopCamera();

    try {
      const raw = await fileToDataUrl(file);
      const jpeg = await toJpegDataUrl(raw);
      await processImage(jpeg);
    } catch (err) {
      setError(err.message || "Failed to load image");
    }
  };

  const identifyPlant = async () => {
    if (!preview) {
      setError("Kumuha muna o mag-upload ng larawan ng halaman.");
      return;
    }

    if (liveDetect?.multiPlant) {
      setError(
        "Hindi pwedeng i-scan kung may dalawa o higit pang halaman. Isang halaman lang."
      );
      return;
    }

    if (liveDetect?.noPlant) {
      setError(
        "Walang malinaw na halaman. Mag-upload o kumuha ng mas malinaw na larawan."
      );
      return;
    }

    setLoading(true);
    setError("");
    setPlant(null);

    try {
      const result = await identifyPlantApi(preview);
      setPlant(result);
      if (result?.isPlant !== false) {
        saveLocalPlant(result);
        let historyImage = "";
        try {
          historyImage = await toJpegDataUrl(preview, 640, 0.72);
          saveLocalPlant(result, historyImage);
          await saveScanHistory({ plant: result, imageDataUrl: historyImage });
        } catch (historyErr) {
          saveLocalPlant(result, historyImage);
          console.warn("History save skipped:", historyErr);
        }
      } else {
        clearActivePlant();
      }
    } catch (err) {
      console.error(err);
      setError(
        err.message ||
          "May error sa pag-scan. Siguraduhing naka-run ang server at may PLANTNET_API_KEY."
      );
    } finally {
      setLoading(false);
    }
  };

  const resetAll = () => {
    stopCamera();
    setPreview(null);
    setLiveDetect(null);
    setPlant(null);
    setError("");
    clearActivePlant();
  };

  const clearResult = () => {
    setPlant(null);
    setError("");
    clearActivePlant();
  };

  const openHistory = () => {
    stopCamera();
    window.location.hash = "history";
    setView("history");
  };

  const openScanner = () => {
    if (window.location.hash === "#history") {
      window.history.pushState("", document.title, window.location.pathname + window.location.search);
    }
    setView("scanner");
  };

  const openSavedPlant = (savedPlant) => {
    setPlant(savedPlant);
    saveLocalPlant(savedPlant, savedPlant.imageDataUrl || "");
    setPreview(null);
    setLiveDetect(null);
    setError("");
    openScanner();
  };

  return (
    <div className="app">
      <Hero
        apiReady={apiReady}
        onOpenHistory={view === "history" ? openScanner : openHistory}
        historyActive={view === "history"}
      />

      {view === "history" ? (
        <ScanHistory onBack={openScanner} onSelectPlant={openSavedPlant} />
      ) : (
        <main className="layout">
          <CapturePanel
            videoRef={videoRef}
            cameraOn={cameraOn}
            preview={preview}
            loading={loading}
            error={error}
            liveDetect={liveDetect}
            onStartCamera={startCamera}
            onStopCamera={stopCamera}
            onFileSelected={onFileSelected}
            onCapturePhoto={capturePhoto}
            onReset={resetAll}
            onIdentify={identifyPlant}
          />

          <ResultPanel loading={loading} plant={plant} onClear={clearResult} />
        </main>
      )}

      <Footer />

      {/* Floating chatbot — expands when tapped; uses scanned plant as context */}
      <PlantChatbot plant={plant} />
    </div>
  );
}

export default PlantScanner;
