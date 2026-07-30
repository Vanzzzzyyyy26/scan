/** Request a camera stream, trying back camera first then looser constraints. */
export async function requestCameraStream() {
  if (!window.isSecureContext) {
    throw new Error(
      "Kailangan ng HTTPS ang camera sa phone. Gamitin ang Dev Tunnel (https), hindi plain http.",
    );
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(
      "Hindi support ng browser ang camera. Subukan ang Chrome/Safari, o gumamit ng Upload.",
    );
  }

  // Try back camera first, then looser constraints (many phones reject ideal width/height)
  const attempts = [
    {
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    },
    {
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    },
    {
      video: { facingMode: "environment" },
      audio: false,
    },
    { video: true, audio: false },
  ];

  let lastError;
  for (const constraints of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error("Camera access failed");
}

/** Human-readable message for common getUserMedia errors. */
export function cameraErrorMessage(err) {
  const name = err?.name || "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "Blocked ang camera. Payagan ang Camera permission sa browser/site settings, tapos subukan ulit.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "Walang nakitang camera. Gumamit ng Upload Photo.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "Ginagamit ng ibang app ang camera. Isara muna ang ibang camera apps.";
  }
  return (
    err?.message ||
    "Hindi mabuksan ang camera. Payagan ang access, o gumamit ng Upload."
  );
}

/**
 * Grab a JPEG frame from a <video> element.
 * Waits briefly for mobile video dimensions if needed.
 */
export async function captureFrameFromVideo(video) {
  if (!video) {
    throw new Error("Camera is not ready yet.");
  }

  let tries = 0;
  while ((!video.videoWidth || !video.videoHeight) && tries < 20) {
    await new Promise((r) => setTimeout(r, 50));
    tries += 1;
  }

  if (!video.videoWidth || !video.videoHeight) {
    throw new Error(
      "Camera is not ready yet. Hintayin ang preview, tapos Capture ulit.",
    );
  }

  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0);
  return canvas.toDataURL("image/jpeg", 0.92);
}
