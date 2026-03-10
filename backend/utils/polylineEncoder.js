/**
 * Google Polyline encoding + Ramer-Douglas-Peucker decimation
 */

// RDP algorithm – reduce point count while preserving shape
function perpendicularDistance(point, lineStart, lineEnd) {
  const [lat, lng] = point;
  const [lat1, lng1] = lineStart;
  const [lat2, lng2] = lineEnd;

  const dx = lat2 - lat1;
  const dy = lng2 - lng1;

  if (dx === 0 && dy === 0) {
    return Math.hypot(lat - lat1, lng - lng1);
  }

  const t = ((lat - lat1) * dx + (lng - lng1) * dy) / (dx * dx + dy * dy);
  const nearLat = lat1 + t * dx;
  const nearLng = lng1 + t * dy;
  return Math.hypot(lat - nearLat, lng - nearLng);
}

function rdp(points, epsilon) {
  if (points.length <= 2) return points;

  let maxDist = 0;
  let maxIdx = 0;

  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i], points[0], points[points.length - 1]);
    if (d > maxDist) {
      maxDist = d;
      maxIdx = i;
    }
  }

  if (maxDist > epsilon) {
    const left = rdp(points.slice(0, maxIdx + 1), epsilon);
    const right = rdp(points.slice(maxIdx), epsilon);
    return [...left.slice(0, -1), ...right];
  }

  return [points[0], points[points.length - 1]];
}

// Google Polyline encoding
function encodeNumber(num) {
  let value = Math.round(num * 1e5);
  value = value < 0 ? ~(value << 1) : value << 1;
  let result = '';
  while (value >= 0x20) {
    result += String.fromCharCode((0x20 | (value & 0x1f)) + 63);
    value >>= 5;
  }
  result += String.fromCharCode(value + 63);
  return result;
}

export function encodePolyline(points) {
  let prevLat = 0;
  let prevLng = 0;
  let result = '';

  for (const [lat, lng] of points) {
    result += encodeNumber(lat - prevLat);
    result += encodeNumber(lng - prevLng);
    prevLat = lat;
    prevLng = lng;
  }

  return result;
}

/**
 * Decimate an array of [lat, lng] pairs using RDP and encode as polyline.
 * Also returns the bounding box.
 * Target ~300 points from potentially thousands.
 */
export function decimateAndEncode(points, maxPoints = 300) {
  if (!points || points.length === 0) return null;

  let epsilon = 0.00001;
  let decimated = points;

  // Adaptively increase epsilon until we're under maxPoints
  while (decimated.length > maxPoints && epsilon < 0.1) {
    decimated = rdp(points, epsilon);
    epsilon *= 2;
  }

  const lats = decimated.map(([lat]) => lat);
  const lngs = decimated.map(([, lng]) => lng);

  return {
    encoded_polyline: encodePolyline(decimated),
    bbox_min_lat: Math.min(...lats),
    bbox_max_lat: Math.max(...lats),
    bbox_min_lng: Math.min(...lngs),
    bbox_max_lng: Math.max(...lngs),
  };
}

export function decodePolyline(encoded) {
  const points = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let b, shift = 0, result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push([lat / 1e5, lng / 1e5]);
  }

  return points;
}
