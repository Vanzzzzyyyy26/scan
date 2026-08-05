const mysql = require("mysql2/promise");

let pool = null;
let initPromise = null;

function hasDbConfig() {
  return Boolean(
    process.env.MYSQL_URL ||
      process.env.DATABASE_URL ||
      process.env.MYSQL_HOST ||
      process.env.DB_HOST
  );
}

function useSsl() {
  const flag = String(process.env.MYSQL_SSL || process.env.DB_SSL || "")
    .trim()
    .toLowerCase();
  if (flag === "1" || flag === "true" || flag === "yes") return true;
  if (flag === "0" || flag === "false" || flag === "no") return false;

  // Cloud MySQL (PlanetScale, Railway, Aiven, TiDB, etc.) usually needs SSL.
  // Skip for local hosts so local XAMPP/WAMP still works without SSL.
  const host = String(
    process.env.MYSQL_HOST || process.env.DB_HOST || ""
  ).toLowerCase();
  if (!host || host === "localhost" || host === "127.0.0.1") return false;
  return true;
}

function getPool() {
  if (!hasDbConfig()) return null;
  if (pool) return pool;

  // Vercel/serverless: keep pool tiny so we don't exhaust free-tier connections.
  const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
  const connectionLimit = isServerless
    ? 1
    : Number(process.env.MYSQL_CONNECTION_LIMIT || 10);

  const base = {
    waitForConnections: true,
    connectionLimit,
    enableKeepAlive: !isServerless,
    // Fail fast if remote DB is unreachable from Vercel
    connectTimeout: 10000,
  };

  if (useSsl()) {
    base.ssl = { rejectUnauthorized: false };
  }

  const uri = process.env.MYSQL_URL || process.env.DATABASE_URL;
  if (uri) {
    pool = mysql.createPool({
      uri,
      ...base,
    });
    return pool;
  }

  pool = mysql.createPool({
    host: process.env.MYSQL_HOST || process.env.DB_HOST || "localhost",
    port: Number(process.env.MYSQL_PORT || process.env.DB_PORT || 3306),
    user: process.env.MYSQL_USER || process.env.DB_USER || "root",
    password: process.env.MYSQL_PASSWORD || process.env.DB_PASSWORD || "",
    database: process.env.MYSQL_DATABASE || process.env.DB_DATABASE || "db_puno",
    ...base,
  });
  return pool;
}

async function ensureHistoryTable() {
  const db = getPool();
  if (!db) return false;
  if (!initPromise) {
    initPromise = db.query(`
      CREATE TABLE IF NOT EXISTS scan_history (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        plant_json LONGTEXT NOT NULL,
        image_data_url LONGTEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_scan_history_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }
  await initPromise;
  return true;
}

function parsePlantJson(value) {
  try {
    return JSON.parse(value || "{}");
  } catch {
    return {};
  }
}

function mapHistoryRow(row) {
  const plant = parsePlantJson(row.plant_json);
  const savedAt = row.created_at
    ? new Date(row.created_at).toISOString()
    : plant.savedAt || new Date().toISOString();

  return {
    id: Number(row.id),
    imageDataUrl: row.image_data_url,
    savedAt,
    plant: {
      ...plant,
      savedAt,
    },
  };
}

async function listScanHistory(limit = 100) {
  await ensureHistoryTable();
  const db = getPool();
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 200);
  const [rows] = await db.query(
    "SELECT id, plant_json, image_data_url, created_at FROM scan_history ORDER BY created_at DESC, id DESC LIMIT ?",
    [safeLimit]
  );
  return rows.map(mapHistoryRow);
}

async function saveScanHistory({ plant, imageDataUrl }) {
  await ensureHistoryTable();
  const db = getPool();
  const plantJson = JSON.stringify({
    ...plant,
    savedAt: plant?.savedAt || new Date().toISOString(),
  });

  const [result] = await db.query(
    "INSERT INTO scan_history (plant_json, image_data_url) VALUES (?, ?)",
    [plantJson, imageDataUrl]
  );

  return {
    id: Number(result.insertId),
    savedAt: new Date().toISOString(),
  };
}

async function deleteScanHistory(id) {
  await ensureHistoryTable();
  const db = getPool();
  const [result] = await db.query("DELETE FROM scan_history WHERE id = ?", [id]);
  return result.affectedRows > 0;
}

module.exports = {
  hasDbConfig,
  listScanHistory,
  saveScanHistory,
  deleteScanHistory,
};
