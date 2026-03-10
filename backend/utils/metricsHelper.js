/**
 * Actual activityInfo structure from HH API:
 * [ { key: "TYPE_DISTANCE_ID", value: { format: "double", value: 12345.6 } }, ... ]
 */
export function normalizeActivityInfo(activityInfo) {
  if (!Array.isArray(activityInfo)) return {};
  return activityInfo.reduce((acc, item) => {
    if (item && item.key != null) {
      // Unwrap nested { format, value } object
      acc[item.key] = item.value?.value ?? item.value;
    }
    return acc;
  }, {});
}

export function extractMetrics(activity) {
  const info = normalizeActivityInfo(activity.activityInfo || []);
  const num = (v) => (v != null && v !== '' ? parseFloat(v) : null);

  return {
    id: activity.id,
    name: activity.name || 'Unnamed Ride',
    created_at: activity.createdAt || activity.created_at || null,

    // Top-level fields (confirmed from HAR)
    active_time_ms:   num(activity.activeTime ?? info.TYPE_RIDE_TIME_ID ?? info.active_time_ms),
    elapsed_time_ms:  num(activity.duration?.elapsedTime ?? info.TYPE_ELAPSED_TIME_ID ?? info.elapsed_time_ms),
    distance_m:       num(info.TYPE_DISTANCE_ID ?? activity.distance),
    elevation_gain_m: num(info.TYPE_ELEVATION_GAIN_ID ?? activity.elevationGain),
    avg_speed_ms:     num(info.TYPE_AVERAGE_SPEED_ID ?? activity.avgSpeed),
    avg_hr:           num(info.TYPE_AVERAGE_HR_ID ?? info.TYPE_AVERAGE_HEART_RATE_ID ?? activity.avgHeartRate),
    avg_power:        num(info.TYPE_AVERAGE_POWER_ID ?? activity.avgPower),
    avg_cadence:      num(info.TYPE_AVERAGE_CADENCE_ID ?? activity.avgCadence),
    calories:         num(info.TYPE_CALORIES_ID ?? activity.calories),
    avg_temp:         num(info.TYPE_AVERAGE_TEMPERATURE_ID ?? activity.avgTemperature),
  };
}
