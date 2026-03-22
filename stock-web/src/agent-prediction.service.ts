import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { StockService } from './stock.service';

export type AgentPredictionStatus = 'pending' | 'running' | 'completed' | 'failed';
export type AgentPredictionTrigger = 'manual' | 'schedule' | 'startup';

export interface AgentDefinition {
  id: string;
  displayName: string;
  shortDescription: string;
  defaultPrompt: string;
  skillDir: string;
  skillFile: string;
  referenceFiles: string[];
  agentConfigFile: string;
}

export interface AgentPredictionPick {
  stockCode: string;
  stockName: string;
  rationale: string;
  entryWindow: string;
  buyTrigger: string;
  stopLoss: string;
  targetOne: string;
  targetTwo: string;
  holdingPeriod: string;
  avoidCondition: string;
  context?: AgentStockContext;
}

export interface AgentStockContext {
  livePrice: string;
  liveChangePct: string;
  sentimentSummary: string;
  sentimentSignals: string[];
  policySignals: string[];
  earningsSignals: string[];
  macroSignals: string[];
  dynamicAdjustment: string;
  updatedAt: string;
}

export interface AgentPredictionResult {
  summary: string;
  shortTerm: AgentPredictionPick[];
  mediumTerm: AgentPredictionPick[];
  longTerm: AgentPredictionPick[];
  notes: string[];
  generatedAt: string;
}

export interface AgentPredictionRun {
  id: string;
  trigger: AgentPredictionTrigger;
  status: AgentPredictionStatus;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  shortlistedCount?: number;
  candidateCount: number;
  modelId: string;
  modelBaseURL: string;
  agent: AgentDefinition;
  result?: AgentPredictionResult;
  rawResponse?: string;
  error?: string;
}

interface CandidateSnapshot {
  rank: number;
  universeRank: number;
  score: number;
  stockCode: string;
  stockName: string;
  marketCap: number;
  industry: string;
  fundCount: number;
  holdingRatioTop: number;
  fundCompaniesPreview: string;
}

interface DailyBar {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
}

type HorizonType = 'short' | 'medium' | 'long';

