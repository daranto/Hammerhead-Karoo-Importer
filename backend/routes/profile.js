import { Router } from 'express';
import { requireAuth } from '../auth/middleware.js';
import getDb from '../db/database.js';
import { getProfile, calculateCalories } from '../utils/caloriesHelper.js';
import { encrypt } from '../utils/encryption.js';

const router = Router();

// GET /api/profile
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const profile = getProfile(db);
  res.json(profile);
});

// PUT /api/profile
router.put('/', requireAuth, (req, res) => {
  const db = getDb();
  const { weight_kg, age, gender } = req.body;

  // Validate
  if (weight_kg != null && (isNaN(weight_kg) || weight_kg <= 0 || weight_kg > 500)) {
    return res.status(400).json({ error: 'Invalid weight' });
  }
  if (age != null && (isNaN(age) || age <= 0 || age > 120)) {
    return res.status(400).json({ error: 'Invalid age' });
  }
  if (gender != null && gender !== 'male' && gender !== 'female') {
    return res.status(400).json({ error: 'Invalid gender' });
  }

  db.prepare(`
    INSERT INTO user_profile (id, weight_kg, age, gender, updated_at)
    VALUES (1, ?, ?, ?, unixepoch())
    ON CONFLICT(id) DO UPDATE SET
      weight_kg  = excluded.weight_kg,
      age        = excluded.age,
      gender     = excluded.gender,
      updated_at = unixepoch()
  `).run(
    weight_kg != null ? encrypt(String(weight_kg)) : null,
    age       != null ? encrypt(String(age))       : null,
    gender    != null ? encrypt(gender)            : null,
  );

  // Batch recalculate activities missing calories or with estimated calories
  const profile = getProfile(db);
  const userId = req.session.userId;
  const toUpdate = db.prepare(`
    SELECT id, active_time_ms, elapsed_time_ms, avg_power, avg_hr, avg_speed_ms
    FROM activities
    WHERE user_id = ? AND (calories IS NULL OR calories_estimated = 1)
  `).all(userId);

  let recalculated = 0;
  const update = db.prepare(
    'UPDATE activities SET calories = ?, calories_estimated = 1 WHERE id = ?'
  );
  db.exec('BEGIN');
  try {
    for (const act of toUpdate) {
      const est = calculateCalories(act, profile);
      if (est != null) {
        update.run(est, act.id);
        recalculated++;
      }
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: err.message });
  }

  res.json({ ok: true, recalculated });
});

export default router;
