import { useCallback, useEffect, useRef, useState } from "react";
import Hero from "./Hero";
import CapturePanel from "./CapturePanel";
import ResultPanel from "./ResultPanel";
import Footer from "./Footer";
import PlantChatbot from "./PlantChatbot";
import { fetchHealth, identifyPlant as identifyPlantApi } from "../utils/api";
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
  const [plant, setPlant] = useState(null);
  const [apiReady, setApiReady] = useState(null);

  useEffect(() => {
    fetchHealth().then(setApiReady);

    return () => {
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
  };

  return (
    <div className="app">
      <Hero apiReady={apiReady} />

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

        <ResultPanel loading={loading} plant={plant} />
      </main>

      <Footer />

      {/* Floating chatbot — expands when tapped; uses scanned plant as context */}
      <PlantChatbot plant={plant} />
    </div>
  );
}

export default PlantScanner;
