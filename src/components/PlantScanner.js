import { useCallback, useEffect, useRef, useState } from "react";
import Hero from "./Hero";
import CapturePanel from "./CapturePanel";
import ResultPanel from "./ResultPanel";
import Footer from "./Footer";
import { fetchHealth, identifyPlant as identifyPlantApi } from "../utils/api";
import { fileToDataUrl, toJpegDataUrl } from "../utils/image";
import {
  requestCameraStream,
  cameraErrorMessage,
  captureFrameFromVideo,
} from "../utils/camera";

/**
 * Main plant scanner screen: camera/upload, identify API, and results.
 * App.js only mounts this component.
 */
function PlantScanner() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const [cameraOn, setCameraOn] = useState(false);
  const [preview, setPreview] = useState(null);
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

  const startCamera = async () => {
    setError("");
    setPlant(null);
    setPreview(null);

    try {
      stopCamera();
      const stream = await requestCameraStream();
      streamRef.current = stream;
      // Mount <video> first; useEffect attaches stream + play()
      setCameraOn(true);
    } catch (err) {
      console.error(err);
      setError(cameraErrorMessage(err));
    }
  };

  const capturePhoto = async () => {
    try {
      const dataUrl = await captureFrameFromVideo(videoRef.current);
      setPreview(dataUrl);
      stopCamera();
      setPlant(null);
      setError("");
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
      setPreview(jpeg);
    } catch (err) {
      setError(err.message || "Failed to load image");
    }
  };

  const identifyPlant = async () => {
    if (!preview) {
      setError("Kumuha muna o mag-upload ng larawan ng halaman.");
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
          "May error sa pag-scan. Siguraduhing naka-run ang server at may PLANTNET_API_KEY.",
      );
    } finally {
      setLoading(false);
    }
  };

  const resetAll = () => {
    stopCamera();
    setPreview(null);
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
          onStartCamera={startCamera}
          onFileSelected={onFileSelected}
          onCapturePhoto={capturePhoto}
          onReset={resetAll}
          onIdentify={identifyPlant}
        />

        <ResultPanel loading={loading} plant={plant} />
      </main>

      <Footer />
    </div>
  );
}

export default PlantScanner;
