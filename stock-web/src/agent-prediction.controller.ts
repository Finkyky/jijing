import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { AgentPredictionService } from './agent-prediction.service';

@Controller()
export class AgentPredictionController {
  constructor(private readonly agentPredictionService: AgentPredictionService) {}

  @Get('predictions')
  getPredictionsPage(@Res() res: Response) {
    const html = this.generatePredictionsPage();
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  }

  @Get('predictions/:id')
  getPredictionDetailPage(@Param('id') id: string, @Res() res: Response) {
    const html = this.generatePredictionsPage(id);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  }

  @Get('api/agent-prediction/agent')
  getAgentInfo() {
    return this.agentPredictionService.getAgentInfo();
  }

  @Post('api/agent-prediction/run')
  runPrediction() {
    const run = this.agentPredictionService.triggerPrediction('manual');
    return {
      success: true,
      runId: run.id,
      status: run.status,
      createdAt: run.createdAt,
    };
  }

  @Get('api/agent-prediction/latest')
  getLatestPrediction() {
    const latest = this.agentPredictionService.getLatestRun();
    if (!latest) {
      throw new NotFoundException('No prediction run found');
    }
    return latest;
  }

  @Get('api/agent-prediction/history')
  getPredictionHistory(@Query('limit') limit?: string) {
    const parsed = limit ? Number.parseInt(limit, 10) : 20;
    return this.agentPredictionService.listRuns(parsed);
  }

  @Get('api/agent-prediction/:id')
  getPredictionById(@Param('id') id: string) {
    const run = this.agentPredictionService.getRun(id);
    if (!run) {
      throw new NotFoundException('Prediction run not found');
    }
    return run;
  }

  private generatePredictionsPage(initialRunId?: string): string {
    const escapedInitialRunId = JSON.stringify(initialRunId ?? '');
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>股票预测 Agent</title>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Noto+Sans+SC:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #06090f;
      --bg-subtle: #0a0f1a;
      --surface: #0d1321;
      --surface-raised: #111827;
      --surface-overlay: #162033;
      --border: #1e2a3f;
      --border-subtle: #172035;
      --text: #e8edf5;
      --text-secondary: #8899b4;
      --text-muted: #5a6b85;
      --accent: #00d4aa;
      --accent-dim: #00a88540;
      --accent-glow: #00d4aa30;
      --cyan: #22d3ee;
      --amber: #fbbf24;
      --amber-dim: #78350f;
      --rose: #fb7185;
      --rose-dim: #4c1d2f;
      --emerald: #34d399;
      --emerald-dim: #14352a;
      --blue: #60a5fa;
      --blue-dim: #1e3a5f;
      --mono: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
      --sans: 'Noto Sans SC', -apple-system, BlinkMacSystemFont, sans-serif;
      --radius: 10px;
      --radius-lg: 16px;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: var(--sans);
      font-size: 15px;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      position: relative;
      overflow-x: hidden;
    }

