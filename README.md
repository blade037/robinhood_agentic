# INTW Drop Bot

Automatically buys INTW when its price drops 20% or more from the previous day's close, running every 15 minutes (Mon–Fri, 11:00 AM – 9:00 PM UTC) via GitHub Actions.

## Current Rules

| Symbol | Trigger | Quantity | Action | Daily limit |
|--------|---------|----------|--------|---|
| INTW   | Price change ≤ -20% vs prev close | 1 share | Market buy | 1 buy/day |
| WDCX   | Price change ≤ -20% vs prev close | 1 share | Market buy | 1 buy/day |
| SNDU   | Price change ≤ -20% vs prev close | 1 share | Market buy | 1 buy/day |
| CRWL   | Price change ≤ -20% vs prev close | 1 share | Market buy | 1 buy/day |

**Once a symbol is bought, it won't buy again until the next calendar day (UTC)**, even if the -20% condition keeps triggering throughout the day.

## Schedule
- **Frequency:** Every 15 minutes
- **Hours:** 11:00 AM – 9:00 PM UTC
- **Days:** Monday – Friday

## Setup

This bot uses the same GitHub secrets as your other bots. If already set up, just add these files to the same repo.

### Secrets required (already set if using other bots)

| Secret name | Value |
|---|---|
| `ANTHROPIC_API_KEY` | Your Anthropic API key (`sk-ant-...`) |
| `TWELVE_DATA_API_KEY` | Your Twelve Data API key |
| `RH_ACCOUNT_NUMBER` | Your Robinhood agentic account number |

## Manual trigger
Go to **Actions → INTW Drop Bot → Run workflow** to trigger manually anytime.

## Logs
Every run logs the current price, previous close, and % change. If the drop hits -20% or worse, it logs the order result.

## Adding more symbols
Edit the `RULES` array at the top of `drop-bot.js`:
```js
const RULES = [
  { symbol: "INTW", drop_threshold_pct: -20, quantity: "1" },
  { symbol: "XYZ",  drop_threshold_pct: -15, quantity: "2" }, // example
];
```

## Notes
- "-20%" means the bot triggers when the price is down 20% **or more** from the previous day's close
- **Daily limit:** each symbol can only trigger one buy per day. State is tracked in `bought-today.json`, which the workflow auto-commits back to the repo after each run, and resets automatically at midnight UTC
- The workflow needs `contents: write` permission (already included) to commit the state file
- GitHub Actions cron can run up to 15–30 minutes late during high traffic
- GitHub pauses scheduled workflows after 60 days of repo inactivity — make a small commit to reactivate
