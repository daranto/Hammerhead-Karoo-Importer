import fitFileParserPkg from 'fit-file-parser';
/* fit-file-parser is a CJS module; the constructor lives on .default */
const FitParser = fitFileParserPkg.default ?? fitFileParserPkg;

const SEMICIRCLE_TO_DEG = 180 / Math.pow(2, 31);
const semicirclesToDeg = (v) => v * SEMICIRCLE_TO_DEG;

/* ------------------------------------------------------------------ */
/* FIT                                                                  */
/* ------------------------------------------------------------------ */
export function parseFitBuffer(buffer) {
  return new Promise((resolve, reject) => {
    const parser = new FitParser({
      force: true,
      speedUnit: 'm/s',
      lengthUnit: 'm',
      temperatureUnit: 'celsius',
      elapsedRecordField: true,
      mode: 'both',
    });

    parser.parse(buffer, (error, data) => {
      if (error) { reject(new Error(`FIT parse error: ${error}`)); return; }
      try { resolve(normalizeFitData(data)); } catch (e) { reject(e); }
    });
  });
}

function normalizeFitData(data) {
  const session = data.activity?.sessions?.[0] ?? data.sessions?.[0] ?? {};

  /* Records: try cascade (laps) first, then flat list */
  let rawRecords = [];
  const laps = data.activity?.sessions?.[0]?.laps ?? data.laps ?? [];
  if (laps.length > 0) {
    for (const lap of laps) {
      if (lap.records?.length) rawRecords.push(...lap.records);
    }
  }
  if (rawRecords.length === 0 && data.records?.length) {
    rawRecords = data.records;
  }

  const records = rawRecords
    .filter((r) => r.position_lat != null && r.position_long != null)
    .map((r, i) => {
      const lat = Math.abs(r.position_lat) > 90
        ? semicirclesToDeg(r.position_lat) : r.position_lat;
      const lng = Math.abs(r.position_long) > 180
        ? semicirclesToDeg(r.position_long) : r.position_long;
      return {
        sample_index: i,
        timestamp_unix: r.timestamp ? Math.floor(new Date(r.timestamp).getTime() / 1000) : null,
        lat, lng,
        elevation_m: r.altitude ?? r.enhanced_altitude ?? null,
        distance_m: r.distance ?? null,
        speed_ms: r.speed ?? r.enhanced_speed ?? null,
        heart_rate: r.heart_rate ?? null,
        power_w: r.power ?? null,
        cadence: r.cadence ?? null,
        temperature_c: r.temperature ?? null,
      };
    });

  const metrics = {
    name: session.sport ? `${capitalize(session.sport)} Activity` : 'FIT Activity',
    created_at: session.start_time
      ? new Date(session.start_time).toISOString()
      : new Date().toISOString(),
    active_time_ms: session.total_timer_time != null
      ? Math.round(session.total_timer_time * 1000) : null,
    elapsed_time_ms: session.total_elapsed_time != null
      ? Math.round(session.total_elapsed_time * 1000) : null,
    distance_m: session.total_distance ?? null,
    elevation_gain_m: session.total_ascent ?? null,
    avg_speed_ms: session.avg_speed ?? session.enhanced_avg_speed ?? null,
    avg_hr: session.avg_heart_rate ?? null,
    avg_power: session.avg_power ?? null,
    avg_cadence: session.avg_cadence ?? null,
    calories: session.total_calories ?? null,
    avg_temp: session.avg_temperature ?? null,
  };

  return { metrics, records };
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/* ------------------------------------------------------------------ */
/* GPX (pure JS, no extra deps)                                        */
/* ------------------------------------------------------------------ */
export function parseGpxBuffer(buffer) {
  const text = buffer.toString('utf-8');

  /* Track name: try <name> inside <trk>, then first <name> anywhere */
  const trkBlock = text.match(/<trk[^>]*>([\s\S]*?)<\/trk>/i)?.[1] ?? text;
  const name = xmlText(trkBlock, 'name') || xmlText(text, 'name') || 'GPX Activity';

  /* Track points */
  const points = [];
  const trkptRe = /<trkpt\s([^>]*)>([\s\S]*?)<\/trkpt>/g;
  let m;
  while ((m = trkptRe.exec(text)) !== null) {
    const attrs = m[1];
    const inner = m[2];
    const lat = parseFloat(attrVal(attrs, 'lat'));
    const lng = parseFloat(attrVal(attrs, 'lon'));
    if (isNaN(lat) || isNaN(lng)) continue;

    const timeStr = xmlText(inner, 'time');
    points.push({
      lat, lng,
      timestamp: timeStr ? new Date(timeStr) : null,
      elevation_m: parseFloatOrNull(xmlText(inner, 'ele')),
      heart_rate: parseIntOrNull(xmlText(inner, 'hr')),   /* gpxtpx:hr */
      cadence: parseIntOrNull(xmlText(inner, 'cad')),
      power_w: parseIntOrNull(xmlText(inner, 'power')),
      speed_ms: parseFloatOrNull(xmlText(inner, 'speed')),
    });
  }

  if (points.length === 0) throw new Error('No track points found in GPX file');

  /* Cumulative distance via Haversine */
  let cumDist = 0;
  const records = points.map((p, i) => {
    if (i > 0) cumDist += haversine(points[i - 1].lat, points[i - 1].lng, p.lat, p.lng);
    return {
      sample_index: i,
      timestamp_unix: p.timestamp ? Math.floor(p.timestamp.getTime() / 1000) : null,
      lat: p.lat,
      lng: p.lng,
      elevation_m: p.elevation_m,
      distance_m: Math.round(cumDist),
      speed_ms: p.speed_ms,
      heart_rate: p.heart_rate,
      power_w: p.power_w,
      cadence: p.cadence,
    };
  });

  /* Summary metrics */
  const firstTime = points.find((p) => p.timestamp)?.timestamp;
  const lastTime = [...points].reverse().find((p) => p.timestamp)?.timestamp;
  const elapsedMs = firstTime && lastTime ? lastTime - firstTime : null;

  let elevGain = 0;
  for (let i = 1; i < points.length; i++) {
    if (points[i].elevation_m != null && points[i - 1].elevation_m != null) {
      const d = points[i].elevation_m - points[i - 1].elevation_m;
      if (d > 0) elevGain += d;
    }
  }

  const avgOf = (arr, key) => {
    const vals = arr.filter((p) => p[key] != null).map((p) => p[key]);
    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
  };

  const metrics = {
    name,
    created_at: firstTime ? firstTime.toISOString() : new Date().toISOString(),
    active_time_ms: elapsedMs,
    elapsed_time_ms: elapsedMs,
    distance_m: Math.round(cumDist),
    elevation_gain_m: elevGain > 0 ? Math.round(elevGain) : null,
    avg_speed_ms: elapsedMs && cumDist ? cumDist / (elapsedMs / 1000) : null,
    avg_hr: avgOf(points, 'heart_rate') != null ? Math.round(avgOf(points, 'heart_rate')) : null,
    avg_power: avgOf(points, 'power_w') != null ? Math.round(avgOf(points, 'power_w')) : null,
    avg_cadence: avgOf(points, 'cadence') != null ? Math.round(avgOf(points, 'cadence')) : null,
    calories: null,
  };

  return { metrics, records };
}

/* --- XML helpers --------------------------------------------------- */
/** Extract text content of a tag (with optional namespace prefix) */
function xmlText(xml, tag) {
  const re = new RegExp(`<(?:[a-zA-Z0-9_]+:)?${tag}[^>]*>([^<]*)<\/(?:[a-zA-Z0-9_]+:)?${tag}>`, 'i');
  const m = xml.match(re);
  return m ? m[1].trim() : null;
}

function attrVal(attrs, name) {
  const m = attrs.match(new RegExp(`${name}="([^"]*)"`));
  return m ? m[1] : null;
}

function parseFloatOrNull(s) { const v = parseFloat(s); return isNaN(v) ? null : v; }
function parseIntOrNull(s) { const v = parseInt(s, 10); return isNaN(v) ? null : v; }

/* --- Haversine distance (meters) ----------------------------------- */
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