    body::before {
      content: '';
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background:
        radial-gradient(ellipse 80% 50% at 20% 0%, #00d4aa08 0%, transparent 50%),
        radial-gradient(ellipse 60% 40% at 80% 100%, #60a5fa06 0%, transparent 50%);
      pointer-events: none;
      z-index: 0;
    }

    /* Scanline effect */
    body::after {
      content: '';
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: repeating-linear-gradient(
        0deg,
        transparent,
        transparent 2px,
        #00000008 2px,
        #00000008 4px
      );
      pointer-events: none;
      z-index: 9999;
    }

    .container {
      width: min(1340px, 95vw);
      margin: 0 auto;
      padding: 20px 0 60px;
      position: relative;
      z-index: 1;
    }

    /* ── Header ── */
    .header {
      background: linear-gradient(135deg, var(--surface) 0%, var(--surface-raised) 100%);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 20px 28px;
      margin-bottom: 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      flex-wrap: wrap;
      position: relative;
      overflow: hidden;
    }

    .header::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 1px;
      background: linear-gradient(90deg, transparent, var(--accent) 30%, var(--accent) 70%, transparent);
      opacity: 0.4;
    }

    .header-left { display: flex; align-items: center; gap: 16px; }

    .logo-mark {
      width: 42px; height: 42px;
      border-radius: 10px;
      background: linear-gradient(135deg, var(--accent) 0%, #00a885 100%);
      display: flex; align-items: center; justify-content: center;
      font-size: 20px;
      box-shadow: 0 0 20px var(--accent-dim), 0 0 40px #00d4aa15;
      flex-shrink: 0;
    }

    .title {
      font-size: 26px;
      font-weight: 700;
      letter-spacing: -0.02em;
      background: linear-gradient(135deg, #fff 0%, #b0c4de 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .subtitle {
      margin-top: 2px;
      color: var(--text-muted);
      font-size: 14px;
      font-family: var(--mono);
      letter-spacing: 0.05em;
    }

    .header-right {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }

    .nav {
      display: flex;
      gap: 4px;
      background: var(--bg-subtle);
      border: 1px solid var(--border-subtle);
      border-radius: 10px;
      padding: 4px;
    }

    .nav a {
      text-decoration: none;
      color: var(--text-secondary);
      background: transparent;
      border: none;
      border-radius: 7px;
      padding: 8px 16px;
      font-size: 14px;
      font-weight: 500;
      transition: all 0.2s ease;
      white-space: nowrap;
    }

    .nav a:hover {
      color: var(--text);
      background: var(--surface);
    }

    .nav a.active {
      background: var(--surface-raised);
      color: var(--accent);
      box-shadow: 0 1px 3px #00000040;
    }

    /* ── Trigger Button ── */
    .trigger-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: linear-gradient(135deg, var(--accent), #00b894);
      color: #06090f;
      border: none;
      border-radius: 8px;
      padding: 9px 20px;
      font-size: 14px;
      font-weight: 600;
      font-family: var(--sans);
      cursor: pointer;
      transition: all 0.25s ease;
      box-shadow: 0 0 15px var(--accent-dim), 0 2px 8px #00000040;
      position: relative;
      overflow: hidden;
    }

    .trigger-btn::before {
      content: '';
      position: absolute;
      top: 0; left: -100%;
      width: 100%; height: 100%;
      background: linear-gradient(90deg, transparent, #ffffff30, transparent);
      transition: left 0.5s ease;
    }

    .trigger-btn:hover::before { left: 100%; }
    .trigger-btn:hover {
      transform: translateY(-1px);
      box-shadow: 0 0 25px var(--accent-dim), 0 4px 12px #00000060;
    }

    .trigger-btn:active { transform: scale(0.97); }
    .trigger-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none !important;
    }

    .trigger-btn svg {
      width: 14px; height: 14px;
      fill: currentColor;
    }

    /* ── Live Indicator ── */
    .live-dot {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      font-family: var(--mono);
      color: var(--text-muted);
      padding: 5px 10px;
      border-radius: 6px;
      background: var(--bg-subtle);
      border: 1px solid var(--border-subtle);
    }

    .live-dot::before {
      content: '';
      width: 6px; height: 6px;
      border-radius: 50%;
      background: var(--accent);
      box-shadow: 0 0 6px var(--accent);
      animation: livePulse 2s ease-in-out infinite;
    }

    @keyframes livePulse {
      0%, 100% { opacity: 1; box-shadow: 0 0 6px var(--accent); }
      50% { opacity: 0.4; box-shadow: 0 0 2px var(--accent); }
    }

    /* ── Cards ── */
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 24px;
      margin-bottom: 20px;
      position: relative;
      animation: cardIn 0.5s ease both;
    }

    .card:nth-child(2) { animation-delay: 0.1s; }

    @keyframes cardIn {
      from { opacity: 0; transform: translateY(12px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 18px;
      gap: 12px;
      flex-wrap: wrap;
    }

    .card-title {
      font-size: 18px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .card-title-icon {
      width: 32px; height: 32px;
      border-radius: 7px;
      display: flex; align-items: center; justify-content: center;
      font-size: 16px;
      flex-shrink: 0;
    }

    .card-title-icon.predict { background: linear-gradient(135deg, #1a3a4a, #0d2030); color: var(--cyan); }
    .card-title-icon.history { background: linear-gradient(135deg, #2a1f3a, #1a1030); color: #a78bfa; }

    /* ── Status Badges ── */
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      border-radius: 6px;
      padding: 5px 12px;
      font-size: 13px;
      font-weight: 600;
      font-family: var(--mono);
      letter-spacing: 0.03em;
      text-transform: uppercase;
    }

    .badge::before {
      content: '';
      width: 5px; height: 5px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .badge.pending, .badge.running {
      color: var(--amber);
      background: var(--amber-dim);
      border: 1px solid #92400e60;
    }
    .badge.pending::before, .badge.running::before {
      background: var(--amber);
      box-shadow: 0 0 6px var(--amber);
      animation: livePulse 1.5s ease-in-out infinite;
    }

    .badge.completed {
      color: var(--emerald);
      background: var(--emerald-dim);
      border: 1px solid #065f4640;
    }
    .badge.completed::before {
      background: var(--emerald);
      box-shadow: 0 0 6px var(--emerald);
    }

    .badge.failed {
      color: var(--rose);
      background: var(--rose-dim);
      border: 1px solid #9f122650;
    }
    .badge.failed::before {
      background: var(--rose);
      box-shadow: 0 0 6px var(--rose);
    }

    /* ── Meta Chips ── */
    .meta-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }

    .chip {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 13px;
      font-family: var(--mono);
      background: var(--bg-subtle);
      border: 1px solid var(--border-subtle);
      color: var(--text-secondary);
    }

    .chip-label {
      color: var(--text-muted);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    .chip-value { color: var(--text); }

    .back-link {
      color: var(--accent);
      text-decoration: none;
      font-size: 13px;
      font-family: var(--mono);
      opacity: 0.8;
      transition: opacity 0.2s;
    }
    .back-link:hover { opacity: 1; text-decoration: underline; }

    /* ── Summary ── */
    .summary-block {
      margin: 16px 0 20px;
      padding: 16px 20px;
      background: linear-gradient(135deg, #0a1628 0%, #0d1a2e 100%);
      border: 1px solid var(--border);
      border-left: 3px solid var(--accent);
      border-radius: 0 var(--radius) var(--radius) 0;
      line-height: 1.75;
      color: var(--text);
      font-size: 15px;
      white-space: pre-wrap;
      position: relative;
    }

    .summary-block::before {
      content: '摘要';
      position: absolute;
      top: -9px;
      left: 16px;
      font-size: 11px;
      font-family: var(--mono);
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--accent);
      background: var(--surface);
      padding: 0 6px;
    }

    /* ── Pick Tabs ── */
    .pick-tabs {
      display: flex;
      gap: 2px;
      margin-bottom: 0;
      background: var(--bg-subtle);
      border: 1px solid var(--border-subtle);
      border-bottom: none;
      border-radius: var(--radius) var(--radius) 0 0;
      padding: 4px 4px 0;
      overflow-x: auto;
    }

    .pick-tab {
      flex: 1;
      min-width: 120px;
      padding: 12px 18px;
      font-size: 15px;
      font-weight: 500;
      color: var(--text-muted);
      background: transparent;
      border: none;
      border-radius: 8px 8px 0 0;
      cursor: pointer;
      transition: all 0.25s ease;
      font-family: var(--sans);
      text-align: center;
      position: relative;
      white-space: nowrap;
    }

    .pick-tab:hover { color: var(--text-secondary); background: var(--surface); }

    .pick-tab.active {
      color: var(--text);
      background: var(--surface);
      font-weight: 600;
    }

    .pick-tab.active::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 20%;
      width: 60%;
      height: 2px;
      background: var(--accent);
      border-radius: 2px 2px 0 0;
      box-shadow: 0 0 8px var(--accent-dim);
    }

    .pick-tab .tab-count {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 20px;
      height: 20px;
      border-radius: 4px;
      background: var(--border);
      font-size: 12px;
      font-family: var(--mono);
      margin-left: 6px;
      padding: 0 4px;
      color: var(--text-secondary);
    }

    .pick-tab.active .tab-count {
      background: var(--accent-dim);
      color: var(--accent);
    }

    .pick-panel {
      display: none;
      background: var(--surface);
      border: 1px solid var(--border-subtle);
      border-top: 1px solid var(--border);
      border-radius: 0 0 var(--radius) var(--radius);
      overflow: hidden;
      animation: panelIn 0.3s ease;
    }

    .pick-panel.active { display: block; }

    @keyframes panelIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    /* ── Tables ── */
    table {
      width: 100%;
      border-collapse: collapse;
    }

    th {
      padding: 12px 14px;
      text-align: left;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-muted);
      background: var(--bg-subtle);
      border-bottom: 1px solid var(--border);
      white-space: nowrap;
      font-family: var(--mono);
    }

    td {
      padding: 12px 14px;
      font-size: 14px;
      color: var(--text-secondary);
      border-bottom: 1px solid var(--border-subtle);
      vertical-align: top;
    }

    tbody tr { transition: background 0.15s ease; }
    tbody tr:hover { background: var(--surface-overlay); }

    td:first-child {
      font-family: var(--mono);
      color: var(--cyan);
      font-weight: 500;
      font-size: 14px;
    }

    .stock-name-cell {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }

    /* ── Context Toggle ── */
    .ctx-toggle {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      border: 1px solid var(--border);
      background: var(--bg-subtle);
      color: var(--text-muted);
      border-radius: 4px;
      padding: 3px 10px;
      font-size: 12px;
      cursor: pointer;
      font-family: var(--mono);
      transition: all 0.2s ease;
      white-space: nowrap;
    }

    .ctx-toggle:hover {
      color: var(--accent);
      border-color: var(--accent-dim);
      background: #00d4aa08;
    }

    .ctx-toggle svg { width: 10px; height: 10px; fill: currentColor; transition: transform 0.2s; }
    .ctx-toggle.open svg { transform: rotate(180deg); }
    .ctx-toggle.open { color: var(--accent); border-color: var(--accent-dim); }

    /* ── Context Panel ── */
    tr.context-row { display: none; }
    tr.context-row td {
      padding: 0 12px 12px !important;
      background: var(--bg-subtle) !important;
      border-bottom: 2px solid var(--border) !important;
    }

    .ctx-panel {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 10px;
      padding: 12px;
      background: var(--surface);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius);
    }

    .ctx-item {
      padding: 10px 12px;
      background: var(--bg-subtle);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      font-size: 13px;
      line-height: 1.6;
      color: var(--text-secondary);
      white-space: pre-wrap;
    }

    .ctx-item-head {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--text-muted);
      margin-bottom: 6px;
      font-family: var(--mono);
    }

    .ctx-icon {
      width: 20px; height: 20px;
      border-radius: 4px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      flex-shrink: 0;
    }

    .ctx-icon.live { background: #0d2a25; color: var(--emerald); }
    .ctx-icon.sentiment { background: #2a1f0d; color: var(--amber); }
    .ctx-icon.policy { background: #1a0d2a; color: #a78bfa; }
    .ctx-icon.earnings { background: #0d1a2a; color: var(--blue); }
    .ctx-icon.macro { background: #2a0d1a; color: var(--rose); }
    .ctx-icon.adjust { background: #0d2a1a; color: var(--cyan); }

    /* ── Notes ── */
    .notes-block {
      margin-top: 16px;
      padding: 14px 18px;
      background: var(--bg-subtle);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius);
      font-size: 14px;
      line-height: 1.7;
      color: var(--text-secondary);
      white-space: pre-wrap;
    }

    .notes-label {
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-muted);
      font-family: var(--mono);
      margin-bottom: 8px;
    }

    /* ── History ── */
    .filter-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
      margin-bottom: 14px;
      padding: 12px 14px;
      background: var(--bg-subtle);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius);
    }

    .filter-input {
      background: var(--surface);
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 8px 12px;
      font-size: 14px;
      font-family: var(--sans);
      min-width: 160px;
      transition: border-color 0.2s;
      outline: none;
    }

    .filter-input:focus { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-glow); }
    .filter-input::placeholder { color: var(--text-muted); }
    .filter-input[type="date"] { min-width: 135px; }

    .filter-btn {
      border: 1px solid var(--border);
      background: var(--surface-raised);
      color: var(--text-secondary);
      border-radius: 6px;
      padding: 8px 16px;
      font-size: 14px;
      cursor: pointer;
      font-family: var(--sans);
      font-weight: 500;
      transition: all 0.2s;
    }

    .filter-btn:hover { background: var(--surface-overlay); color: var(--text); }
    .filter-btn.primary {
      background: var(--accent-dim);
      border-color: var(--accent-dim);
      color: var(--accent);
    }
    .filter-btn.primary:hover { background: #00a88560; }

    .filter-count {
      margin-left: auto;
      font-size: 13px;
      font-family: var(--mono);
      color: var(--text-muted);
    }

    .history-table a {
      color: var(--accent);
      text-decoration: none;
      font-family: var(--mono);
      font-size: 13px;
      transition: opacity 0.2s;
    }
    .history-table a:hover { opacity: 0.7; text-decoration: underline; }

    .history-table tr.highlighted td { background: var(--surface-overlay) !important; }

    .muted { color: var(--text-muted); }
    .error { color: var(--rose); }

    /* ── Loading skeleton ── */
    .skeleton {
      background: linear-gradient(90deg, var(--surface-raised) 25%, var(--surface-overlay) 50%, var(--surface-raised) 75%);
      background-size: 200% 100%;
      animation: shimmer 1.5s infinite;
      border-radius: 6px;
      height: 14px;
      width: 200px;
    }

    @keyframes shimmer {
      0% { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }

    .empty-state {
      text-align: center;
      padding: 40px 20px;
      color: var(--text-muted);
      font-size: 15px;
    }

    .empty-state-icon {
      font-size: 32px;
      margin-bottom: 12px;
      opacity: 0.4;
    }

    /* ── Scrollbar ── */
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }

    /* ── Responsive ── */
    @media (max-width: 900px) {
      .header { padding: 16px; }
      .card { padding: 16px; }
      .header-left { flex-direction: column; align-items: flex-start; }
      .nav a { padding: 6px 10px; font-size: 13px; }
      th, td { padding: 10px; font-size: 13px; }
      .ctx-panel { grid-template-columns: 1fr; }
      .filter-count { margin-left: 0; }
      .filter-bar { padding: 10px; }
      .pick-tab { padding: 10px 12px; font-size: 14px; min-width: 90px; }
    }

    /* ── Overflow table wrapper ── */
    .table-scroll { overflow-x: auto; }
    .table-scroll table { min-width: 900px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="header-left">
        <div class="logo-mark">📈</div>
        <div>
          <h1 class="title">股票预测 Agent</h1>
          <div class="subtitle">PREDICTION ENGINE · 实时数据驱动</div>
        </div>
      </div>
      <div class="header-right">
        <span class="live-dot">LIVE · 15s</span>
        <button class="trigger-btn" id="triggerBtn" onclick="triggerRun()">
          <svg viewBox="0 0 16 16"><polygon points="4,2 14,8 4,14"/></svg>
          手动触发预测
        </button>
        <nav class="nav">
          <a href="/">数据列表</a>
          <a href="/predictions" class="active">股票预测</a>
          <a href="/strategies">投资策略</a>
          <a href="/analyses">AI分析</a>
        </nav>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <div class="card-title">
          <span class="card-title-icon predict">⚡</span>
          预测结果
        </div>
        <div id="latestMeta" class="meta-bar">
          <div class="skeleton" style="width:260px;"></div>
        </div>
      </div>
      <div id="latestSummary" class="summary-block" style="display:none;"></div>
      <div id="latestResult"></div>
    </div>

    <div class="card">
      <div class="card-header">
        <div class="card-title">
          <span class="card-title-icon history">📋</span>
          历史记录
        </div>
      </div>
      <div class="filter-bar">
        <input id="historyRunIdKeyword" class="filter-input" placeholder="搜索 RunId..." />
        <input id="historyDateFrom" class="filter-input" type="date" title="起始日期" />
        <input id="historyDateTo" class="filter-input" type="date" title="结束日期" />
        <button id="historyFilterBtn" class="filter-btn primary">筛选</button>
        <button id="historyResetBtn" class="filter-btn">重置</button>
        <span id="historyCount" class="filter-count"></span>
      </div>
      <div id="historyTable" class="history-table">
        <div class="skeleton" style="width:100%;height:120px;"></div>
      </div>
    </div>
  </div>

  <script>
    const INITIAL_RUN_ID = ${escapedInitialRunId};
    let HISTORY_ALL_ROWS = [];
    let currentPickTab = 'short';
    let currentPickData = { short: [], medium: [], long: [] };

    async function requestJson(url, options) {
      const response = await fetch(url, options || {});
      if (!response.ok) {
        const text = await response.text();
        const error = new Error(text || ('HTTP ' + response.status));
        error.status = response.status;
        throw error;
      }
      return response.json();
    }

    function escapeHtml(value) {
      return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    function formatTime(value) {
      if (!value) return '-';
      try { return new Date(value).toLocaleString('zh-CN'); } catch (e) { return value; }
    }

    function parseDateStartMs(value) {
      if (!value) return null;
      const ms = Date.parse(value + 'T00:00:00');
      return Number.isNaN(ms) ? null : ms;
    }

    function parseDateEndMs(value) {
      if (!value) return null;
      const ms = Date.parse(value + 'T23:59:59.999');
      return Number.isNaN(ms) ? null : ms;
    }

    function updateHistoryCount(current, total) {
      const el = document.getElementById('historyCount');
      if (!el) return;
      el.textContent = current + ' / ' + total;
    }

    async function triggerRun() {
      const btn = document.getElementById('triggerBtn');
      if (!btn) return;
      btn.disabled = true;
      btn.innerHTML = '<svg viewBox="0 0 16 16" style="animation:spin 1s linear infinite"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="2" fill="none" stroke-dasharray="30 10"/></svg> 触发中...';
      try {
        await requestJson('/api/agent-prediction/run', { method: 'POST' });
        setTimeout(reloadAll, 1500);
      } catch (e) {
        alert('触发失败: ' + (e.message || e));
      } finally {
        setTimeout(function() {
          btn.disabled = false;
          btn.innerHTML = '<svg viewBox="0 0 16 16"><polygon points="4,2 14,8 4,14"/></svg> 手动触发预测';
        }, 3000);
      }
    }

    function switchPickTab(tab) {
      currentPickTab = tab;
      document.querySelectorAll('.pick-tab').forEach(function(el) {
        el.classList.toggle('active', el.dataset.tab === tab);
      });
      document.querySelectorAll('.pick-panel').forEach(function(el) {
        el.classList.toggle('active', el.dataset.tab === tab);
      });
    }

    function toggleContext(id, btn) {
      const row = document.getElementById(id);
      if (!row) return;
      const opening = row.style.display === 'none' || row.style.display === '';
      row.style.display = opening ? 'table-row' : 'none';
      if (btn) {
        btn.classList.toggle('open', opening);
        btn.innerHTML = opening
          ? '<svg viewBox="0 0 10 6"><polyline points="1,1 5,5 9,1" fill="none" stroke="currentColor" stroke-width="1.5"/></svg> 收起'
          : '<svg viewBox="0 0 10 6"><polyline points="1,1 5,5 9,1" fill="none" stroke="currentColor" stroke-width="1.5"/></svg> 展开';
      }
    }

    function buildPickTableBody(sectionKey, picks) {
      const rows = Array.isArray(picks) ? picks : [];
      if (!rows.length) {
        return '<tr><td colspan="10"><div class="empty-state"><div class="empty-state-icon">📭</div>暂无数据</div></td></tr>';
      }
      return rows.map(function(pick, idx) {
        const ctxId = 'ctx_' + sectionKey + '_' + idx + '_' + (pick.stockCode || 'x');
        const context = pick.context || {};
        const sentiment = Array.isArray(context.sentimentSignals) && context.sentimentSignals.length
          ? context.sentimentSignals.map(function(x) { return '· ' + escapeHtml(x); }).join('\\n')
          : '暂无';
        const sentimentSummary = context.sentimentSummary ? escapeHtml(context.sentimentSummary) : '舆情中性';
        const policy = Array.isArray(context.policySignals) && context.policySignals.length
          ? context.policySignals.map(function(x) { return '· ' + escapeHtml(x); }).join('\\n')
          : '暂无';
        const earnings = Array.isArray(context.earningsSignals) && context.earningsSignals.length
          ? context.earningsSignals.map(function(x) { return '· ' + escapeHtml(x); }).join('\\n')
          : '暂无';
        const macro = Array.isArray(context.macroSignals) && context.macroSignals.length
          ? context.macroSignals.map(function(x) { return '· ' + escapeHtml(x); }).join('\\n')
          : '暂无';
        const adjustment = context.dynamicAdjustment ? escapeHtml(context.dynamicAdjustment) : '暂无动态调整建议';
        const updatedAt = context.updatedAt ? escapeHtml(formatTime(context.updatedAt)) : '-';
        const live = (context.livePrice || 'N/A') + ' / ' + (context.liveChangePct || 'N/A');

        const ctxHtml =
          '<div class="ctx-panel">'
          + '<div class="ctx-item"><div class="ctx-item-head"><span class="ctx-icon live">📊</span> 实时行情</div>' + escapeHtml(live) + '\\n更新: ' + updatedAt + '</div>'
          + '<div class="ctx-item"><div class="ctx-item-head"><span class="ctx-icon sentiment">💬</span> 舆情信号</div>' + sentimentSummary + '\\n' + sentiment + '</div>'
          + '<div class="ctx-item"><div class="ctx-item-head"><span class="ctx-icon policy">🏛</span> 政策信号</div>' + policy + '</div>'
          + '<div class="ctx-item"><div class="ctx-item-head"><span class="ctx-icon earnings">📑</span> 财报信号</div>' + earnings + '</div>'
          + '<div class="ctx-item"><div class="ctx-item-head"><span class="ctx-icon macro">🌐</span> 宏观信号</div>' + macro + '</div>'
          + '<div class="ctx-item"><div class="ctx-item-head"><span class="ctx-icon adjust">⚙</span> 动态调整</div>' + adjustment + '</div>'
          + '</div>';

        return '<tr>'
          + '<td>' + escapeHtml(pick.stockCode) + '</td>'
          + '<td><div class="stock-name-cell">' + escapeHtml(pick.stockName)
          + ' <button class="ctx-toggle" onclick="toggleContext(\\'' + ctxId + '\\', this)"><svg viewBox="0 0 10 6"><polyline points="1,1 5,5 9,1" fill="none" stroke="currentColor" stroke-width="1.5"/></svg> 展开</button></div></td>'
          + '<td>' + escapeHtml(pick.rationale) + '</td>'
          + '<td>' + escapeHtml(pick.entryWindow) + '</td>'
          + '<td>' + escapeHtml(pick.buyTrigger) + '</td>'
          + '<td style="color:var(--rose);">' + escapeHtml(pick.stopLoss) + '</td>'
          + '<td style="color:var(--emerald);">' + escapeHtml(pick.targetOne) + '</td>'
          + '<td style="color:var(--emerald);">' + escapeHtml(pick.targetTwo) + '</td>'
          + '<td>' + escapeHtml(pick.holdingPeriod) + '</td>'
          + '<td style="color:var(--text-muted);font-size:13px;">' + escapeHtml(pick.avoidCondition) + '</td>'
          + '</tr>'
          + '<tr id="' + ctxId + '" class="context-row" style="display:none;"><td colspan="10">' + ctxHtml + '</td></tr>';
      }).join('');
    }

    function buildPickTabs(result) {
      const shortCount = Array.isArray(result.shortTerm) ? result.shortTerm.length : 0;
      const mediumCount = Array.isArray(result.mediumTerm) ? result.mediumTerm.length : 0;
      const longCount = Array.isArray(result.longTerm) ? result.longTerm.length : 0;

      const theadHtml = '<thead><tr>'
        + '<th>代码</th><th>名称</th><th>逻辑</th><th>入场窗口</th><th>买入触发</th><th>止损</th><th>目标1</th><th>目标2</th><th>持有周期</th><th>不买条件</th>'
        + '</tr></thead>';

      let html = '<div class="pick-tabs">'
        + '<button class="pick-tab active" data-tab="short">短线 · 1-5日 <span class="tab-count">' + shortCount + '</span></button>'
        + '<button class="pick-tab" data-tab="medium">中线 · 2-12周 <span class="tab-count">' + mediumCount + '</span></button>'
        + '<button class="pick-tab" data-tab="long">长线 · 6-24月 <span class="tab-count">' + longCount + '</span></button>'
        + '</div>';

      html += '<div class="pick-panel active" data-tab="short"><div class="table-scroll"><table>' + theadHtml + '<tbody>' + buildPickTableBody('short', result.shortTerm) + '</tbody></table></div></div>';
      html += '<div class="pick-panel" data-tab="medium"><div class="table-scroll"><table>' + theadHtml + '<tbody>' + buildPickTableBody('medium', result.mediumTerm) + '</tbody></table></div></div>';
      html += '<div class="pick-panel" data-tab="long"><div class="table-scroll"><table>' + theadHtml + '<tbody>' + buildPickTableBody('long', result.longTerm) + '</tbody></table></div></div>';

      return html;
    }

    function renderLatest(run) {
      const metaEl = document.getElementById('latestMeta');
      const summaryEl = document.getElementById('latestSummary');
      const resultEl = document.getElementById('latestResult');
      const isHistoryView = Boolean(run && run.id && getTargetRunId() && run.id === getTargetRunId());
      const viewLink = isHistoryView ? ' <a href="/predictions" class="back-link">← 返回最新</a>' : '';

      if (!run) {
        metaEl.innerHTML = '<span class="muted">暂无预测记录</span>' + viewLink;
        summaryEl.style.display = 'none';
        resultEl.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔮</div>尚未生成任何预测，点击「手动触发预测」开始</div>';
        return;
      }

      const statusClass = run.status || 'pending';
      metaEl.innerHTML =
        '<span class="badge ' + statusClass + '">' + escapeHtml(run.status) + '</span>'
        + '<span class="chip"><span class="chip-label">RunId</span> <span class="chip-value">' + escapeHtml(run.id) + '</span></span>'
        + '<span class="chip"><span class="chip-label">触发</span> <span class="chip-value">' + escapeHtml(run.trigger) + '</span></span>'
        + '<span class="chip"><span class="chip-label">全市场</span> <span class="chip-value">' + escapeHtml(run.candidateCount) + '</span></span>'
        + '<span class="chip"><span class="chip-label">入模</span> <span class="chip-value">' + escapeHtml(run.shortlistedCount || run.candidateCount) + '</span></span>'
        + '<span class="chip"><span class="chip-label">时间</span> <span class="chip-value">' + escapeHtml(formatTime(run.createdAt)) + '</span></span>'
        + viewLink;

      if (run.status === 'failed') {
        summaryEl.style.display = 'block';
        summaryEl.textContent = run.error || '执行失败';
        resultEl.innerHTML = '';
        return;
      }

      if (!run.result) {
        summaryEl.style.display = 'block';
        summaryEl.textContent = '任务执行中，请稍候刷新...';
        resultEl.innerHTML = '';
        return;
      }

      summaryEl.style.display = 'block';
      summaryEl.textContent = run.result.summary || '无摘要';

      let html = buildPickTabs(run.result);

      if (Array.isArray(run.result.notes) && run.result.notes.length) {
        html += '<div class="notes-block"><div class="notes-label">补充说明</div>'
          + run.result.notes.map(function(n) { return '· ' + escapeHtml(n); }).join('\\n')
          + '</div>';
      }
      resultEl.innerHTML = html;
      currentPickTab = 'short';
    }

    function renderHistory(rows) {
      const data = Array.isArray(rows) ? rows : [];
      if (!data.length) {
        const emptyText = HISTORY_ALL_ROWS.length ? '筛选后无匹配记录' : '暂无历史记录';
        document.getElementById('historyTable').innerHTML = '<div class="empty-state"><div class="empty-state-icon">📭</div>' + emptyText + '</div>';
        updateHistoryCount(0, HISTORY_ALL_ROWS.length);
        return;
      }

      const targetRunId = getTargetRunId();
      const body = data.map(function(item) {
        const hlClass = targetRunId && item.id === targetRunId ? ' class="highlighted"' : '';
        return '<tr' + hlClass + '>'
          + '<td>' + escapeHtml(item.id) + '</td>'
          + '<td><span class="badge ' + escapeHtml(item.status) + '">' + escapeHtml(item.status) + '</span></td>'
          + '<td>' + escapeHtml(item.trigger) + '</td>'
          + '<td>' + escapeHtml(item.candidateCount) + ' / ' + escapeHtml(item.shortlistedCount || item.candidateCount) + '</td>'
          + '<td>' + escapeHtml(formatTime(item.createdAt)) + '</td>'
          + '<td>' + escapeHtml(formatTime(item.finishedAt)) + '</td>'
          + '<td><a href="/predictions/' + encodeURIComponent(item.id) + '">查看 →</a></td>'
          + '</tr>';
      }).join('');

      document.getElementById('historyTable').innerHTML =
        '<div class="table-scroll"><table><thead><tr>'
        + '<th>RunId</th><th>状态</th><th>触发</th><th>全市场/入模</th><th>创建时间</th><th>完成时间</th><th>操作</th>'
        + '</tr></thead><tbody>' + body + '</tbody></table></div>';
      updateHistoryCount(data.length, HISTORY_ALL_ROWS.length);
    }

    function applyHistoryFilters() {
      const keywordInput = document.getElementById('historyRunIdKeyword');
      const fromInput = document.getElementById('historyDateFrom');
      const toInput = document.getElementById('historyDateTo');
      const keyword = String((keywordInput && keywordInput.value) || '').trim().toLowerCase();
      const fromMs = parseDateStartMs(String((fromInput && fromInput.value) || ''));
      const toMs = parseDateEndMs(String((toInput && toInput.value) || ''));

      const filtered = HISTORY_ALL_ROWS.filter(function(item) {
        const id = String(item.id || '').toLowerCase();
        if (keyword && !id.includes(keyword)) {
          return false;
        }
        if (fromMs === null && toMs === null) {
          return true;
        }
        const createdMs = Date.parse(String(item.createdAt || ''));
        if (Number.isNaN(createdMs)) {
          return false;
        }
        if (fromMs !== null && createdMs < fromMs) {
          return false;
        }
        if (toMs !== null && createdMs > toMs) {
          return false;
        }
        return true;
      });

      renderHistory(filtered);
    }

    function getTargetRunId() {
      const pathnameParts = window.location.pathname.split('/').filter(Boolean);
      if (pathnameParts.length >= 2 && pathnameParts[0] === 'predictions' && pathnameParts[1]) {
        return decodeURIComponent(pathnameParts[1]);
      }
      const qs = new URLSearchParams(window.location.search || '');
      return qs.get('runId') || INITIAL_RUN_ID || '';
    }

    async function loadRunById(runId) {
      if (!runId) {
        await loadLatest();
        return;
      }
      try {
        const run = await requestJson('/api/agent-prediction/' + encodeURIComponent(runId));
        renderLatest(run);
      } catch (error) {
        if (error.status === 404) {
          document.getElementById('latestMeta').innerHTML =
            '<span class="error">未找到该历史预测: ' + escapeHtml(runId) + '</span>'
            + ' <a href="/predictions" class="back-link">← 返回最新</a>';
          document.getElementById('latestSummary').style.display = 'none';
          document.getElementById('latestResult').innerHTML = '';
          return;
        }
        document.getElementById('latestMeta').innerHTML = '<span class="error">加载失败: ' + escapeHtml(error.message) + '</span>';
      }
    }

    async function loadLatest() {
      try {
        const latest = await requestJson('/api/agent-prediction/latest');
        renderLatest(latest);
      } catch (error) {
        if (error.status === 404) {
          renderLatest(null);
          return;
        }
        document.getElementById('latestMeta').innerHTML = '<span class="error">加载失败: ' + escapeHtml(error.message) + '</span>';
      }
    }

    async function loadHistory() {
      try {
        const history = await requestJson('/api/agent-prediction/history?limit=200');
        HISTORY_ALL_ROWS = Array.isArray(history) ? history : [];
        applyHistoryFilters();
      } catch (error) {
        document.getElementById('historyTable').innerHTML = '<div class="error">加载失败: ' + escapeHtml(error.message) + '</div>';
        updateHistoryCount(0, 0);
      }
    }

    async function reloadAll() {
      const targetRunId = getTargetRunId();
      await Promise.all([loadRunById(targetRunId), loadHistory()]);
    }

    document.addEventListener('DOMContentLoaded', function() {
      var filterBtn = document.getElementById('historyFilterBtn');
      var resetBtn = document.getElementById('historyResetBtn');
      var keywordInput = document.getElementById('historyRunIdKeyword');
      var fromInput = document.getElementById('historyDateFrom');
      var toInput = document.getElementById('historyDateTo');

      if (filterBtn) {
        filterBtn.addEventListener('click', function() {
          applyHistoryFilters();
        });
      }
      if (resetBtn) {
        resetBtn.addEventListener('click', function() {
          if (keywordInput) keywordInput.value = '';
          if (fromInput) fromInput.value = '';
          if (toInput) toInput.value = '';
          applyHistoryFilters();
        });
      }
      if (keywordInput) {
        keywordInput.addEventListener('keydown', function(e) {
          if (e.key === 'Enter') {
            applyHistoryFilters();
          }
        });
      }
      if (fromInput) {
        fromInput.addEventListener('change', function() {
          applyHistoryFilters();
        });
      }
      if (toInput) {
        toInput.addEventListener('change', function() {
          applyHistoryFilters();
        });
      }

      document.addEventListener('click', function(e) {
        var tab = e.target.closest('.pick-tab');
        if (tab && tab.dataset.tab) {
          switchPickTab(tab.dataset.tab);
        }
      });

      reloadAll();
      setInterval(reloadAll, 15000);
    });
  </script>
</body>
</html>`;
  }
}
