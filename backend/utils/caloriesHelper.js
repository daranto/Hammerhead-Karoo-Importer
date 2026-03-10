import { decrypt } from './encryption.js';

export function getProfile(db) {
  const row = db.prepare('SELECT * FROM user_profile WHERE id = 1').get();
  if (!row) return {};
  return {
    weight_kg: row.weight_kg ? parseFloat(decrypt(row.weight_kg)) : null,
    age:       row.age       ? parseInt(decrypt(row.age), 10)     : null,
    gender:    row.gender    ? decrypt(row.gender)                : null,
  };
}

/**
 * Calculate estimated calories using best available method.
 * Returns kcal or null if not computable.
 *
 * Priority:
 * 1. Power-based (no profile needed): avg_power × duration_s / 1000
 * 2. HR-based Swain et al. (needs weight_kg, age, gender)
 * 3. MET-based (needs weight_kg, avg_speed_ms)
 */
export function calculateCalories(metrics, profile) {
  const { active_time_ms, elapsed_time_ms, avg_power, avg_hr, avg_speed_ms } = metrics;
  const { weight_kg, age, gender } = profile || {};

  const duration_s = (active_time_ms || elapsed_time_ms || 0) / 1000;
  if (duration_s <= 0) return null;

  // Method 1: Power-based
  if (avg_power > 0) {
    return Math.round(avg_power * duration_s / 1000);
  }

  // Method 2: HR-based (Swain et al.)
  if (avg_hr > 0 && weight_kg > 0 && age > 0 && (gender === 'male' || gender === 'female')) {
    const min = duration_s / 60;
    let kcal;
    if (gender === 'male') {
      kcal = ((-55.097 + 0.6309 * avg_hr + 0.1988 * weight_kg + 0.2017 * age) / 4.184) * min;
    } else {
      kcal = ((-20.402 + 0.4472 * avg_hr - 0.1263 * weight_kg + 0.074 * age) / 4.184) * min;
    }
    if (kcal > 0) return Math.round(kcal);
  }

  // Method 3: MET-based
  if (avg_speed_ms > 0 && weight_kg > 0) {
    const kmh = avg_speed_ms * 3.6;
    let met;
    if (kmh <= 15) met = 6;
    else if (kmh <= 20) met = 8;
    else if (kmh <= 25) met = 10;
    else if (kmh <= 30) met = 12;
    else met = 14;
    const hours = duration_s / 3600;
    return Math.round(met * weight_kg * hours);
  }

  return null;
}
