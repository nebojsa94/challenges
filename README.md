# Challenges

Doing hard things on five weeks' notice. Live site: **https://nebojsa94.github.io/challenges/**

| Challenge | Date | Result |
|-----------|------|--------|
| [Belgrade Marathon](https://nebojsa94.github.io/challenges/belgrade-marathon-2026.html) | Apr 19, 2026 | ✅ **4:14:27** (5 weeks prep) |
| [IRONMAN 70.3 Belgrade](https://nebojsa94.github.io/challenges/ironman-70-3-belgrade-2026.html) | Sep 13, 2026 | 🔥 In training (5 weeks, naturally) |

## How it works

- Every page reads `data/activities.js`, which is synced from Strava (all sports: swim/bike/run) every 30 minutes by a GitHub Action.
- Training plans live in [`TRIATHLON_PLAN.md`](TRIATHLON_PLAN.md) (and the original [marathon plan](https://github.com/nebojsa94/belgrade-marathon-2026)).

## Local development

```bash
# one-time Strava OAuth (writes data/strava-config.json + data/strava-tokens.json, both gitignored)
node scripts/strava-auth.js

# pull activities and regenerate data files
node scripts/strava-sync.js

# serve locally
python3 -m http.server 8000
```

## CI secrets

The sync workflow needs three repo secrets: `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `STRAVA_REFRESH_TOKEN`.
