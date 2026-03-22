---
name: a-share-stock-picker
description: A-share stock recommendation and pre-open selection for the window between the previous trading day's close and the next trading day's open. Use when Codex needs to recommend exactly 3 short-term, 3 medium-term, and 3 long-term A-share stocks based on the latest completed session, Tonghuashun quote pages, recent price history, policy/news catalysts, official disclosures, and market context. Trigger on requests such as "推荐股票", "选三只短线票", "给我中线和长线标的", "盘前选股", "按收盘后信息选股", or any request for A-share picks with buy/sell time and price.
---

# A Share Stock Picker

## Overview

Recommend A-shares for three horizons in one pass: short term, medium term, and long term. Use the latest completed trading session plus overnight information up to the answer time, then output exactly 3 names for each horizon with clear buy time, buy price, sell time, sell price targets, and evidence.

Only cover mainland A-shares. Do not recommend Hong Kong stocks, US equities, ETFs, funds, or convertibles unless the user explicitly asks for them.

## Operating Window

Default operating window:

- Start: after the previous trading day officially closes
- End: before the next trading day opens

Use the latest completed session as the main price anchor. Add overnight policy, company, and macro updates that arrive before the answer is produced.

If the user asks during trading hours, say that this skill is optimized for the post-close to pre-open window and adapt cautiously.

## Workflow

### 1. Confirm the scope

Assume the user wants:

- Exactly 3 short-term A-share picks
- Exactly 3 medium-term A-share picks
- Exactly 3 long-term A-share picks

Do not duplicate names across horizons by default. Reuse a name across horizons only if it is unusually strong and you explicitly justify the overlap.

### 2. Pull data proactively

Always fetch market data yourself. Do not rely on the user to provide prices.

For A-shares, start with Tonghuashun machine-readable endpoints first, then use page snippets for context:

- `https://d.10jqka.com.cn/v2/line/<market>_<ticker>/01/today.js`
- `https://d.10jqka.com.cn/v2/line/<market>_<ticker>/01/last.js`
- `https://d.10jqka.com.cn/v6/time/hs_<ticker>/defer/last.js`
- `https://stockpage.10jqka.com.cn/<ticker>/`
- `https://basic.10jqka.com.cn/<ticker>/`
- `https://q.10jqka.com.cn/`

Where:

- `<market>` is `sh` for Shanghai tickers and `sz` for Shenzhen tickers
- `<ticker>` is the 6-digit A-share code

Use the endpoints in this order:

1. `today.js` for the latest completed session's exact open, high, low, close, amount, and turnover
2. `last.js` for recent daily history and the previous trading session's open and close
3. `v6/time/.../defer/last.js` for intraday or same-day minute structure when needed
4. `stockpage.10jqka.com.cn` and `q.10jqka.com.cn` for news, reports, sector strength, and concept context

Use them to retrieve:

- Latest completed-session close
- Latest completed-session open
- Recent highs and lows
- Recent turnover,成交额, and volume behavior
- Sector or concept strength
- Recent relative performance
- Same-day minute path when short-term execution depends on intraday behavior

Minimum history windows:

- Short term: at least 5 trading days
- Medium term: at least 20-60 trading days
- Long term: at least 6-12 months

Never base a recommendation on the latest completed session alone. The latest day is only the anchor day. Every recommendation must be interpreted against the relevant historical window above.

If an exact buy or sell price is provided, it must be anchored to the latest completed session and recent price structure. Do not invent precise levels from stale data.

If Tonghuashun exposes a machine-readable price endpoint, prefer it over scraping visible HTML text from the page.

### 3. Build the evidence pack

For each candidate, collect evidence from three buckets:

1. Price and market structure
2. Policy, news, or company-specific catalysts
3. Official disclosures or company fundamentals

Every final pick should have at least:

- One price/volume reason
- One policy/news/company-event reason
- One structural reason such as industry position, earnings trend, or valuation support

Prefer:

- Tonghuashun quote and market pages for price/history/context
- Exchange and company disclosures for official facts
- Official policy sources and reputable financial media for catalyst context

### 4. Score by horizon

Use the horizon-specific framework in the references:

- Short term: momentum, sentiment, turnover, trigger quality, next-session tradability
- Medium term: earnings momentum, estimate revisions, 20-60 day structure, next-quarter catalysts
- Long term: business quality, balance sheet, valuation band, long-duration thesis

When the user wants exact buy, stop, or target prices, also load:

- `references/price-plan-rules.md`

### 5. Produce exactly 9 picks

Default output:

- 3 short-term picks
- 3 medium-term picks
- 3 long-term picks

If you genuinely cannot support 3 high-quality names for a horizon, say that clearly and explain what evidence is missing. Do not pad with weak names just to fill the quota.

## Output Standard

Use three sections in this order:

1. Short-term picks
2. Medium-term picks
3. Long-term picks

Each section should start with a compact table:

`股票 | 上个交易日开盘价 | 上个交易日收盘价 | 形态类型 | 关键支撑 | 关键阻力 | 核心逻辑 | 买入时间 | 触发买价 | 止损价 | 第一目标 | 第二目标 | 风险收益比 | 卖出时间 | 持有周期 | 不买条件`

Write the section as a Markdown table in this shape:

```markdown
| 股票 | 上个交易日开盘价 | 上个交易日收盘价 | 形态类型 | 关键支撑 | 关键阻力 | 核心逻辑 | 买入时间 | 触发买价 | 止损价 | 第一目标 | 第二目标 | 风险收益比 | 卖出时间 | 持有周期 | 不买条件 |
|---|---:|---:|---|---:|---:|---|---|---:|---:|---:|---:|---|---|---|---|
| 示例股票 `000000` | 10.00 | 10.20 | 突破型 | 9.85 | 10.60 | 一句话说明逻辑 | 2026-03-20 9:35-10:30 | 10.22 | 9.84 | 10.60 | 11.00 | 1:2.1 | 第一目标减仓，第二目标再评估 | 1-3天 | 高开过猛且放量不续强则不买 |
```

Below each table, add short evidence notes for each name:

- Why it was selected
- Which policy/news/disclosure mattered
- Which price/history facts mattered

## Price Rules

- Exact price levels must be based on the latest completed session plus recent history
- Every stock row must include the previous trading session's open and close
- Prefer `today.js` for the current anchor day and `last.js` for the previous session and recent daily structure
- Use `v6/time/.../defer/last.js` only as a supplement for minute-path confirmation, not as the sole source for previous-session OHLC
- Never derive buy, stop, or target levels from same-day OHLC alone; use the relevant 5-day, 20-60 day, or 6-12 month structure first
- Exact prices are allowed only when the anchor price is fresh and clearly verified
- If freshness or verification is insufficient, switch to conditional trigger language
- If a new verified price conflicts with an older working price, discard the old plan immediately

## Buy And Sell Timing Rules

Use horizon-appropriate timing language:

- Short term: next trading day opening session, early pullback, breakout confirmation, or next 1-3 trading days
- Medium term: next 1-5 trading days for entry, next 2-12 weeks for exit or review
- Long term: staged entry over the next 5-20 trading days, thesis review over 6-24 months

When giving exact levels, explain them as structure-based levels derived from Tonghuashun session data, recent highs/lows, and turnover behavior rather than as guarantees.

## Reference Files

Load:

- `references/data-sources-and-window.md` for source priority and operating window
- `references/horizon-selection-framework.md` for short/medium/long scoring
- `references/price-plan-rules.md` for buy, stop, and target derivation
- `references/output-template.md` for the final answer format
