#!/usr/bin/env node

/**
 * Strava Sync — Pull ALL activities (Run / Ride / Swim / …) and update the data files.
 * Pages read data/activities.js at load time, so no HTML rewriting is needed.
 * Usage: node scripts/strava-sync.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'data', 'strava-config.json');
const TOKENS_PATH = path.join(__dirname, '..', 'data', 'strava-tokens.json');
const JSON_PATH = path.join(__dirname, '..', 'data', 'activities.json');
const JS_PATH = path.join(__dirname, '..', 'data', 'activities.js');

// Pull everything from the start of the first challenge
const SINCE = new Date('2026-01-01');

// Support environment variables for CI (GitHub Actions)
function getConfig() {
  if (process.env.STRAVA_CLIENT_ID && process.env.STRAVA_CLIENT_SECRET) {
    return {
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
    };
  }
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error('Missing strava-config.json. Run strava-auth.js first.');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

function getTokens() {
  if (process.env.STRAVA_REFRESH_TOKEN) {
    return {
      access_token: process.env.STRAVA_ACCESS_TOKEN || '',
      refresh_token: process.env.STRAVA_REFRESH_TOKEN,
      expires_at: 0, // force refresh
    };
  }
  if (!fs.existsSync(TOKENS_PATH)) {
    console.error('Missing strava-tokens.json. Run strava-auth.js first.');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(TOKENS_PATH, 'utf8'));
}

function saveTokens(tokens) {
  if (process.env.STRAVA_REFRESH_TOKEN) {
    if (tokens.refresh_token !== process.env.STRAVA_REFRESH_TOKEN) {
      console.log('::warning::Strava refresh token has changed. Update the STRAVA_REFRESH_TOKEN secret.');
      console.log(`NEW_REFRESH_TOKEN=${tokens.refresh_token}`);
    }
    return;
  }
  fs.writeFileSync(TOKENS_PATH, JSON.stringify(tokens, null, 2));
}

function httpsRequest(options) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) resolve(JSON.parse(data));
        else reject(new Error(`HTTP ${res.statusCode}: ${data}`));
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function refreshToken(config, tokens) {
  const now = Math.floor(Date.now() / 1000);
  if (tokens.expires_at > now + 300) return tokens;

  console.log('Refreshing access token...');
  const postData = JSON.stringify({
    client_id: config.client_id,
    client_secret: config.client_secret,
    refresh_token: tokens.refresh_token,
    grant_type: 'refresh_token',
  });

  const result = await httpsRequest({
    hostname: 'www.strava.com',
    path: '/oauth/token',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) },
    body: postData,
  });

  tokens.access_token = result.access_token;
  tokens.refresh_token = result.refresh_token;
  tokens.expires_at = result.expires_at;
  saveTokens(tokens);
  console.log('Token refreshed.');
  return tokens;
}

async function getAllActivities(accessToken, after) {
  const afterEpoch = Math.floor(after.getTime() / 1000);
  let all = [];
  let page = 1;
  while (true) {
    const batch = await httpsRequest({
      hostname: 'www.strava.com',
      path: `/api/v3/athlete/activities?after=${afterEpoch}&per_page=100&page=${page}`,
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    all = all.concat(batch);
    if (batch.length < 100) break;
    page++;
  }
  return all;
}

function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Pace/speed formatted per sport: runs → min/km, rides → km/h, swims → min/100m
function formatEffort(sport, distanceM, movingS) {
  if (!distanceM || !movingS) return '—';
  if (sport === 'Ride') {
    return ((distanceM / 1000) / (movingS / 3600)).toFixed(1) + ' km/h';
  }
  if (sport === 'Swim') {
    const secPer100 = movingS / (distanceM / 100);
    const min = Math.floor(secPer100 / 60);
    const sec = Math.round(secPer100 % 60);
    return `${min}:${sec.toString().padStart(2, '0')}/100m`;
  }
  const secPerKm = movingS / (distanceM / 1000);
  const min = Math.floor(secPerKm / 60);
  const sec = Math.round(secPerKm % 60);
  return `${min}:${sec.toString().padStart(2, '0')}/km`;
}

// Normalize Strava sport types into the three disciplines (+ Other)
function normalizeSport(a) {
  const t = a.sport_type || a.type;
  if (/Run/.test(t)) return 'Run';
  if (/Ride|Bike|Velo/.test(t)) return 'Ride';
  if (/Swim/.test(t)) return 'Swim';
  return 'Other';
}

async function main() {
  const config = getConfig();
  let tokens = getTokens();
  tokens = await refreshToken(config, tokens);

  console.log('Fetching activities from Strava...');
  const raw = await getAllActivities(tokens.access_token, SINCE);
  console.log(`Found ${raw.length} activities since ${SINCE.toISOString().slice(0, 10)}.`);

  const activities = raw.map(a => {
    const sport = normalizeSport(a);
    return {
      id: a.id,
      date: a.start_date_local.slice(0, 10),
      sport,
      name: a.name || '',
      distance: parseFloat((a.distance / 1000).toFixed(2)), // km
      moving_time: a.moving_time,
      time: formatTime(a.moving_time),
      effort: formatEffort(sport, a.distance, a.moving_time),
      hr: a.average_heartrate ? Math.round(a.average_heartrate) : null,
      elev: a.total_elevation_gain ? Math.round(a.total_elevation_gain) : 0,
    };
  }).sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);

  fs.writeFileSync(JSON_PATH, JSON.stringify({ synced_at: new Date().toISOString(), activities }, null, 2));
  fs.writeFileSync(JS_PATH, '// Auto-generated by scripts/strava-sync.js — do not edit.\nwindow.ACTIVITIES = ' + JSON.stringify(activities, null, 2) + ';\n');
  console.log('Data files written.');

  const bySport = {};
  for (const a of activities) {
    bySport[a.sport] = bySport[a.sport] || { n: 0, km: 0, h: 0 };
    bySport[a.sport].n++;
    bySport[a.sport].km += a.distance;
    bySport[a.sport].h += a.moving_time / 3600;
  }
  console.log('\n--- Summary ---');
  for (const [sport, s] of Object.entries(bySport)) {
    console.log(`${sport}: ${s.n} activities, ${s.km.toFixed(1)}km, ${s.h.toFixed(1)}h`);
  }
  console.log('\nCommit and push data/ to go live.');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
