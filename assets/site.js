// Shared helpers for all challenge pages. Expects window.ACTIVITIES from data/activities.js.

const ACT = (window.ACTIVITIES || []);

function inRange(a, start, end) { return a.date >= start && a.date <= end; }

function sumKm(list) { return list.reduce((s, a) => s + a.distance, 0); }
function sumH(list) { return list.reduce((s, a) => s + a.moving_time, 0) / 3600; }

function bySport(list, sport) { return list.filter(a => a.sport === sport); }

function fmtH(hours) {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return h > 0 ? `${h}h ${m.toString().padStart(2, '0')}m` : `${m}m`;
}

function daysUntil(dateStr) {
  const now = new Date();
  const target = new Date(dateStr + 'T08:00:00');
  return Math.max(0, Math.ceil((target - now) / 86400000));
}

function startCountdown(elId, dateStr, label) {
  const el = document.getElementById(elId);
  if (!el) return;
  function tick() {
    const d = daysUntil(dateStr);
    el.innerHTML = d > 0 ? `<strong>${d}</strong> days to ${label}` : `${label} DAY!`;
  }
  tick();
  setInterval(tick, 60000);
}

// Render a multi-sport activity log into #id. filter: fn(activity) => bool
function renderLog(id, filter, newestFirst = true) {
  const container = document.getElementById(id);
  if (!container) return;
  let list = ACT.filter(filter || (() => true));
  if (newestFirst) list = list.slice().reverse();
  if (list.length === 0) {
    container.innerHTML = '<div style="padding:20px;color:#555;text-align:center;">No activities yet. The dashboard updates automatically from Strava.</div>';
    return;
  }
  container.innerHTML = '<div class="run-entry header"><span>Date</span><span>Sport</span><span>Dist</span><span>Time</span><span>Pace</span><span>HR</span><span>Activity</span></div>';
  list.forEach(a => {
    const div = document.createElement('div');
    div.className = 'run-entry';
    div.innerHTML = `
      <span class="date">${a.date.slice(5)}</span>
      <span><span class="sport-badge ${a.sport}">${a.sport === 'Ride' ? 'Bike' : a.sport}</span></span>
      <span class="dist">${a.sport === 'Swim' ? Math.round(a.distance * 1000) + 'm' : a.distance.toFixed(1) + 'km'}</span>
      <span>${a.time}</span>
      <span>${a.effort}</span>
      <span>${a.hr || '—'}</span>
      <span style="color:#aaa">${a.name}</span>
    `;
    container.appendChild(div);
  });
}

// Mobile nav toggle
function setupNav() {
  const btn = document.querySelector('.nav-toggle');
  const links = document.querySelector('.nav-links');
  if (btn && links) btn.addEventListener('click', () => links.classList.toggle('open'));
  document.querySelectorAll('.nav-links a').forEach(a => {
    a.addEventListener('click', () => {
      document.querySelectorAll('.nav-links a').forEach(x => x.classList.remove('active'));
      a.classList.add('active');
      if (links) links.classList.remove('open');
    });
  });
}
document.addEventListener('DOMContentLoaded', setupNav);
