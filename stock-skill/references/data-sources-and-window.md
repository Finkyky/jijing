# Data Sources And Window

Use this file when collecting data for the A-share stock picker.

## Default Window

This skill is built for:

- Previous trading day close
- Through the overnight news window
- Up to the next trading day open

Treat the latest completed session as the primary price anchor.

## Source Priority

For A-shares, collect price and market data in this order:

1. Tonghuashun machine-readable K-line and time-series endpoints
2. Tonghuashun stock, quote, concept, industry, and market pages
3. Official exchange or company disclosures
4. Official policy releases
5. Reputable financial media for context

Primary Tonghuashun entry points:

- `https://d.10jqka.com.cn/v2/line/<market>_<ticker>/01/today.js`
- `https://d.10jqka.com.cn/v2/line/<market>_<ticker>/01/last.js`
- `https://d.10jqka.com.cn/v6/time/hs_<ticker>/defer/last.js`
- `https://stockpage.10jqka.com.cn/<ticker>/`
- `https://basic.10jqka.com.cn/<ticker>/`
- `https://q.10jqka.com.cn/`

Market code mapping:

- `sh_<ticker>` for Shanghai A-shares
- `sz_<ticker>` for Shenzhen A-shares
- `hs_<ticker>` for Tonghuashun time-series endpoints

Field mapping for the preferred machine-readable endpoints:

- In `today.js`: `1` = trading date, `7` = open, `8` = high, `9` = low, `11` = close, `13` = volume, `19` = amount, `1968584` = turnover
- In `last.js`: each row is `date,open,high,low,close,volume,amount,turnover,...`
- In `v6/time/.../defer/last.js`: `pre` = previous close, `date` = trading date, `data` = minute-by-minute sequence, useful for intraday path and late-session behavior

Use `today.js` and `last.js` first whenever you need exact prices. Use page HTML mainly for reports, news, diagnosis text, and concept/industry context.

## Required Data Pull

For every final candidate, proactively retrieve:

- Previous trading session open
- Previous trading session close
- Latest completed-session open
- Latest completed-session close
- The relevant historical window, not just the anchor day
- Short term history: at least recent `5` trading days, and preferably recent `10` trading days for resistance/support context
- Medium term history: at least recent `20` trading days, and preferably recent `60` trading days for base and trend context
- Long term history: at least recent `6` months, and preferably recent `12` months for valuation and trend context
- Recent highs and lows
- Turnover and成交额
- Sector or concept strength
- A relevant policy, news, or company catalyst
- At least one official disclosure when available

Do not use user-supplied prices as a source of truth.

## Freshness Rules

- Short-term exact prices must be anchored to the latest completed session
- Medium-term exact prices must be anchored to the latest completed session plus recent 20-60 day structure
- Long-term entry zones must be anchored to recent 6-12 month valuation and price context
- If `today.js` is available, use it as the price anchor for the latest completed session
- If `last.js` includes a trailing synthetic row with missing open or high/low values, ignore that row and use the last complete daily row instead
- If `today.js` and the visible HTML snippet disagree, trust the machine-readable endpoint first and mention the date explicitly
- Use `v6/time/.../defer/last.js` to confirm whether a short-term setup finished strong or faded into the close
- Do not let the latest completed session override the broader structure if the recent 5-day, 20-day, or 60-day trend says the move is already weakening

If the latest verified price is stale or inconsistent, switch to conditional language instead of fake precision.
