import { Router } from 'express';
import { requireAuth } from '../auth/middleware.js';
import { fetchActivitiesPage, fetchActivityDetails } from '../services/hammerheadApi.js';
import { extractMetrics } from '../utils/metricsHelper.js';
import {
  upsertActivity,
  getActivities,
  getActivity,
  getStats,
  upsertRecords,
  getRecords,
  upsertPolyline,
  getPolyline,
  deleteActivity,
} from '../services/activityCache.js';
import { decodePolyline } from '../utils/polylineEncoder.js';
import { getProfile, calculateCalories } from '../utils/caloriesHelper.js';
import getDb from '../db/database.js';

const router = Router();

// GET /api/activities  – cached list (no auth required)
router.get('/', (req, res) => {
  const { page = 1, perPage = 20, from, to, sortBy, sortDir } = req.query;
  const result = getActivities(null, {
    page: parseInt(page),
    perPage: parseInt(perPage),
    from, to, sortBy, sortDir,
  });
  res.json(result);
});

// GET /api/activities/stats (no auth required)
router.get('/stats', (req, res) => {
  const { from, to, bucket } = req.query;
  const result = getStats(null, { from, to, bucket });
  res.json(result);
});

// POST /api/activities/sync  – fetch from HH API and cache
// ?force=true  → re-upserts all activities regardless of cache state
router.post('/sync', requireAuth, async (req, res) => {
  const userId = req.session.userId;
  const force = req.query.force === 'true';
  let page = 1;
  let synced = 0;
  let updated = 0;
  let unchanged = 0;
  let hasMore = true;

  try {
    const db = getDb();
    const profile = getProfile(db);

    if (force) {
      db.prepare(
        "DELETE FROM activity_records WHERE activity_id IN (SELECT id FROM activities WHERE user_id = ? AND source = 'api')"
      ).run(userId);
    }

    while (hasMore) {
      const data = await fetchActivitiesPage(userId, page, 50);
      const items = data.data || data.activities || data.items || [];

      if (!Array.isArray(items) || items.length === 0) {
        hasMore = false;
        break;
      }

      for (const activity of items) {
        const isNew = !getActivity(activity.id);
        const metrics = extractMetrics(activity);
        if (metrics.calories == null) {
          const est = calculateCalories(metrics, profile);
          if (est != null) {
            metrics.calories = est;
            metrics.calories_estimated = 1;
          }
        }
        upsertActivity({ ...metrics, user_id: userId }, activity);
        if (isNew) synced++;
        else if (force) updated++;
        else unchanged++;
      }

      const total = data.totalItems || data.total || data.totalCount;
      // Normal sync: stop early once all known activities are seen
      if (!force && total && (synced + unchanged) >= total) {
        hasMore = false;
      } else if (items.length < 50) {
        hasMore = false;
      } else {
        page++;
      }
    }

    res.json({ ok: true, synced, updated, unchanged });
  } catch (err) {
    console.error('Sync error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/activities/:id  – details + GPS records (no auth required for cached data)
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  const userId = req.session?.userId;

  // Check cache first
  let activity = getActivity(id);
  let records = getRecords(id);

  if ((!activity || records.length === 0) && userId) {
    try {
      const details = await fetchActivityDetails(userId, id);

      // Transpose column-arrays to row-arrays
      const colData = details.recordData || details.records || {};
      records = transposeColumns(colData, id);

      if (!activity) {
        const metrics = extractMetrics(details);
        upsertActivity({ ...metrics, user_id: userId }, details);
        activity = getActivity(id);
      }

      if (records.length > 0) {
        upsertRecords(id, records);
        const points = records
          .filter((r) => r.lat != null && r.lng != null)
          .map((r) => [r.lat, r.lng]);
        upsertPolyline(id, points);
        records = getRecords(id);
      }
    } catch (err) {
      console.error('Fetch details error:', err.message);
      if (!activity) {
        return res.status(404).json({ error: 'Activity not found' });
      }
    }
  }

  res.json({ activity, records });
});

// GET /api/activities/:id/polyline (no auth required for cached data)
router.get('/:id/polyline', async (req, res) => {
  const { id } = req.params;
  const userId = req.session?.userId;

  let poly = getPolyline(id);

  if (!poly) {
    // Try to build from cached records
    const records = getRecords(id);
    if (records.length > 0) {
      const points = records
        .filter((r) => r.lat != null && r.lng != null)
        .map((r) => [r.lat, r.lng]);
      upsertPolyline(id, points);
      poly = getPolyline(id);
    }

    if (!poly && userId) {
      // Fetch from API (only if authenticated)
      try {
        const details = await fetchActivityDetails(userId, id);
        const colData = details.recordData || details.records || {};
        const rows = transposeColumns(colData, id);
        if (rows.length > 0) {
          upsertRecords(id, rows);
          const points = rows
            .filter((r) => r.lat != null && r.lng != null)
            .map((r) => [r.lat, r.lng]);
          upsertPolyline(id, points);
          poly = getPolyline(id);
        }
      } catch (err) {
        return res.status(404).json({ error: 'No GPS data available' });
      }
    }
  }

  if (!poly) {
    return res.status(404).json({ error: 'No polyline available' });
  }

  res.json(poly);
});

/**
 * Transpose Hammerhead column-arrays to row objects.
 * Input: { lat: [...], lng: [...], ... }
 * Output: [{ lat, lng, ... }, ...]
 */
function transposeColumns(colData, activityId) {
  const lats = colData.lat || colData.latitude || [];
  const lngs = colData.lng || colData.lon || colData.longitude || [];
  const length = Math.max(lats.length, lngs.length);

  if (length === 0) return [];

  const timestamps = colData.timestamp || colData.time || [];
  const elevations = colData.elevation || colData.altitude || [];
  const distances = colData.distance || [];
  const speeds = colData.speed || [];
  const hrs = colData.heartrate || colData.heart_rate || colData.heartRate || [];
  const powers = colData.power || [];
  const cadences = colData.cadence || [];
  const temps = colData.temperature || [];

  const records = [];
  for (let i = 0; i < length; i++) {
    const lat = lats[i];
    const lng = lngs[i];
    if (lat == null || lng == null) continue;

    records.push({
      activity_id: activityId,
      sample_index: i,
      timestamp_unix: timestamps[i] ? Math.floor(new Date(timestamps[i]).getTime() / 1000) : null,
      lat,
      lng,
      elevation_m: elevations[i] ?? null,
      distance_m: distances[i] ?? null,
      speed_ms: speeds[i] ?? null,
      heart_rate: hrs[i] ?? null,
      power_w: powers[i] ?? null,
      cadence: cadences[i] ?? null,
      temperature_c: temps[i] ?? null,
    });
  }

  return records;
}

// DELETE /api/activities/:id (no auth required – single-user app)
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const activity = getActivity(id);
  if (!activity) return res.status(404).json({ error: 'Activity not found' });
  deleteActivity(id);
  res.json({ ok: true });
});

export default router;
