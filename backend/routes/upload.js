import { Router } from 'express';
import multer from 'multer';
import { randomUUID } from 'crypto';
import { requireAuth } from '../auth/middleware.js';
import { parseFitBuffer, parseGpxBuffer } from '../services/fitParser.js';
import { upsertActivity, upsertRecords, upsertPolyline } from '../services/activityCache.js';
import getDb from '../db/database.js';
import { getProfile, calculateCalories } from '../utils/caloriesHelper.js';
import { encryptBuf } from '../utils/encryption.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const name = file.originalname.toLowerCase();
    if (name.endsWith('.fit') || name.endsWith('.gpx')) {
      cb(null, true);
    } else {
      cb(new Error('Only .fit and .gpx files are supported'));
    }
  },
});

router.post('/', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const userId = req.session.userId;
  const activityId = `local.activity.${randomUUID()}`;
  const isFit = req.file.originalname.toLowerCase().endsWith('.fit');

  try {
    const { metrics, records } = isFit
      ? await parseFitBuffer(req.file.buffer)
      : parseGpxBuffer(req.file.buffer);

    const db = getDb();
    db.prepare(`
      INSERT OR REPLACE INTO fit_files (activity_id, file_data, filename)
      VALUES (?, ?, ?)
    `).run(activityId, encryptBuf(req.file.buffer), req.file.originalname);

    if (metrics.calories == null) {
      const profile = getProfile(db);
      const est = calculateCalories(metrics, profile);
      if (est != null) {
        metrics.calories = est;
        metrics.calories_estimated = 1;
      }
    }

    upsertActivity(
      { ...metrics, id: activityId, user_id: userId, source: 'upload' },
      { source: isFit ? 'fit_upload' : 'gpx_upload', filename: req.file.originalname }
    );

    if (records.length > 0) {
      upsertRecords(activityId, records);
      const points = records
        .filter((r) => r.lat != null && r.lng != null)
        .map((r) => [r.lat, r.lng]);
      upsertPolyline(activityId, points);
    }

    res.json({ ok: true, activityId, name: metrics.name, recordCount: records.length });
  } catch (err) {
    console.error('Upload error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
