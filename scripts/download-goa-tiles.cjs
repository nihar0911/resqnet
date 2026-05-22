/**
 * RESQNET — Goa Offline Tile Downloader
 * Downloads OSM tiles for Goa at zoom levels 8–15
 * Packages them into a local goa.mbtiles SQLite file
 * Run once online: node scripts/download-goa-tiles.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// ─── Goa Bounding Box ────────────────────────────────────────────────────────
const GOA_BBOX = { minLat: 14.89, maxLat: 15.80, minLon: 73.66, maxLon: 74.33 };
const MIN_ZOOM = 8;
const MAX_ZOOM = 15; // zoom 15 = street level detail

// OSM tile servers (rotate to avoid rate limiting)
const TILE_SERVERS = [
  'https://a.tile.openstreetmap.org',
  'https://b.tile.openstreetmap.org',
  'https://c.tile.openstreetmap.org',
];
let serverIdx = 0;

// ─── Tile math ───────────────────────────────────────────────────────────────
function lon2tile(lon, zoom) { return Math.floor((lon + 180) / 360 * Math.pow(2, zoom)); }
function lat2tile(lat, zoom) {
  return Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom));
}

function getTilesForZoom(zoom) {
  const tiles = [];
  const xMin = lon2tile(GOA_BBOX.minLon, zoom);
  const xMax = lon2tile(GOA_BBOX.maxLon, zoom);
  const yMin = lat2tile(GOA_BBOX.maxLat, zoom); // NOTE: lat is inverted
  const yMax = lat2tile(GOA_BBOX.minLat, zoom);
  for (let x = xMin; x <= xMax; x++) {
    for (let y = yMin; y <= yMax; y++) {
      tiles.push({ z: zoom, x, y });
    }
  }
  return tiles;
}

// ─── Download a single tile ──────────────────────────────────────────────────
function downloadTile(z, x, y) {
  return new Promise((resolve) => {
    const server = TILE_SERVERS[serverIdx % TILE_SERVERS.length];
    serverIdx++;
    const url = `${server}/${z}/${x}/${y}.png`;
    https.get(url, {
      headers: { 'User-Agent': 'ResqNet-Offline-Demo/1.0 (Educational hackathon project)' }
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', () => resolve(null));
  });
}

// ─── Create mbtiles SQLite database ──────────────────────────────────────────
async function createMBTiles() {
  let Database;
  try {
    Database = require('better-sqlite3');
  } catch {
    console.error('❌ Run: npm install better-sqlite3');
    process.exit(1);
  }

  const outPath = path.join(__dirname, '../tiles/goa.mbtiles');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const db = new Database(outPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS metadata (name TEXT, value TEXT);
    CREATE TABLE IF NOT EXISTS tiles (
      zoom_level INTEGER, tile_column INTEGER, tile_row INTEGER, tile_data BLOB,
      PRIMARY KEY (zoom_level, tile_column, tile_row)
    );
    INSERT OR REPLACE INTO metadata VALUES ('name', 'Goa Offline Map');
    INSERT OR REPLACE INTO metadata VALUES ('type', 'baselayer');
    INSERT OR REPLACE INTO metadata VALUES ('version', '1.0');
    INSERT OR REPLACE INTO metadata VALUES ('description', 'OpenStreetMap tiles for Goa, India');
    INSERT OR REPLACE INTO metadata VALUES ('format', 'png');
    INSERT OR REPLACE INTO metadata VALUES ('bounds', '73.66,14.89,74.33,15.80');
    INSERT OR REPLACE INTO metadata VALUES ('center', '74.00,15.35,12');
    INSERT OR REPLACE INTO metadata VALUES ('minzoom', '${MIN_ZOOM}');
    INSERT OR REPLACE INTO metadata VALUES ('maxzoom', '${MAX_ZOOM}');
  `);

  const insertTile = db.prepare(
    'INSERT OR REPLACE INTO tiles (zoom_level, tile_column, tile_row, tile_data) VALUES (?, ?, ?, ?)'
  );

  // Count total tiles
  let total = 0;
  for (let z = MIN_ZOOM; z <= MAX_ZOOM; z++) total += getTilesForZoom(z).length;
  console.log(`\n📦 Downloading ${total} tiles for Goa (zoom ${MIN_ZOOM}–${MAX_ZOOM})...`);
  console.log('⏱  Estimated time: ~3–8 minutes depending on connection\n');

  let done = 0;
  const BATCH = 8; // parallel downloads

  for (let z = MIN_ZOOM; z <= MAX_ZOOM; z++) {
    const tiles = getTilesForZoom(z);
    console.log(`🗺  Zoom ${z}: ${tiles.length} tiles`);

    for (let i = 0; i < tiles.length; i += BATCH) {
      const batch = tiles.slice(i, i + BATCH);
      const results = await Promise.all(batch.map(t => downloadTile(t.z, t.x, t.y)));

      const insertMany = db.transaction(() => {
        batch.forEach((t, idx) => {
          if (results[idx]) {
            // MBTiles uses TMS (flipped Y)
            const tmsY = Math.pow(2, t.z) - 1 - t.y;
            insertTile.run(t.z, t.x, tmsY, results[idx]);
          }
        });
      });
      insertMany();

      done += batch.length;
      const pct = Math.round((done / total) * 100);
      process.stdout.write(`\r  Progress: ${pct}% (${done}/${total})   `);

      // Rate limit: wait 100ms every batch
      await new Promise(r => setTimeout(r, 100));
    }
    console.log('');
  }

  db.close();
  const sizeKB = Math.round(fs.statSync(outPath).size / 1024);
  console.log(`\n✅ Done! Goa tiles saved to: ${outPath}`);
  console.log(`📁 File size: ${sizeKB} KB (${Math.round(sizeKB/1024)} MB)`);
  console.log(`\n▶  Now run: npm start  (tileserver starts automatically on port 8082)\n`);
}

createMBTiles().catch(console.error);
