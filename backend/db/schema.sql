-- Tokens per user (single-user design)
CREATE TABLE IF NOT EXISTS tokens (
  user_id TEXT PRIMARY KEY,
  access_token TEXT,
  refresh_token TEXT,
  expires_at INTEGER,
  sram_email TEXT
);

-- Activity summaries (cached)
CREATE TABLE IF NOT EXISTS activities (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  name TEXT,
  created_at TEXT,
  active_time_ms INTEGER,
  elapsed_time_ms INTEGER,
  distance_m REAL,
  elevation_gain_m REAL,
  avg_speed_ms REAL,
  avg_hr REAL,
  avg_power REAL,
  avg_cadence REAL,
  calories REAL,
  avg_temp REAL,
  source TEXT DEFAULT 'api',
  raw_json TEXT,
  cached_at INTEGER DEFAULT (unixepoch())
);

-- GPS + time series (column-array from API → transposed to rows)
CREATE TABLE IF NOT EXISTS activity_records (
  activity_id TEXT,
  sample_index INTEGER,
  timestamp_unix INTEGER,
  lat REAL,
  lng REAL,
  elevation_m REAL,
  distance_m REAL,
  speed_ms REAL,
  heart_rate INTEGER,
  power_w INTEGER,
  cadence INTEGER,
  temperature_c REAL,
  PRIMARY KEY (activity_id, sample_index)
);

-- Pre-computed polylines (for fast map thumbnails)
CREATE TABLE IF NOT EXISTS activity_polylines (
  activity_id TEXT PRIMARY KEY,
  encoded_polyline TEXT,
  bbox_min_lat REAL,
  bbox_max_lat REAL,
  bbox_min_lng REAL,
  bbox_max_lng REAL
);

-- Raw FIT bytes for manually uploaded files
CREATE TABLE IF NOT EXISTS fit_files (
  activity_id TEXT PRIMARY KEY,
  file_data BLOB,
  filename TEXT,
  uploaded_at INTEGER DEFAULT (unixepoch())
);

-- User profile for calorie estimation (fields stored encrypted)
CREATE TABLE IF NOT EXISTS user_profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  weight_kg TEXT,
  age TEXT,
  gender TEXT,
  updated_at INTEGER DEFAULT (unixepoch())
);
