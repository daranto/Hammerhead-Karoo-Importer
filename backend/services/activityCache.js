import getDb from '../db/database.js';
import { decimateAndEncode } from '../utils/polylineEncoder.js';
import { encrypt, decrypt } from '../utils/encryption.js';

export function upsertActivity(metrics, rawJson) {
  const db = getDb();
  db.prepare(`
    INSERT INTO activities
      (id, user_id, name, created_at, active_time_ms, elapsed_time_ms,
       distance_m, elevation_gain_m, avg_speed_ms, avg_hr, avg_power,
       avg_cadence, calories, calories_estimated, avg_temp, source, raw_json, cached_at)
    VALUES
      (@id, @user_id, @name, @created_at, @active_time_ms, @elapsed_time_ms,
       @distance_m, @elevation_gain_m, @avg_speed_ms, @avg_hr, @avg_power,
       @avg_cadence, @calories, @calories_estimated, @avg_temp, @source, @raw_json, unixepoch())
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      active_time_ms = excluded.active_time_ms,
      elapsed_time_ms = excluded.elapsed_time_ms,
      distance_m = excluded.distance_m,
      elevation_gain_m = excluded.elevation_gain_m,
      avg_speed_ms = excluded.avg_speed_ms,
      avg_hr = excluded.avg_hr,
      avg_power = excluded.avg_power,
      avg_cadence = excluded.avg_cadence,
      calories = excluded.calories,
      calories_estimated = excluded.calories_estimated,
      avg_temp = excluded.avg_temp,
      raw_json = excluded.raw_json,
      cached_at = unixepoch()
  `).run({
    ...metrics,
    name: metrics.name ? encrypt(metrics.name) : null,
    calories_estimated: metrics.calories_estimated ?? 0,
    avg_temp: metrics.avg_temp ?? null,
    raw_json: encrypt(JSON.stringify(rawJson)),
    source: metrics.source || 'api',
  });
}

export function getActivities(userId, { page = 1, perPage = 20, from, to, sortBy, sortDir } = {}) {
  const db = getDb();
  const offset = (page - 1) * perPage;

  const ALLOWED = new Set(['created_at', 'name', 'distance_m', 'elevation_gain_m', 'active_time_ms', 'avg_speed_ms', 'calories', 'avg_hr']);
  const col = ALLOWED.has(sortBy) ? sortBy : 'created_at';
  const dir = sortDir === 'asc' ? 'ASC' : 'DESC';

  let where = 'WHERE user_id = ?';
  const args = [userId];
  if (from) { where += ' AND substr(created_at,1,10) >= ?'; args.push(from.slice(0, 10)); }
  if (to)   { where += ' AND substr(created_at,1,10) <= ?'; args.push(to.slice(0, 10)); }

  const rows = db.prepare(`
    SELECT * FROM activities ${where} ORDER BY ${col} ${dir} LIMIT ? OFFSET ?
  `).all(...args, perPage, offset).map((r) => ({
    ...r,
    name: r.name ? decrypt(r.name) : null,
  }));

  const total = db.prepare(`SELECT COUNT(*) as count FROM activities ${where}`).get(...args).count;

  return { activities: rows, total, page, perPage };
}

export function getActivity(activityId) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM activities WHERE id = ?').get(activityId);
  if (!row) return null;
  return {
    ...row,
    name:     row.name     ? decrypt(row.name)     : null,
    raw_json: row.raw_json ? decrypt(row.raw_json) : null,
  };
}

export function upsertRecords(activityId, records) {
  const db = getDb();
  const insert = db.prepare(`
    INSERT OR REPLACE INTO activity_records
      (activity_id, sample_index, timestamp_unix, lat, lng, elevation_m,
       distance_m, speed_ms, heart_rate, power_w, cadence, temperature_c)
    VALUES
      (@activity_id, @sample_index, @timestamp_unix, @lat, @lng, @elevation_m,
       @distance_m, @speed_ms, @heart_rate, @power_w, @cadence, @temperature_c)
  `);

  db.exec('BEGIN');
  try {
    for (const r of records) {
      insert.run({
        activity_id: activityId,
        sample_index: r.sample_index,
        timestamp_unix: r.timestamp_unix ?? null,
        lat: r.lat ?? null,
        lng: r.lng ?? null,
        elevation_m: r.elevation_m ?? null,
        distance_m: r.distance_m ?? null,
        speed_ms: r.speed_ms ?? null,
        heart_rate: r.heart_rate ?? null,
        power_w: r.power_w ?? null,
        cadence: r.cadence ?? null,
        temperature_c: r.temperature_c ?? null,
      });
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function getRecords(activityId) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM activity_records
    WHERE activity_id = ?
    ORDER BY sample_index ASC
  `).all(activityId);
}

export function upsertPolyline(activityId, points) {
  if (!points || points.length === 0) return;
  const db = getDb();
  const result = decimateAndEncode(points);
  if (!result) return;

  db.prepare(`
    INSERT OR REPLACE INTO activity_polylines
      (activity_id, encoded_polyline, bbox_min_lat, bbox_max_lat, bbox_min_lng, bbox_max_lng)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    activityId,
    encrypt(result.encoded_polyline),
    result.bbox_min_lat,
    result.bbox_max_lat,
    result.bbox_min_lng,
    result.bbox_max_lng
  );
}

export function getPolyline(activityId) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM activity_polylines WHERE activity_id = ?').get(activityId);
  if (!row) return null;
  return {
    ...row,
    encoded_polyline: row.encoded_polyline ? decrypt(row.encoded_polyline) : null,
  };
}

export function getStats(userId, { from, to, bucket = 'month' } = {}) {
  const db = getDb();
  let where = 'user_id = ?';
  const args = [userId];
  if (from) { where += ' AND substr(created_at,1,10) >= ?'; args.push(from.slice(0, 10)); }
  if (to)   { where += ' AND substr(created_at,1,10) <= ?'; args.push(to.slice(0, 10)); }

  const totals = db.prepare(`
    SELECT
      COUNT(*) as count,
      COALESCE(SUM(distance_m), 0)       as distance_m,
      COALESCE(SUM(elevation_gain_m), 0) as elevation_m,
      COALESCE(SUM(active_time_ms), 0)   as duration_ms,
      AVG(CASE WHEN avg_speed_ms > 0 THEN avg_speed_ms END) as avg_speed_ms,
      AVG(CASE WHEN avg_hr > 0 THEN avg_hr END) as avg_hr,
      COALESCE(SUM(calories), 0) as calories
    FROM activities WHERE ${where}
  `).get(...args);

  const periodExpr = bucket === 'week'
    ? "strftime('%Y-W%W', created_at)"
    : "strftime('%Y-%m', created_at)";

  const buckets = db.prepare(`
    SELECT
      ${periodExpr} as period,
      COUNT(*) as count,
      COALESCE(SUM(distance_m), 0)       as distance_m,
      COALESCE(SUM(elevation_gain_m), 0) as elevation_m,
      COALESCE(SUM(active_time_ms), 0)   as duration_ms,
      COALESCE(SUM(calories), 0)         as calories
    FROM activities
    WHERE ${where}
    GROUP BY period
    ORDER BY period ASC
  `).all(...args);

  return { totals, buckets };
}

export function deleteActivity(activityId) {
  const db = getDb();
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM activity_records WHERE activity_id = ?').run(activityId);
    db.prepare('DELETE FROM activity_polylines WHERE activity_id = ?').run(activityId);
    db.prepare('DELETE FROM fit_files WHERE activity_id = ?').run(activityId);
    db.prepare('DELETE FROM activities WHERE id = ?').run(activityId);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
