const https = require("https");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const key = process.env.PLANTNET_API_KEY;
const tiny = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+7AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH+oAAAAAElFTkSuQmCC",
  "base64"
);

function multipartBody(fields, files) {
  const boundary = `----PlantBoundary${Date.now()}`;
  const chunks = [];
  for (const [name, value] of Object.entries(fields)) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
        "utf8"
      )
    );
  }
  for (const file of files) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${file.name}"; filename="${file.filename}"\r\nContent-Type: ${file.mime}\r\n\r\n`,
        "utf8"
      )
    );
    chunks.push(file.buffer);
    chunks.push(Buffer.from("\r\n", "utf8"));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`, "utf8"));
  return { boundary, body: Buffer.concat(chunks) };
}

function httpsPost({ hostname, path: reqPath, body, contentType, timeoutMs = 60000 }) {
  return new Promise((resolve, reject) => {
    const t = Date.now();
    const req = https.request(
      {
        hostname,
        path: reqPath,
        method: "POST",
        headers: {
          "Content-Type": contentType,
          "Content-Length": body.length,
          Connection: "close",
          Accept: "application/json",
        },
        timeout: timeoutMs,
        servername: hostname,
      },
      (res) => {
        const parts = [];
        res.on("data", (c) => parts.push(c));
        res.on("end", () => {
          resolve({
            status: res.statusCode,
            text: Buffer.concat(parts).toString("utf8"),
            ms: Date.now() - t,
          });
        });
      }
    );
    req.on("timeout", () => {
      req.destroy(new Error(`Request timed out after ${timeoutMs}ms`));
    });
    req.on("error", (err) => {
      err.ms = Date.now() - t;
      reject(err);
    });
    req.write(body);
    req.end();
  });
}

(async () => {
  const { boundary, body } = multipartBody(
    { organs: "auto" },
    [{ name: "images", filename: "plant.png", mime: "image/png", buffer: tiny }]
  );
  const reqPath =
    `/v2/identify/all?api-key=${encodeURIComponent(key)}` +
    `&include-related-images=false&no-reject=false&lang=en&nb-results=3`;

  console.log("POST my-api.plantnet.org ...");
  try {
    const res = await httpsPost({
      hostname: "my-api.plantnet.org",
      path: reqPath,
      body,
      contentType: `multipart/form-data; boundary=${boundary}`,
      timeoutMs: 60000,
    });
    console.log("status", res.status, "ms", res.ms);
    console.log(res.text.slice(0, 500));
  } catch (e) {
    console.error("FAIL", e.message, "ms", e.ms);
  }

  // Also compare global fetch timing
  console.log("\nPOST via global fetch ...");
  const t = Date.now();
  try {
    const form = new FormData();
    form.append("images", new Blob([tiny], { type: "image/png" }), "plant.png");
    form.append("organs", "auto");
    const url = `https://my-api.plantnet.org${reqPath}`;
    const res = await fetch(url, { method: "POST", body: form });
    const text = await res.text();
    console.log("status", res.status, "ms", Date.now() - t);
    console.log(text.slice(0, 300));
  } catch (e) {
    console.error("fetch FAIL", e.message, e.cause && e.cause.code, "ms", Date.now() - t);
  }
})();