@Injectable()
export class AgentPredictionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AgentPredictionService.name);
  private readonly runs = new Map<string, AgentPredictionRun>();
  private readonly predictionsDir: string;
  private readonly modelBaseURL: string;
  private readonly modelId: string;
  private readonly openai: OpenAI | null;
  private readonly agent: AgentDefinition;
  private readonly runOnStart: boolean;
  private readonly intervalMinutes: number | null;

  private timer: NodeJS.Timeout | null = null;
  private runningRunId: string | null = null;
  private readonly marketDataCache = new Map<string, { bars: DailyBar[]; loadedAt: number }>();
  private readonly marketDataCacheTtlMs = 10 * 60 * 1000;
  private readonly stockContextCache = new Map<string, { value: AgentStockContext; loadedAt: number }>();
  private readonly stockContextCacheTtlMs = 5 * 60 * 1000;
  private macroSignalsCache: { value: string[]; loadedAt: number } | null = null;
  private readonly macroSignalsCacheTtlMs = 15 * 60 * 1000;
  private readonly predictionRetentionDays = 7;
  private readonly sqliteDbPath: string;
  private sqliteDb: {
    exec: (sql: string) => void;
    prepare: (sql: string) => { run: (...args: unknown[]) => void; all: (...args: unknown[]) => unknown[] };
    close: () => void;
  } | null = null;
  private lastRetentionCleanupAtMs = 0;

  constructor(private readonly stockService: StockService) {
    const apiKey = process.env.BUILTIN_MODEL_API_KEY;
    this.modelBaseURL = this.normalizeModelBaseURL(
      process.env.BUILTIN_MODEL_BASE_URL || 'https://api.longcat.chat/openai/v1',
    );
    this.modelId = process.env.BUILTIN_MODEL_ID || 'LongCat-Flash-Chat';

    this.openai = apiKey
      ? new OpenAI({
          apiKey,
          baseURL: this.modelBaseURL,
        })
      : null;

    this.predictionsDir = path.join(process.cwd(), 'data', 'agent-predictions');
    this.ensureDirExists(this.predictionsDir);
    this.sqliteDbPath = path.join(process.cwd(), 'data', 'agent-predictions.sqlite');
    this.initializeSqlite();

    const skillDir = this.resolveSkillDir();
    const skillFile = path.join(skillDir, 'SKILL.md');
    const agentConfigFile = path.join(skillDir, 'agents', 'openai.yaml');
    const referencesDir = path.join(skillDir, 'references');

    this.agent = {
      id: this.parseSimpleYamlValue(this.safeReadText(skillFile), 'name') || 'a-share-stock-picker',
      displayName:
        this.parseSimpleYamlValue(this.safeReadText(agentConfigFile), 'display_name') ||
        'A-Share Stock Picker',
      shortDescription:
        this.parseSimpleYamlValue(this.safeReadText(agentConfigFile), 'short_description') ||
        'A-share stock prediction agent',
      defaultPrompt:
        this.parseSimpleYamlValue(this.safeReadText(agentConfigFile), 'default_prompt') ||
        'Recommend A-share stocks based on the loaded stock skill.',
      skillDir,
      skillFile,
      referenceFiles: this.collectMarkdownFiles(referencesDir),
      agentConfigFile,
    };

    this.intervalMinutes = this.resolveIntervalMinutes();
    this.runOnStart = this.parseBoolean(process.env.AGENT_PREDICTION_RUN_ON_START, false);
    this.loadExistingRuns();
  }

  onModuleInit(): void {
    if (this.intervalMinutes !== null) {
      this.timer = setInterval(() => this.triggerPrediction('schedule'), this.intervalMinutes * 60000);
    }
    if (this.runOnStart) {
      this.triggerPrediction('startup');
    }
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.sqliteDb) {
      try {
        this.sqliteDb.close();
      } catch {
        // ignore close failure
      } finally {
        this.sqliteDb = null;
      }
    }
  }

  getAgentInfo() {
    return {
      ...this.agent,
      modelId: this.modelId,
      modelBaseURL: this.modelBaseURL,
      hasApiKey: Boolean(this.openai),
      scheduler: {
        enabled: this.intervalMinutes !== null,
        intervalMinutes: this.intervalMinutes,
        runOnStart: this.runOnStart,
        runningRunId: this.runningRunId,
      },
    };
  }

  triggerPrediction(trigger: AgentPredictionTrigger = 'manual'): AgentPredictionRun {
    if (this.runningRunId) {
      const running = this.runs.get(this.runningRunId);
      if (running) {
        return running;
      }
      this.runningRunId = null;
    }

    const run: AgentPredictionRun = {
      id: uuidv4(),
      trigger,
      status: 'pending',
      createdAt: new Date().toISOString(),
      candidateCount: 0,
      modelId: this.modelId,
      modelBaseURL: this.modelBaseURL,
      agent: this.agent,
    };
    this.runs.set(run.id, run);
    this.saveRun(run);
    this.runningRunId = run.id;
    void this.executeRun(run.id);
    return run;
  }

  getRun(id: string): AgentPredictionRun | undefined {
    return this.runs.get(id);
  }

  getLatestRun(): AgentPredictionRun | null {
    const [first] = this.listRuns(1);
    return first || null;
  }

  listRuns(limit = 20): AgentPredictionRun[] {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 200)) : 20;
    return Array.from(this.runs.values())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, safeLimit);
  }

  private async executeRun(runId: string): Promise<void> {
    const run = this.runs.get(runId);
    if (!run) {
      return;
    }

    let rawCombined = '';

    try {
      run.status = 'running';
      run.startedAt = new Date().toISOString();
      this.saveRun(run);

      if (!this.openai) {
        throw new Error('BUILTIN_MODEL_API_KEY is missing.');
      }

      const candidatePayload = this.buildCandidatePayload();
      const candidates = candidatePayload.candidates;
      run.candidateCount = candidatePayload.universeCount;
      run.shortlistedCount = candidatePayload.shortlistCount;
      this.saveRun(run);

      const prompt = this.buildPrompt(candidates, candidatePayload.universeCount, candidatePayload.shortlistCount);
      const completion = await this.openai.chat.completions.create({
        model: this.modelId,
        messages: [
          { role: 'system', content: this.getStrictJsonFormatInstruction() },
          { role: 'user', content: prompt },
        ],
        temperature: 0.1,
        max_tokens: 5200,
        response_format: { type: 'json_object' },
      });

      const raw = this.extractText(completion).trim();
      rawCombined = raw;
      let parsed = this.parseResult(raw, run.startedAt);
      let strict = this.isStrictSchema(raw);

      if (!parsed || !strict) {
        const repair = await this.openai.chat.completions.create({
          model: this.modelId,
          messages: [
            { role: 'system', content: this.getStrictJsonFormatInstruction() },
            {
              role: 'user',
              content:
                `Convert the following model output to the exact JSON schema. Return JSON only:\n\n${raw}` +
                `\n\nSchema reminder:\n${this.getStrictJsonTemplate()}`,
            },
          ],
          temperature: 0,
          max_tokens: 5200,
          response_format: { type: 'json_object' },
        });
        const repairedRaw = this.extractText(repair).trim();
        parsed = this.parseResult(repairedRaw, run.startedAt);
        strict = this.isStrictSchema(repairedRaw);
        rawCombined = `${raw || '[empty-first-response]'}\n\n[json-retry]\n${repairedRaw || '[empty-retry-response]'}`;
      }

      if (!parsed) {
        run.rawResponse = rawCombined || '[no-model-text-extracted]';
        throw new Error('Model did not return valid JSON result.');
      }
      if (!strict) {
        run.rawResponse = rawCombined || '[no-model-text-extracted]';
        throw new Error('Model did not return strict schema JSON result.');
      }

      const enriched = await this.enrichResultWithPricePlan(parsed);

      run.rawResponse = rawCombined;
      run.result = enriched;
      run.status = 'completed';
      run.finishedAt = new Date().toISOString();
      this.saveRun(run);
    } catch (error) {
      run.status = 'failed';
      run.finishedAt = new Date().toISOString();
      run.error = error instanceof Error ? error.message : 'Prediction failed';
      if (!run.rawResponse && rawCombined) {
        run.rawResponse = rawCombined;
      }
      this.saveRun(run);
    } finally {
      if (this.runningRunId === runId) {
        this.runningRunId = null;
      }
    }
  }

  private buildPrompt(candidates: CandidateSnapshot[], universeCount: number, shortlistCount: number): string {
    const payload = JSON.stringify(candidates);
    return [
      `Agent: ${this.agent.displayName} (${this.agent.id})`,
      `Current time: ${new Date().toISOString()}`,
      `Universe size: ${universeCount} A-share stocks.`,
      `Model shortlist size: ${shortlistCount}. This shortlist is ranked from the full universe.`,
      'Output language: Chinese.',
      'Return strict JSON with keys: summary, shortTerm, mediumTerm, longTerm, notes, generatedAt.',
      'shortTerm/mediumTerm/longTerm must each be arrays. notes must be an array.',
      'Each pick requires: stockCode, stockName, rationale, entryWindow, buyTrigger, stopLoss, targetOne, targetTwo, holdingPeriod, avoidCondition.',
      'Prioritize higher score candidates while keeping industry diversification across horizons.',
      `JSON template:\n${this.getStrictJsonTemplate()}`,
      `Candidates JSON:\n${payload}`,
    ].join('\n\n');
  }

  private buildCandidatePayload(): {
    candidates: CandidateSnapshot[];
    universeCount: number;
    shortlistCount: number;
  } {
    const all = this.stockService.getStrategiesData();
    const normalized = all
      .map((row: unknown, index: number) => this.normalizeCandidateRow(row, index))
      .filter((row): row is CandidateSnapshot => Boolean(row));

    if (normalized.length === 0) {
      return { candidates: [], universeCount: 0, shortlistCount: 0 };
    }

    const maxFund = Math.max(...normalized.map((row: CandidateSnapshot) => row.fundCount), 1);
    const maxCap = Math.max(...normalized.map((row: CandidateSnapshot) => row.marketCap), 1);
    const minCap = Math.min(...normalized.map((row: CandidateSnapshot) => row.marketCap), maxCap);
    const capLogSpan = Math.max(0.0001, Math.log10(maxCap + 1) - Math.log10(minCap + 1));
    const recentCounter = this.buildRecentRecommendationCounter(this.resolveRepeatLookbackDays());
    const repeatPenalty = this.resolveRepeatPenalty();

    normalized.forEach((row: CandidateSnapshot) => {
      const fundScore = Math.log1p(Math.max(0, row.fundCount)) / Math.log1p(maxFund);
      const capScore = (Math.log10(Math.max(0, row.marketCap) + 1) - Math.log10(minCap + 1)) / capLogSpan;
      const holdScore = Math.min(1, Math.max(0, row.holdingRatioTop / 10));
      const baseScore = fundScore * 0.55 + capScore * 0.25 + holdScore * 0.2;
      const repeatedTimes = recentCounter.get(row.stockCode) || 0;
      const diversityFactor = 1 / (1 + repeatedTimes * repeatPenalty);
      row.score = Number((baseScore * diversityFactor).toFixed(4));
    });

    const ranked = normalized.sort((a: CandidateSnapshot, b: CandidateSnapshot) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.fundCount !== a.fundCount) return b.fundCount - a.fundCount;
      if (b.marketCap !== a.marketCap) return b.marketCap - a.marketCap;
      return a.stockCode.localeCompare(b.stockCode);
    });

    ranked.forEach((row: CandidateSnapshot, idx: number) => {
      row.universeRank = idx + 1;
    });

    const shortlistSize = this.resolveShortlistSize(ranked.length);
    const perIndustryLimit = this.resolvePerIndustryLimit(shortlistSize);
    const picked: CandidateSnapshot[] = [];
    const industryCounter = new Map<string, number>();

    for (const row of ranked) {
      if (picked.length >= shortlistSize) {
        break;
      }
      const key = row.industry || 'Unknown';
      const current = industryCounter.get(key) || 0;
      if (current >= perIndustryLimit) {
        continue;
      }
      industryCounter.set(key, current + 1);
      picked.push(row);
    }

    if (picked.length < shortlistSize) {
      const pickedSet = new Set<string>(picked.map((row: CandidateSnapshot) => row.stockCode));
      for (const row of ranked) {
        if (picked.length >= shortlistSize) {
          break;
        }
        if (pickedSet.has(row.stockCode)) {
          continue;
        }
        picked.push(row);
      }
    }

    const candidates = picked.map((row: CandidateSnapshot, index: number): CandidateSnapshot => ({
      ...row,
      rank: index + 1,
      fundCompaniesPreview: row.fundCompaniesPreview.slice(0, 60),
    }));

    return {
      candidates,
      universeCount: ranked.length,
      shortlistCount: candidates.length,
    };
  }

  private parseResult(raw: string, generatedAtFallback: string | undefined): AgentPredictionResult | null {
    const root = this.parseJsonObject(raw);
    if (!root) {
      return null;
    }
    const json = this.unwrapPredictionPayload(root);
    const generatedAt = generatedAtFallback || new Date().toISOString();
    const shortTerm = this.pickValue(json, ['shortTerm', 'short_term', 'shortterm', 'short', '短线', '短期']);
    const mediumTerm = this.pickValue(json, ['mediumTerm', 'midTerm', 'medium_term', 'medium', '中线', '中期']);
    const longTerm = this.pickValue(json, ['longTerm', 'long_term', 'long', '长线', '长期']);
    const notes = this.pickValue(json, ['notes', 'note', 'tips', '说明', '备注', '风险提示']);
    return {
      summary: this.readString(json, ['summary', '摘要', '总结', '结论'], 'No summary'),
      shortTerm: this.normalizePicks(shortTerm),
      mediumTerm: this.normalizePicks(mediumTerm),
      longTerm: this.normalizePicks(longTerm),
      notes: this.normalizeNotes(notes),
      generatedAt: this.readString(json, ['generatedAt', 'createdAt', '生成时间', '更新时间'], generatedAt),
    };
  }

  private parseJsonObject(raw: string): Record<string, unknown> | null {
    const content = (raw || '').trim();
    if (!content) {
      return null;
    }
    const candidates: string[] = [content];
    const blockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (blockMatch && blockMatch[1]) {
      candidates.push(blockMatch[1].trim());
    }

    this.extractBalancedJsonBlocks(content).forEach((chunk: string) => candidates.push(chunk));

    const seen = new Set<string>();
    for (const candidate of candidates) {
      if (!candidate || seen.has(candidate)) {
        continue;
      }
      seen.add(candidate);

      const sanitized = candidate.replace(/,\s*([}\]])/g, '$1').trim();
      try {
        const parsed = JSON.parse(sanitized) as unknown;
        if (typeof parsed === 'string') {
          const parsedString = JSON.parse(parsed) as unknown;
          if (parsedString && typeof parsedString === 'object' && !Array.isArray(parsedString)) {
            return parsedString as Record<string, unknown>;
          }
        }
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch {
        // noop
      }
    }
    return null;
  }

  private normalizePicks(value: unknown): AgentPredictionPick[] {
    const list = Array.isArray(value)
      ? value
      : value && typeof value === 'object'
        ? [value]
        : [];
    return list.slice(0, 3).map((item: unknown): AgentPredictionPick => {
      const record = this.toSimpleRecord(item);
      const fallbackStock = this.readString(record, ['stock', '股票', 'symbol', '标的'], '');
      const fromCombinedStock = this.splitStockField(fallbackStock);
      return {
        stockCode:
          this.readString(record, ['stockCode', 'code', 'ticker', 'symbol', '股票代码', '代码'], fromCombinedStock.code) ||
          'N/A',
        stockName:
          this.readString(record, ['stockName', 'name', '股票名称', '名称'], fromCombinedStock.name) || 'N/A',
        rationale: this.readString(record, ['rationale', 'reason', 'logic', '核心逻辑', '逻辑', '理由'], 'N/A'),
        entryWindow: this.readString(record, ['entryWindow', 'buyWindow', 'entryTime', '买入时间', '入场时间'], 'N/A'),
        buyTrigger: this.readString(record, ['buyTrigger', 'buyPrice', 'trigger', '触发买价', '买入触发'], 'N/A'),
        stopLoss: this.readString(record, ['stopLoss', 'riskLine', '止损', '止损价'], 'N/A'),
        targetOne: this.readString(record, ['targetOne', 'target1', 'firstTarget', '第一目标', '目标一'], 'N/A'),
        targetTwo: this.readString(record, ['targetTwo', 'target2', 'secondTarget', '第二目标', '目标二'], 'N/A'),
        holdingPeriod: this.readString(record, ['holdingPeriod', 'horizon', '持有周期', '持有期限'], 'N/A'),
        avoidCondition: this.readString(record, ['avoidCondition', 'skipCondition', '不买条件', '回避条件'], 'N/A'),
      };
    });
  }

  private normalizeNotes(value: unknown): string[] {
    if (typeof value === 'string') {
      const text = value.trim();
      return text ? [text] : [];
    }
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .map((item: unknown) => (typeof item === 'string' ? item.trim() : ''))
      .filter((item: string) => item.length > 0)
      .slice(0, 20);
  }

  private extractText(completion: unknown): string {
    const c = completion as {
      output_text?: string;
      choices?: Array<{ text?: string; message?: { content?: unknown } }>;
    };
    if (typeof c.output_text === 'string' && c.output_text.trim()) {
      return c.output_text;
    }
    const choice = c.choices?.[0];
    const messageContent = choice?.message?.content;
    if (typeof messageContent === 'string') {
      return messageContent;
    }
    if (Array.isArray(messageContent)) {
      const parts = messageContent
        .map((part: unknown) => {
          if (typeof part === 'string') {
            return part;
          }
          if (!part || typeof part !== 'object') {
            return '';
          }
          const record = part as Record<string, unknown>;
          if (typeof record.text === 'string') {
            return record.text;
          }
          if (typeof record.content === 'string') {
            return record.content;
          }
          return '';
        })
        .filter((part: string) => part.length > 0);
      if (parts.length > 0) {
        return parts.join('\n');
      }
    }
    if (choice?.text) {
      return choice.text;
    }
    return '';
  }

  private pickValue(source: Record<string, unknown>, keys: string[]): unknown {
    for (const key of keys) {
      if (key in source) {
        return source[key];
      }
    }
    return undefined;
  }

  private unwrapPredictionPayload(source: Record<string, unknown>): Record<string, unknown> {
    const firstLayer = this.pickValue(source, ['result', 'prediction', 'data', 'output']);
    if (firstLayer && typeof firstLayer === 'object' && !Array.isArray(firstLayer)) {
      return firstLayer as Record<string, unknown>;
    }

    const textLayer = this.pickValue(source, ['result', 'content', 'text', 'output']);
    if (typeof textLayer === 'string') {
      const parsedTextLayer = this.parseJsonObject(textLayer);
      if (parsedTextLayer) {
        return parsedTextLayer;
      }
    }

    return source;
  }

  private extractBalancedJsonBlocks(content: string): string[] {
    const blocks: string[] = [];
    let depth = 0;
    let start = -1;
    let inString = false;
    let quote = '"';
    let escaped = false;

    for (let i = 0; i < content.length; i += 1) {
      const ch = content[i];

      if (inString) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === '\\') {
          escaped = true;
          continue;
        }
        if (ch === quote) {
          inString = false;
        }
        continue;
      }

      if (ch === '"' || ch === "'") {
        inString = true;
        quote = ch;
        continue;
      }

      if (ch === '{') {
        if (depth === 0) {
          start = i;
        }
        depth += 1;
        continue;
      }

      if (ch === '}' && depth > 0) {
        depth -= 1;
        if (depth === 0 && start >= 0) {
          blocks.push(content.slice(start, i + 1));
          start = -1;
          if (blocks.length >= 32) {
            break;
          }
        }
      }
    }

    return blocks;
  }

  private splitStockField(value: string): { code: string; name: string } {
    if (!value) {
      return { code: '', name: '' };
    }
    const codeMatch = value.match(/\b\d{6}\b/);
    const code = codeMatch ? codeMatch[0] : '';
    const name = value
      .replace(/\b\d{6}\b/g, '')
      .replace(/[`'":：\-|]/g, ' ')
      .trim();
    return { code, name };
  }

  private normalizeCandidateRow(row: unknown, index: number): CandidateSnapshot | null {
    const source = this.toSimpleRecord(row);
    const code = this.readString(source, ['股票代码', 'stockCode', 'code', 'ticker'], '').trim();
    if (!/^\d{6}$/.test(code)) {
      return null;
    }
    const stockName = this.readString(source, ['股票名称', 'stockName', 'name'], '').trim() || code;
    const marketCap = this.readNumber(source, ['总市值亿', 'marketCap', 'cap', 'market_cap'], 0);
    const industry = this.readString(source, ['所属行业', 'industry', 'sector'], 'Unknown').trim() || 'Unknown';
    const fundCount = Math.round(this.readNumber(source, ['持仓基金数量', 'fundCount', 'fund_count'], 0));
    const companies = this.readString(
      source,
      ['持仓基金公司', 'fundCompanies', 'fund_companies', 'fundCompaniesPreview'],
      '',
    );
    const ratioText = this.readString(source, ['持仓比例合计', 'holdingRatio', 'holding_ratio'], '');
    const holdingRatioTop = this.parsePercentTop(ratioText);
    return {
      rank: index + 1,
      universeRank: index + 1,
      score: 0,
      stockCode: code,
      stockName,
      marketCap,
      industry,
      fundCount: Number.isFinite(fundCount) ? fundCount : 0,
      holdingRatioTop,
      fundCompaniesPreview: companies,
    };
  }

  private parsePercentTop(text: string): number {
    if (!text) {
      return 0;
    }
    const matches = text.match(/\d+(?:\.\d+)?/g);
    if (!matches || matches.length === 0) {
      return 0;
    }
    const values = matches
      .map((item: string) => Number(item))
      .filter((item: number) => Number.isFinite(item) && item >= 0);
    if (values.length === 0) {
      return 0;
    }
    return Math.max(...values);
  }

  private resolveShortlistSize(universeCount: number): number {
    const raw = process.env.AGENT_PREDICTION_SHORTLIST_SIZE;
    const parsed = raw ? Number.parseInt(raw, 10) : 180;
    const safe = Number.isFinite(parsed) ? parsed : 180;
    return Math.max(30, Math.min(universeCount, Math.min(400, safe)));
  }

  private resolvePerIndustryLimit(shortlistSize: number): number {
    const raw = process.env.AGENT_PREDICTION_MAX_PER_INDUSTRY;
    const parsed = raw ? Number.parseInt(raw, 10) : Math.max(4, Math.floor(shortlistSize / 15));
    const safe = Number.isFinite(parsed) ? parsed : Math.max(4, Math.floor(shortlistSize / 15));
    return Math.max(2, Math.min(30, safe));
  }

  private resolveRepeatLookbackDays(): number {
    const raw = process.env.AGENT_PREDICTION_REPEAT_LOOKBACK_DAYS;
    const parsed = raw ? Number.parseInt(raw, 10) : 7;
    const safe = Number.isFinite(parsed) ? parsed : 7;
    return Math.max(1, Math.min(30, safe));
  }

  private resolveRepeatPenalty(): number {
    const raw = process.env.AGENT_PREDICTION_REPEAT_PENALTY;
    const parsed = raw ? Number.parseFloat(raw) : 0.45;
    const safe = Number.isFinite(parsed) ? parsed : 0.45;
    return Math.max(0.05, Math.min(2, safe));
  }

  private buildRecentRecommendationCounter(lookbackDays: number): Map<string, number> {
    const result = new Map<string, number>();
    const cutoff = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;
    for (const run of this.runs.values()) {
      if (run.status !== 'completed' || !run.result) {
        continue;
      }
      const timeStr = run.finishedAt || run.createdAt;
      const time = new Date(timeStr).getTime();
      if (!Number.isFinite(time) || time < cutoff) {
        continue;
      }
      const allPicks = [...(run.result.shortTerm || []), ...(run.result.mediumTerm || []), ...(run.result.longTerm || [])];
      for (const pick of allPicks) {
        const code = (pick.stockCode || '').trim();
        if (!/^\d{6}$/.test(code)) {
          continue;
        }
        result.set(code, (result.get(code) || 0) + 1);
      }
    }
    return result;
  }

  private getStrictJsonFormatInstruction(): string {
    return [
      'Return strict JSON only. No markdown. No explanation text.',
      'Use exactly these top-level keys: summary, shortTerm, mediumTerm, longTerm, notes, generatedAt.',
      'shortTerm/mediumTerm/longTerm must be arrays of pick objects.',
      'Each pick object must contain: stockCode, stockName, rationale, entryWindow, buyTrigger, stopLoss, targetOne, targetTwo, holdingPeriod, avoidCondition.',
      'notes must be an array of strings.',
      'generatedAt must be ISO-8601 string.',
      `Template:\n${this.getStrictJsonTemplate()}`,
    ].join('\n');
  }

  private getStrictJsonTemplate(): string {
    return JSON.stringify(
      {
        summary: 'string',
        shortTerm: [
          {
            stockCode: 'string',
            stockName: 'string',
            rationale: 'string',
            entryWindow: 'string',
            buyTrigger: 'string',
            stopLoss: 'string',
            targetOne: 'string',
            targetTwo: 'string',
            holdingPeriod: 'string',
            avoidCondition: 'string',
          },
        ],
        mediumTerm: [
          {
            stockCode: 'string',
            stockName: 'string',
            rationale: 'string',
            entryWindow: 'string',
            buyTrigger: 'string',
            stopLoss: 'string',
            targetOne: 'string',
            targetTwo: 'string',
            holdingPeriod: 'string',
            avoidCondition: 'string',
          },
        ],
        longTerm: [
          {
            stockCode: 'string',
            stockName: 'string',
            rationale: 'string',
            entryWindow: 'string',
            buyTrigger: 'string',
            stopLoss: 'string',
            targetOne: 'string',
            targetTwo: 'string',
            holdingPeriod: 'string',
            avoidCondition: 'string',
          },
        ],
        notes: ['string'],
        generatedAt: '2026-03-21T10:00:00.000Z',
      },
      null,
      2,
    );
  }

  private isStrictSchema(raw: string): boolean {
    const root = this.parseJsonObject(raw);
    if (!root) {
      return false;
    }
    const payload = this.unwrapPredictionPayload(root);
    if (typeof payload.summary !== 'string' || !payload.summary.trim()) {
      return false;
    }
    if (typeof payload.generatedAt !== 'string' || !payload.generatedAt.trim()) {
      return false;
    }
    if (!this.isStrictPickArray(payload.shortTerm)) {
      return false;
    }
    if (!this.isStrictPickArray(payload.mediumTerm)) {
      return false;
    }
    if (!this.isStrictPickArray(payload.longTerm)) {
      return false;
    }
    if (!Array.isArray(payload.notes)) {
      return false;
    }
    return payload.notes.every((item: unknown) => typeof item === 'string');
  }

  private isStrictPickArray(value: unknown): boolean {
    if (!Array.isArray(value)) {
      return false;
    }
    return value.every((item: unknown) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return false;
      }
      const record = item as Record<string, unknown>;
      const requiredKeys = [
        'stockCode',
        'stockName',
        'rationale',
        'entryWindow',
        'buyTrigger',
        'stopLoss',
        'targetOne',
        'targetTwo',
        'holdingPeriod',
        'avoidCondition',
      ];
      return requiredKeys.every((key: string) => typeof record[key] === 'string');
    });
  }

  private readNumber(source: Record<string, unknown>, keys: string[], fallback = 0): number {
    for (const key of keys) {
      const value = source[key];
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }
      if (typeof value === 'string') {
        const parsed = Number(value.replace(/,/g, '').trim());
        if (Number.isFinite(parsed)) {
          return parsed;
        }
      }
    }
    return fallback;
  }

  private async enrichResultWithPricePlan(result: AgentPredictionResult): Promise<AgentPredictionResult> {
    const missingCodes: string[] = [];
    const shortTerm = await this.enrichHorizonPicks(result.shortTerm, 'short', missingCodes);
    const mediumTerm = await this.enrichHorizonPicks(result.mediumTerm, 'medium', missingCodes);
    const longTerm = await this.enrichHorizonPicks(result.longTerm, 'long', missingCodes);

    const notes = [...(Array.isArray(result.notes) ? result.notes : [])];
    notes.push('止损/目标位由后端基于最新日K结构自动计算（非模型拍值）。');
    if (missingCodes.length > 0) {
      notes.push(`以下标的未获取到行情，保留模型原字段：${Array.from(new Set(missingCodes)).join(', ')}`);
    }

    return {
      ...result,
      shortTerm,
      mediumTerm,
      longTerm,
      notes,
    };
  }

  private async enrichHorizonPicks(
    picks: AgentPredictionPick[],
    horizon: HorizonType,
    missingCodes: string[],
  ): Promise<AgentPredictionPick[]> {
    const result: AgentPredictionPick[] = [];
    for (const pick of picks) {
      const enriched = await this.enrichSinglePick(pick, horizon);
      if (!enriched) {
        missingCodes.push(pick.stockCode || pick.stockName || 'unknown');
        result.push(pick);
      } else {
        result.push(enriched);
      }
    }
    return result;
  }

  private async enrichSinglePick(pick: AgentPredictionPick, horizon: HorizonType): Promise<AgentPredictionPick | null> {
    const code = (pick.stockCode || '').trim();
    if (!/^\d{6}$/.test(code)) {
      return null;
    }
    const bars = await this.fetchDailyBars(code, horizon === 'short' ? 40 : horizon === 'medium' ? 120 : 320);
    if (bars.length < (horizon === 'short' ? 10 : horizon === 'medium' ? 35 : 120)) {
      return null;
    }
    const plan = this.calculatePricePlan(bars, horizon);
    const context = await this.buildStockContext(pick, horizon);
    return {
      ...pick,
      entryWindow: plan.entryWindow,
      buyTrigger: plan.buyTrigger,
      stopLoss: this.formatPrice(plan.stop),
      targetOne: this.formatPrice(plan.targetOne),
      targetTwo: this.formatPrice(plan.targetTwo),
      holdingPeriod: pick.holdingPeriod === 'N/A' ? plan.defaultHoldingPeriod : pick.holdingPeriod,
      context,
    };
  }

  private calculatePricePlan(bars: DailyBar[], horizon: HorizonType): {
    entryWindow: string;
    buyTrigger: string;
    stop: number;
    targetOne: number;
    targetTwo: number;
    defaultHoldingPeriod: string;
  } {
    const latest = bars[bars.length - 1];
    const close = latest.close;
    const take = (count: number) => bars.slice(Math.max(0, bars.length - count));
    const lows = (count: number) => take(count).map((bar: DailyBar) => bar.low);
    const highs = (count: number) => take(count).map((bar: DailyBar) => bar.high);
    const minLow = (count: number) => Math.min(...lows(count));
    const maxHigh = (count: number) => Math.max(...highs(count));

    let stop = close * 0.92;
    let targetOne = close * 1.08;
    let targetTwo = close * 1.15;
    let entryWindow = `以${latest.date}收盘价为锚，下一交易日分批`;
    let buyTrigger = `价格站稳${this.formatPrice(close)}上方并维持量价配合`;
    let defaultHoldingPeriod = '2-4周';

    if (horizon === 'short') {
      const support5 = minLow(5);
      const resistance10 = maxHigh(10);
      stop = this.clamp(support5 * 0.995, close * 0.9, close * 0.98);
      let risk = close - stop;
      if (risk < close * 0.02) {
        stop = close * 0.98;
        risk = close - stop;
      }
      targetOne = Math.max(resistance10 * 1.002, close + risk * 1.5);
      targetTwo = Math.max(targetOne + risk * 0.8, close + risk * 2.5);
      entryWindow = `${latest.date}后第1-3个交易日内，优先早盘确认`;
      buyTrigger = `突破${this.formatPrice(close * 1.003)}并维持强势（锚定${latest.date}收盘${this.formatPrice(close)}）`;
      defaultHoldingPeriod = '1-5个交易日';
    } else if (horizon === 'medium') {
      const support20 = minLow(20);
      const resistance60 = maxHigh(60);
      stop = this.clamp(support20 * 0.99, close * 0.82, close * 0.95);
      let risk = close - stop;
      if (risk < close * 0.05) {
        stop = close * 0.95;
        risk = close - stop;
      }
      targetOne = Math.max(resistance60 * 1.001, close + risk * 1.6, close * 1.08);
      targetTwo = Math.max(targetOne + risk, close + risk * 2.6);
      entryWindow = `${latest.date}后1-2周内分批布局`;
      buyTrigger = `回踩不破${this.formatPrice(close * 0.985)}后重新放量上行`;
      defaultHoldingPeriod = '2-12周';
    } else {
      const support120 = minLow(120);
      const resistance250 = maxHigh(Math.min(250, bars.length));
      stop = this.clamp(support120 * 0.98, close * 0.72, close * 0.92);
      let risk = close - stop;
      if (risk < close * 0.08) {
        stop = close * 0.92;
        risk = close - stop;
      }
      targetOne = Math.max(resistance250 * 1.002, close + risk * 1.8, close * 1.15);
      targetTwo = Math.max(targetOne + risk * 1.2, close + risk * 3.2);
      entryWindow = `${latest.date}后5-20个交易日分阶段建仓`;
      buyTrigger = `围绕${this.formatPrice(close)}附近做分批配置，回撤不破年线区域`;
      defaultHoldingPeriod = '6-24个月';
    }

    if (!(stop < close && close < targetOne && targetOne < targetTwo)) {
      const fallbackStop = close * (horizon === 'short' ? 0.97 : horizon === 'medium' ? 0.92 : 0.88);
      const risk = close - fallbackStop;
      stop = fallbackStop;
      targetOne = close + risk * (horizon === 'short' ? 1.5 : horizon === 'medium' ? 1.8 : 2.0);
      targetTwo = close + risk * (horizon === 'short' ? 2.5 : horizon === 'medium' ? 2.8 : 3.4);
    }

    return {
      entryWindow,
      buyTrigger,
      stop,
      targetOne,
      targetTwo,
      defaultHoldingPeriod,
    };
  }

  private async fetchDailyBars(stockCode: string, limit: number): Promise<DailyBar[]> {
    const cached = this.marketDataCache.get(stockCode);
    if (cached && Date.now() - cached.loadedAt < this.marketDataCacheTtlMs && cached.bars.length >= limit) {
      return cached.bars.slice(Math.max(0, cached.bars.length - limit));
    }

    const secid = this.resolveSecId(stockCode);
    if (!secid) {
      return [];
    }

    const url =
      'https://push2his.eastmoney.com/api/qt/stock/kline/get' +
      `?secid=${secid}` +
      '&klt=101&fqt=1' +
      `&lmt=${Math.max(limit, 320)}` +
      '&end=20500101' +
      '&fields1=f1,f2,f3,f4,f5,f6' +
      '&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61';

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const fetchFn = (globalThis as { fetch?: (input: string, init?: unknown) => Promise<unknown> }).fetch;
      if (!fetchFn) {
        clearTimeout(timer);
        return [];
      }
      const response = (await fetchFn(url, {
        method: 'GET',
        signal: controller.signal,
        headers: { Referer: 'https://quote.eastmoney.com/' },
      })) as {
        ok?: boolean;
        json?: () => Promise<unknown>;
      };
      clearTimeout(timer);
      if (!response?.ok || !response.json) {
        return [];
      }
      const payload = (await response.json()) as {
        data?: {
          klines?: string[];
        };
      };
      const bars = (payload?.data?.klines || [])
        .map((line: string) => {
          const parts = line.split(',');
          const date = parts[0];
          const open = Number(parts[1]);
          const close = Number(parts[2]);
          const high = Number(parts[3]);
          const low = Number(parts[4]);
          if (!date || !Number.isFinite(open) || !Number.isFinite(close) || !Number.isFinite(high) || !Number.isFinite(low)) {
            return null;
          }
          return { date, open, close, high, low } as DailyBar;
        })
        .filter((item: DailyBar | null): item is DailyBar => Boolean(item));
      if (bars.length > 0) {
        this.marketDataCache.set(stockCode, { bars, loadedAt: Date.now() });
      }
      return bars.slice(Math.max(0, bars.length - limit));
    } catch (error) {
      this.logger.warn(`Fetch daily bars failed for ${stockCode}: ${error instanceof Error ? error.message : 'unknown error'}`);
      return [];
    }
  }

  private resolveSecId(stockCode: string): string {
    if (!/^\d{6}$/.test(stockCode)) {
      return '';
    }
    if (stockCode.startsWith('6') || stockCode.startsWith('9')) {
      return `1.${stockCode}`;
    }
    if (
      stockCode.startsWith('0') ||
      stockCode.startsWith('2') ||
      stockCode.startsWith('3') ||
      stockCode.startsWith('4') ||
      stockCode.startsWith('8')
    ) {
      return `0.${stockCode}`;
    }
    return '';
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  private formatPrice(value: number): string {
    if (!Number.isFinite(value)) {
      return 'N/A';
    }
    return `${value.toFixed(2)}元`;
  }

  private async buildStockContext(pick: AgentPredictionPick, horizon: HorizonType): Promise<AgentStockContext> {
    const code = (pick.stockCode || '').trim();
    const name = (pick.stockName || '').trim();
    const cacheKey = `${code}:${horizon}`;
    const cached = this.stockContextCache.get(cacheKey);
    if (cached && Date.now() - cached.loadedAt < this.stockContextCacheTtlMs) {
      return cached.value;
    }

    const industry = this.getIndustryByStockCode(code);
    const [quote, sentiment, policySignals, earnings, macroSignals] = await Promise.all([
      this.fetchRealtimeQuote(code),
      this.fetchSentimentSignals(code, name),
      this.fetchPolicySignals(code, name, industry),
      this.fetchEarningsSignals(code),
      this.fetchMacroSignals(),
    ]);

    const dynamicAdjustment = this.buildDynamicAdjustment({
      horizon,
      changePct: quote.changePct,
      earningsProfitYoy: earnings.profitYoy,
      sentimentScore: sentiment.score,
      policySignals,
      macroSignals,
    });

    const context: AgentStockContext = {
      livePrice: quote.priceText,
      liveChangePct: quote.changePctText,
      sentimentSummary: sentiment.summary,
      sentimentSignals: sentiment.signals,
      policySignals,
      earningsSignals: earnings.signals,
      macroSignals,
      dynamicAdjustment,
      updatedAt: new Date().toISOString(),
    };
    this.stockContextCache.set(cacheKey, { value: context, loadedAt: Date.now() });
    return context;
  }

  private async fetchRealtimeQuote(stockCode: string): Promise<{ priceText: string; changePctText: string; changePct: number | null }> {
    const secid = this.resolveSecId(stockCode);
    if (!secid) {
      return { priceText: 'N/A', changePctText: 'N/A', changePct: null };
    }
    const url =
      'https://push2.eastmoney.com/api/qt/stock/get' +
      `?secid=${secid}` +
      '&fields=f43,f57,f58,f60,f170';
    const payload = await this.fetchJsonWithTimeout(url, 6000);
    const data = this.toSimpleRecord((payload as { data?: unknown })?.data);
    const latestRaw = this.readNumber(data, ['f43'], NaN);
    const prevCloseRaw = this.readNumber(data, ['f60'], NaN);
    const latest = Number.isFinite(latestRaw) ? latestRaw / 100 : NaN;
    const prevClose = Number.isFinite(prevCloseRaw) ? prevCloseRaw / 100 : NaN;
    let changePct = this.readNumber(data, ['f170'], NaN);
    if (Number.isFinite(changePct)) {
      changePct = changePct / 100;
    } else if (Number.isFinite(latest) && Number.isFinite(prevClose) && prevClose > 0) {
      changePct = ((latest - prevClose) / prevClose) * 100;
    } else {
      changePct = NaN;
    }
    return {
      priceText: Number.isFinite(latest) ? `${latest.toFixed(2)}元` : 'N/A',
      changePctText: Number.isFinite(changePct) ? `${changePct.toFixed(2)}%` : 'N/A',
      changePct: Number.isFinite(changePct) ? changePct : null,
    };
  }

  private async fetchPolicySignals(stockCode: string, stockName: string, industry: string): Promise<string[]> {
    const keyword = [stockName || stockCode, industry, '政策'].filter((item: string) => item && item.trim()).join(' ');
    const param = {
      uid: '',
      keyword,
      type: ['cmsArticleWebOld'],
      client: 'web',
      clientType: 'web',
      param: {
        cmsArticleWebOld: {
          searchScope: 'default',
          sort: 'default',
          pageIndex: 1,
          pageSize: 6,
          preTag: '<em>',
          postTag: '</em>',
        },
      },
    };
    const cb = `cb_${Date.now()}`;
    const url =
      'https://search-api-web.eastmoney.com/search/jsonp' +
      `?cb=${cb}&param=${encodeURIComponent(JSON.stringify(param))}`;
    const text = await this.fetchTextWithTimeout(url, 7000);
    if (!text) {
      return ['政策新闻接口暂无返回'];
    }
    const parsed = this.parseJsonpPayload(text);
    const root = this.toRecord(parsed);
    const resultNode = this.toRecord(root.result);
    const articleList = resultNode.cmsArticleWebOld;
    if (!Array.isArray(articleList)) {
      return ['政策新闻解析失败'];
    }
    if (articleList.length === 0) {
      return ['近期未检索到政策相关新闻'];
    }
    const policyKeyword = /政策|监管|证监会|国务院|央行|财政|利率|降准|专项债|改革/;
    const items = articleList
      .map((item: unknown) => this.toSimpleRecord(item))
      .map((item: Record<string, unknown>) => {
        const title = this.readString(item, ['title'], '').replace(/<[^>]+>/g, '');
        const date = this.readString(item, ['date'], '').slice(0, 10);
        if (!title) {
          return '';
        }
        return `${date ? date + ' ' : ''}${title}`;
      })
      .filter((line: string) => line.length > 0);
    const preferred = items.filter((line: string) => policyKeyword.test(line));
    const finalItems = (preferred.length > 0 ? preferred : items).slice(0, 3);
    return finalItems.length > 0 ? finalItems : ['近期未检索到政策相关新闻'];
  }

  private async fetchSentimentSignals(
    stockCode: string,
    stockName: string,
  ): Promise<{ summary: string; signals: string[]; score: number | null }> {
    const keyword = [stockName || stockCode, stockCode, 'A股'].filter((item: string) => item && item.trim()).join(' ');
    const param = {
      uid: '',
      keyword,
      type: ['cmsArticleWebOld'],
      client: 'web',
      clientType: 'web',
      param: {
        cmsArticleWebOld: {
          searchScope: 'default',
          sort: 'default',
          pageIndex: 1,
          pageSize: 8,
          preTag: '<em>',
          postTag: '</em>',
        },
      },
    };
    const cb = `cb_sent_${Date.now()}`;
    const url =
      'https://search-api-web.eastmoney.com/search/jsonp' +
      `?cb=${cb}&param=${encodeURIComponent(JSON.stringify(param))}`;
    const text = await this.fetchTextWithTimeout(url, 7000);
    if (!text) {
      return {
        summary: '舆情数据暂无返回',
        signals: ['舆情接口请求失败或超时'],
        score: null,
      };
    }
    const parsed = this.parseJsonpPayload(text);
    const root = this.toRecord(parsed);
    const resultNode = this.toRecord(root.result);
    const articleList = resultNode.cmsArticleWebOld;
    if (!Array.isArray(articleList) || articleList.length === 0) {
      return {
        summary: '舆情中性（样本不足）',
        signals: ['近期未检索到有效舆情新闻'],
        score: null,
      };
    }

    const positiveRegex = /增长|突破|中标|增持|回购|创新高|超预期|利好|签约|订单|获批|盈利|上调|上涨|景气/i;
    const negativeRegex = /下滑|亏损|立案|处罚|减持|风险|暴雷|诉讼|违约|停牌|问询|留置|下跌|失速|利空/i;

    let score = 0;
    const lines = articleList
      .map((item: unknown) => this.toSimpleRecord(item))
      .map((item: Record<string, unknown>) => {
        const title = this.readString(item, ['title'], '').replace(/<[^>]+>/g, '');
        const date = this.readString(item, ['date'], '').slice(0, 10);
        if (!title) {
          return '';
        }
        let lineScore = 0;
        if (positiveRegex.test(title)) {
          lineScore += 1;
        }
        if (negativeRegex.test(title)) {
          lineScore -= 1;
        }
        score += lineScore;
        return `${date ? date + ' ' : ''}${title}`;
      })
      .filter((line: string) => line.length > 0)
      .slice(0, 4);

    const summary =
      score >= 2
        ? `舆情偏多（评分 ${score}）`
        : score <= -2
          ? `舆情偏空（评分 ${score}）`
          : `舆情中性（评分 ${score}）`;

    return {
      summary,
      signals: lines.length > 0 ? lines : ['近期未检索到有效舆情新闻'],
      score,
    };
  }

  private async fetchEarningsSignals(
    stockCode: string,
  ): Promise<{ signals: string[]; profitYoy: number | null }> {
    const seccode = this.resolveSecuCode(stockCode);
    if (!seccode) {
      return { signals: ['未识别证券代码后缀，无法拉取财报'], profitYoy: null };
    }

    const financeUrl =
      'https://datacenter-web.eastmoney.com/api/data/v1/get' +
      '?reportName=RPT_F10_FINANCE_GINCOME' +
      '&columns=SECUCODE,SECURITY_NAME_ABBR,REPORT_DATE,REPORT_TYPE,NOTICE_DATE,TOTAL_OPERATE_INCOME_YOY,PARENT_NETPROFIT_YOY,BASIC_EPS' +
      `&filter=${encodeURIComponent(`(SECUCODE="${seccode}")`)}` +
      '&sortColumns=REPORT_DATE' +
      '&sortTypes=-1' +
      '&pageSize=1&pageNumber=1';
    const financePayload = await this.fetchJsonWithTimeout(financeUrl, 7000);
    const financeRow = this.extractFirstDataRow(financePayload);
    const reportType = this.readString(financeRow, ['REPORT_TYPE', 'REPORT_DATE_NAME'], '最近一期财报');
    const reportDate = this.readString(financeRow, ['REPORT_DATE', 'NOTICE_DATE'], '').slice(0, 10);
    const revenueYoy = this.readNumber(financeRow, ['TOTAL_OPERATE_INCOME_YOY', 'OPERATE_INCOME_YOY'], NaN);
    const profitYoy = this.readNumber(financeRow, ['PARENT_NETPROFIT_YOY', 'NETPROFIT_YOY'], NaN);
    const eps = this.readNumber(financeRow, ['BASIC_EPS'], NaN);

    const signals: string[] = [];
    if (reportType || reportDate) {
      const yoyParts: string[] = [];
      if (Number.isFinite(revenueYoy)) {
        yoyParts.push(`营收同比${revenueYoy.toFixed(2)}%`);
      }
      if (Number.isFinite(profitYoy)) {
        yoyParts.push(`归母净利同比${profitYoy.toFixed(2)}%`);
      }
      if (Number.isFinite(eps)) {
        yoyParts.push(`EPS ${eps.toFixed(3)}`);
      }
      signals.push(`${reportDate || '最近披露'} ${reportType}${yoyParts.length ? '：' + yoyParts.join('，') : ''}`);
    }

    const annUrl =
      'https://np-anotice-stock.eastmoney.com/api/security/ann' +
      '?sr=-1&page_size=2&page_index=1&ann_type=A' +
      `&stock_list=${stockCode}`;
    const annPayload = await this.fetchJsonWithTimeout(annUrl, 7000);
    const annData = this.toRecord((annPayload as { data?: unknown })?.data);
    const annList = annData.list;
    if (Array.isArray(annList)) {
      const annSignals = annList
        .map((item: unknown) => this.toSimpleRecord(item))
        .map((item: Record<string, unknown>) => {
          const title = this.readString(item, ['title', 'title_ch'], '');
          const date = this.readString(item, ['notice_date', 'display_time'], '').slice(0, 10);
          if (!title) {
            return '';
          }
          return `${date ? date + ' ' : ''}${title}`;
        })
        .filter((line: string) => line.length > 0)
        .slice(0, 2);
      signals.push(...annSignals);
    }

    if (signals.length === 0) {
      signals.push('财报/公告接口暂无返回');
    }

    return {
      signals: signals.slice(0, 4),
      profitYoy: Number.isFinite(profitYoy) ? profitYoy : null,
    };
  }

  private async fetchMacroSignals(): Promise<string[]> {
    if (this.macroSignalsCache && Date.now() - this.macroSignalsCache.loadedAt < this.macroSignalsCacheTtlMs) {
      return this.macroSignalsCache.value;
    }

    const [cpiPayload, pmiPayload, m2Payload] = await Promise.all([
      this.fetchJsonWithTimeout(
        'https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_ECONOMY_CPI&columns=ALL&pageNumber=1&pageSize=1&sortColumns=REPORT_DATE&sortTypes=-1',
        7000,
      ),
      this.fetchJsonWithTimeout(
        'https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_ECONOMY_PMI&columns=ALL&pageNumber=1&pageSize=1&sortColumns=REPORT_DATE&sortTypes=-1',
        7000,
      ),
      this.fetchJsonWithTimeout(
        'https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_ECONOMY_CURRENCY_SUPPLY&columns=ALL&pageNumber=1&pageSize=1&sortColumns=REPORT_DATE&sortTypes=-1',
        7000,
      ),
    ]);

    const cpi = this.extractFirstDataRow(cpiPayload);
    const pmi = this.extractFirstDataRow(pmiPayload);
    const m2 = this.extractFirstDataRow(m2Payload);

    const macroSignals: string[] = [];
    const cpiTime = this.readString(cpi, ['TIME', 'REPORT_DATE'], '').replace(' 00:00:00', '');
    const cpiYoy = this.readNumber(cpi, ['NATIONAL_SAME'], NaN);
    if (cpiTime || Number.isFinite(cpiYoy)) {
      macroSignals.push(`CPI(${cpiTime || '最近'}): 同比${Number.isFinite(cpiYoy) ? cpiYoy.toFixed(1) + '%' : 'N/A'}`);
    }

    const pmiTime = this.readString(pmi, ['TIME', 'REPORT_DATE'], '').replace(' 00:00:00', '');
    const makePmi = this.readNumber(pmi, ['MAKE_INDEX'], NaN);
    const nmakePmi = this.readNumber(pmi, ['NMAKE_INDEX'], NaN);
    if (pmiTime || Number.isFinite(makePmi) || Number.isFinite(nmakePmi)) {
      macroSignals.push(
        `PMI(${pmiTime || '最近'}): 制造业${Number.isFinite(makePmi) ? makePmi.toFixed(1) : 'N/A'}，非制造业${Number.isFinite(nmakePmi) ? nmakePmi.toFixed(1) : 'N/A'}`,
      );
    }

    const m2Time = this.readString(m2, ['TIME', 'REPORT_DATE'], '').replace(' 00:00:00', '');
    const m2Yoy = this.readNumber(m2, ['CURRENCY_SAME'], NaN);
    if (m2Time || Number.isFinite(m2Yoy)) {
      macroSignals.push(`M2(${m2Time || '最近'}): 同比${Number.isFinite(m2Yoy) ? m2Yoy.toFixed(1) + '%' : 'N/A'}`);
    }

    if (macroSignals.length === 0) {
      macroSignals.push('宏观数据接口暂无返回');
    }

    this.macroSignalsCache = { value: macroSignals, loadedAt: Date.now() };
    return macroSignals;
  }

  private buildDynamicAdjustment(input: {
    horizon: HorizonType;
    changePct: number | null;
    earningsProfitYoy: number | null;
    sentimentScore: number | null;
    policySignals: string[];
    macroSignals: string[];
  }): string {
    const messages: string[] = [];
    const pct = input.changePct;
    if (pct !== null) {
      if (pct <= -3) {
        messages.push('盘中回撤偏大：入场需等待二次企稳，建议仓位下调至50%以内。');
      } else if (pct >= 3) {
        messages.push('短线涨幅较快：避免追高，优先等待回踩确认。');
      } else {
        messages.push('价格波动中性：按原计划分批执行。');
      }
    }

    if (input.earningsProfitYoy !== null) {
      if (input.earningsProfitYoy <= -20) {
        messages.push('财报归母净利同比下滑较大：目标位宜保守，止损纪律需从严。');
      } else if (input.earningsProfitYoy >= 20) {
        messages.push('财报盈利增速较好：可维持原目标并采用分批止盈。');
      }
    }

    if (input.sentimentScore !== null) {
      if (input.sentimentScore <= -2) {
        messages.push('舆情偏空：建议降低仓位并缩短复核周期。');
      } else if (input.sentimentScore >= 2) {
        messages.push('舆情偏多：可维持计划，但不建议追高。');
      }
    }

    const policyText = input.policySignals.join(' ');
    if (/处罚|立案|减持|风险提示|留置|问询函/i.test(policyText)) {
      messages.push('政策/公告存在风险词：建议降低单票仓位并提高观察频率。');
    } else if (/支持|鼓励|补贴|中标|增持|回购/i.test(policyText)) {
      messages.push('政策/公告偏正面：可维持计划，但仍需结合盘面量价执行。');
    }

    const macroText = input.macroSignals.join(' ');
    if (/制造业([0-4]\d\.\d|49\.\d|48\.\d)/.test(macroText)) {
      messages.push('宏观景气偏弱：中长线仓位建议分三笔慢建。');
    }

    if (input.horizon === 'short' && messages.length > 0) {
      messages.push('短线执行：优先看开盘30-90分钟量价确认后再动作。');
    }
    if (input.horizon === 'long' && messages.length > 0) {
      messages.push('长线执行：以季度复核为主，避免被日内波动干扰。');
    }

    return messages.length > 0 ? messages.slice(0, 4).join(' ') : '无额外调整，按原计划执行。';
  }

  private getIndustryByStockCode(stockCode: string): string {
    const list = this.stockService.getStrategiesData();
    for (const row of list) {
      const record = this.toSimpleRecord(row);
      const code = this.readString(record, ['股票代码', 'stockCode', 'code', 'ticker'], '');
      if (code === stockCode) {
        return this.readString(record, ['所属行业', 'industry', 'sector'], '');
      }
    }
    return '';
  }

  private resolveSecuCode(stockCode: string): string {
    if (!/^\d{6}$/.test(stockCode)) {
      return '';
    }
    if (stockCode.startsWith('6') || stockCode.startsWith('9')) {
      return `${stockCode}.SH`;
    }
    if (stockCode.startsWith('4') || stockCode.startsWith('8')) {
      return `${stockCode}.BJ`;
    }
    return `${stockCode}.SZ`;
  }

  private extractFirstDataRow(payload: unknown): Record<string, unknown> {
    const root = this.toRecord(payload);
    const result = this.toRecord(root.result);
    const data = result.data;
    if (!Array.isArray(data) || data.length === 0) {
      return {};
    }
    const first = data[0];
    if (!first || typeof first !== 'object' || Array.isArray(first)) {
      return {};
    }
    return first as Record<string, unknown>;
  }

  private toRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    return value as Record<string, unknown>;
  }

  private parseJsonpPayload(raw: string): unknown {
    const text = (raw || '').trim();
    const start = text.indexOf('(');
    const end = text.lastIndexOf(')');
    if (start < 0 || end <= start) {
      return null;
    }
    const json = text.slice(start + 1, end);
    try {
      return JSON.parse(json);
    } catch {
      return null;
    }
  }

  private async fetchJsonWithTimeout(url: string, timeoutMs: number): Promise<unknown> {
    const fetchFn = (globalThis as { fetch?: (input: string, init?: unknown) => Promise<unknown> }).fetch;
    if (!fetchFn) {
      return null;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = (await fetchFn(url, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          Referer: 'https://quote.eastmoney.com/',
          'User-Agent': 'Mozilla/5.0',
        },
      })) as { ok?: boolean; json?: () => Promise<unknown> };
      if (!response?.ok || !response.json) {
        return null;
      }
      return await response.json();
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  private async fetchTextWithTimeout(url: string, timeoutMs: number): Promise<string> {
    const fetchFn = (globalThis as { fetch?: (input: string, init?: unknown) => Promise<unknown> }).fetch;
    if (!fetchFn) {
      return '';
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = (await fetchFn(url, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          Referer: 'https://www.eastmoney.com/',
          'User-Agent': 'Mozilla/5.0',
        },
      })) as { ok?: boolean; text?: () => Promise<string> };
      if (!response?.ok || !response.text) {
        return '';
      }
      return await response.text();
    } catch {
      return '';
    } finally {
      clearTimeout(timer);
    }
  }

  private readString(source: Record<string, unknown>, keys: string[], fallback = ''): string {
    for (const key of keys) {
      const value = source[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
      if (typeof value === 'number' && Number.isFinite(value)) {
        return String(value);
      }
    }
    return fallback;
  }

  private parseSimpleYamlValue(content: string, key: string): string {
    if (!content) {
      return '';
    }
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`^\\s*${escaped}:\\s*["']?(.+?)["']?\\s*$`, 'm');
    const match = content.match(regex);
    return match ? match[1].trim() : '';
  }

  private toSimpleRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    Object.keys(source).forEach((key: string) => {
      const item = source[key];
      if (
        typeof item === 'string' ||
        (typeof item === 'number' && Number.isFinite(item)) ||
        typeof item === 'boolean'
      ) {
        out[key] = item;
      }
    });
    return out;
  }

  private initializeSqlite(): void {
    try {
      const sqliteModule = require('node:sqlite') as {
        DatabaseSync: new (filePath: string) => {
          exec: (sql: string) => void;
          prepare: (sql: string) => { run: (...args: unknown[]) => void; all: (...args: unknown[]) => unknown[] };
          close: () => void;
        };
      };
      this.sqliteDb = new sqliteModule.DatabaseSync(this.sqliteDbPath);
      this.sqliteDb.exec(`
        CREATE TABLE IF NOT EXISTS agent_prediction_runs (
          id TEXT PRIMARY KEY,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          status TEXT NOT NULL,
          trigger TEXT NOT NULL,
          data_json TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_agent_prediction_runs_created_at
        ON agent_prediction_runs(created_at DESC);
      `);
    } catch (error) {
      this.sqliteDb = null;
      this.logger.warn(
        `SQLite unavailable, fallback to JSON files only: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }

  private loadExistingRuns(): void {
    this.runs.clear();
    const loadedFromSqlite = this.loadRunsFromSqlite();
    if (!loadedFromSqlite) {
      this.loadRunsFromJsonFiles();
      this.syncLoadedRunsToSqlite();
    }
    this.pruneOldRuns(true);
  }

  private saveRun(run: AgentPredictionRun): void {
    this.runs.set(run.id, run);
    fs.writeFileSync(path.join(this.predictionsDir, `${run.id}.json`), JSON.stringify(run, null, 2), 'utf-8');
    this.saveRunToSqlite(run);
    this.pruneOldRuns(false);
  }

  private loadRunsFromSqlite(): boolean {
    if (!this.sqliteDb) {
      return false;
    }
    try {
      const cutoff = this.getRetentionCutoffIso();
      const rows = this.sqliteDb
        .prepare(
          `
          SELECT data_json
          FROM agent_prediction_runs
          WHERE created_at >= ?
          ORDER BY created_at DESC
          `,
        )
        .all(cutoff) as Array<{ data_json?: string }>;
      for (const row of rows) {
        if (!row?.data_json) {
          continue;
        }
        try {
          const run = JSON.parse(row.data_json) as AgentPredictionRun;
          if (run?.id) {
            this.runs.set(run.id, run);
          }
        } catch {
          // ignore invalid row payload
        }
      }
      return this.runs.size > 0;
    } catch (error) {
      this.logger.warn(
        `Load runs from SQLite failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return false;
    }
  }

  private loadRunsFromJsonFiles(): void {
    if (!fs.existsSync(this.predictionsDir)) {
      return;
    }
    const files = fs.readdirSync(this.predictionsDir).filter((f: string) => f.endsWith('.json'));
    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(this.predictionsDir, file), 'utf-8');
        const run = JSON.parse(content) as AgentPredictionRun;
        if (run?.id) {
          this.runs.set(run.id, run);
        }
      } catch {
        // ignore invalid history file
      }
    }
  }

  private syncLoadedRunsToSqlite(): void {
    if (!this.sqliteDb || this.runs.size === 0) {
      return;
    }
    for (const run of this.runs.values()) {
      this.saveRunToSqlite(run);
    }
  }

  private saveRunToSqlite(run: AgentPredictionRun): void {
    if (!this.sqliteDb) {
      return;
    }
    try {
      const nowIso = new Date().toISOString();
      this.sqliteDb
        .prepare(
          `
          INSERT INTO agent_prediction_runs (id, created_at, updated_at, status, trigger, data_json)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            created_at=excluded.created_at,
            updated_at=excluded.updated_at,
            status=excluded.status,
            trigger=excluded.trigger,
            data_json=excluded.data_json
          `,
        )
        .run(
          run.id,
          run.createdAt || nowIso,
          nowIso,
          run.status,
          run.trigger,
          JSON.stringify(run),
        );
    } catch (error) {
      this.logger.warn(`Save run to SQLite failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  private pruneOldRuns(force: boolean): void {
    const now = Date.now();
    if (!force && now - this.lastRetentionCleanupAtMs < 60_000) {
      return;
    }
    this.lastRetentionCleanupAtMs = now;

    const cutoffTime = now - this.predictionRetentionDays * 24 * 60 * 60 * 1000;
    const cutoffIso = new Date(cutoffTime).toISOString();

    for (const [id, run] of this.runs.entries()) {
      const created = new Date(run.createdAt).getTime();
      if (!Number.isFinite(created) || created < cutoffTime) {
        this.runs.delete(id);
      }
    }

    if (fs.existsSync(this.predictionsDir)) {
      const files = fs.readdirSync(this.predictionsDir).filter((f: string) => f.endsWith('.json'));
      for (const file of files) {
        const filePath = path.join(this.predictionsDir, file);
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          const run = JSON.parse(content) as AgentPredictionRun;
          const created = new Date(run.createdAt).getTime();
          if (!run?.id || !Number.isFinite(created) || created < cutoffTime) {
            fs.rmSync(filePath, { force: true });
          }
        } catch {
          fs.rmSync(filePath, { force: true });
        }
      }
    }

    if (this.sqliteDb) {
      try {
        this.sqliteDb.prepare('DELETE FROM agent_prediction_runs WHERE created_at < ?').run(cutoffIso);
      } catch (error) {
        this.logger.warn(
          `SQLite retention cleanup failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }
    }
  }

  private getRetentionCutoffIso(): string {
    return new Date(Date.now() - this.predictionRetentionDays * 24 * 60 * 60 * 1000).toISOString();
  }

  private collectMarkdownFiles(dir: string): string[] {
    if (!fs.existsSync(dir)) {
      return [];
    }
    return fs
      .readdirSync(dir)
      .filter((file: string) => file.toLowerCase().endsWith('.md'))
      .sort()
      .map((file: string) => path.join(dir, file));
  }

  private resolveSkillDir(): string {
    const candidates = [
      path.join(process.cwd(), '..', 'stock-skill'),
      path.join(process.cwd(), 'stock-skill'),
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
    return candidates[0];
  }

  private safeReadText(filePath: string): string {
    try {
      return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : '';
    } catch {
      return '';
    }
  }

  private resolveIntervalMinutes(): number | null {
    const raw = process.env.AGENT_PREDICTION_INTERVAL_MINUTES;
    if (!raw) {
      return 120;
    }
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return 120;
    }
    return parsed === 0 ? null : Math.min(parsed, 24 * 60);
  }

  private parseBoolean(value: string | undefined, fallback: boolean): boolean {
    if (!value) {
      return fallback;
    }
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) {
      return true;
    }
    if (['0', 'false', 'no', 'off'].includes(normalized)) {
      return false;
    }
    return fallback;
  }

  private ensureDirExists(dir: string): void {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private normalizeModelBaseURL(raw: string): string {
    const trimmed = raw.trim().replace(/\/+$/, '');
    const suffix = '/chat/completions';
    if (trimmed.endsWith(suffix)) {
      return trimmed.slice(0, -suffix.length);
    }
    return trimmed;
  }
}

