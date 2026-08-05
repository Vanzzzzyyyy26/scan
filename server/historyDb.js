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

function getPool() {
  if (!hasDbConfig()) return null;
  if (pool) return pool;

  const uri = process.env.MYSQL_URL || process.env.DATABASE_URL;
  if (uri) {
    pool = mysql.createPool({
      uri,
      waitForConnections: true,
      connectionLimit: 10,
    });
    return pool;
  }

  pool = mysql.createPool({
    host: process.env.MYSQL_HOST || process.env.DB_HOST || "localhost",
    port: Number(process.env.MYSQL_PORT || process.env.DB_PORT || 3306),
    user: process.env.MYSQL_USER || process.env.DB_USER || "root",
    password: process.env.MYSQL_PASSWORD || process.env.DB_PASSWORD || "",
    database: process.env.MYSQL_DATABASE || process.env.DB_DATABASE || "db_puno",
    waitForConnections: true,
    connectionLimit: 10,
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
