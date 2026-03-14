import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

export interface StockAnalysis {
  id: string;
  stockCode: string;
  stockName: string;
  date: string;
  createdAt: string;
  status: 'pending' | 'completed' | 'failed';
  analysis?: AnalysisResult;
  error?: string;
}

export interface AnalysisResult {
  summary: string;
  fundamentals: {
    marketCap: string;
    industry: string;
    industryPosition: string;
  };
  fundHolding: {
    overview: string;
    companies: {
      name: string;
      analysis: string;
    }[];
  };
  investmentHighlights: string[];
  riskWarnings: string[];
  conclusion: string;
  recommendation: string;
}

@Injectable()
export class AiAnalysisService {
  private readonly logger = new Logger(AiAnalysisService.name);
  private openai: OpenAI | null = null;
  private analysesDir: string;
  private analyses: Map<string, StockAnalysis> = new Map();

  constructor() {
    // 初始化OpenAI客户端（从环境变量读取配置）
    const apiKey = process.env.BUILTIN_MODEL_API_KEY;
    const baseURL = process.env.BUILTIN_MODEL_BASE_URL || 'https://api.longcat.chat/openai/v1';
    const modelId = process.env.BUILTIN_MODEL_ID || 'LongCat-Flash-Chat';

    if (apiKey) {
      this.openai = new OpenAI({
        apiKey,
        baseURL,
      });
      this.logger.log(`AI分析服务已初始化，模型: ${modelId}`);
    } else {
      this.logger.warn('未配置 BUILTIN_MODEL_API_KEY，AI分析功能将不可用');
      this.logger.warn('请在环境变量中配置: BUILTIN_MODEL_API_KEY, BUILTIN_MODEL_BASE_URL, BUILTIN_MODEL_ID');
    }

    // 分析结果存储目录
    this.analysesDir = path.join(process.cwd(), 'data', 'analyses');
    this.ensureDirExists(this.analysesDir);

    // 加载已有的分析结果
    this.loadExistingAnalyses();
  }

  private ensureDirExists(dir: string) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private loadExistingAnalyses() {
    try {
      if (fs.existsSync(this.analysesDir)) {
        const files = fs.readdirSync(this.analysesDir).filter(f => f.endsWith('.json'));
        for (const file of files) {
          try {
            const content = fs.readFileSync(path.join(this.analysesDir, file), 'utf-8');
            const analysis: StockAnalysis = JSON.parse(content);
            this.analyses.set(analysis.id, analysis);
          } catch (e) {
            this.logger.error(`Failed to load analysis file: ${file}`);
          }
        }
        this.logger.log(`Loaded ${this.analyses.size} existing analyses`);
      }
    } catch (error) {
      this.logger.error('Failed to load existing analyses', error);
    }
  }

  private saveAnalysis(analysis: StockAnalysis) {
    const filePath = path.join(this.analysesDir, `${analysis.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(analysis, null, 2), 'utf-8');
  }

  // 获取所有分析列表
  getAllAnalyses(): StockAnalysis[] {
    return Array.from(this.analyses.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  // 获取指定股票的分析
  getAnalysesByStock(stockCode: string): StockAnalysis[] {
    return this.getAllAnalyses().filter(a => a.stockCode === stockCode);
  }

  // 获取单个分析
  getAnalysis(id: string): StockAnalysis | undefined {
    return this.analyses.get(id);
  }

  // 创建分析任务
  async createAnalysis(
    stockCode: string,
    stockName: string,
    stockData: {
      marketCap: number;
      industry: string;
      fundHolders: {
        fundName: string;
        fundCompany: string;
        holdShares: string;
        holdRatio: string;
        holdValue: string;
      }[];
    }
  ): Promise<StockAnalysis> {
    const id = uuidv4();
    const analysis: StockAnalysis = {
      id,
      stockCode,
      stockName,
      date: new Date().toISOString().slice(0, 10),
      createdAt: new Date().toISOString(),
      status: 'pending',
    };

    this.analyses.set(id, analysis);
    this.saveAnalysis(analysis);

    // 异步执行分析
    this.runAnalysis(analysis, stockData);

    return analysis;
  }

  // 执行AI分析
  private async runAnalysis(
    analysis: StockAnalysis,
    stockData: {
      marketCap: number;
      industry: string;
      fundHolders: {
        fundName: string;
        fundCompany: string;
        holdShares: string;
        holdRatio: string;
        holdValue: string;
      }[];
    }
  ): Promise<void> {
    // 检查OpenAI客户端是否已初始化
    if (!this.openai) {
      analysis.status = 'failed';
      analysis.error = 'AI分析服务未配置，请设置环境变量 BUILTIN_MODEL_API_KEY';
      this.analyses.set(analysis.id, analysis);
      this.saveAnalysis(analysis);
      this.logger.error('AI analysis failed: OpenAI client not initialized (missing API key)');
      return;
    }

    try {
      this.logger.log(`Starting AI analysis for ${analysis.stockCode} - ${analysis.stockName}`);

      const prompt = this.buildAnalysisPrompt(analysis, stockData);

      const response = await this.openai.chat.completions.create({
        model: process.env.BUILTIN_MODEL_ID || 'LongCat-Flash-Chat',
        messages: [
          {
            role: 'system',
            content: `你是一位专业的股票分析师，擅长从基本面、行业地位、机构持仓等角度分析股票投资价值。
请用专业但易懂的语言进行分析，给出客观、理性的判断。
分析时请注意：
1. 基于提供的数据进行客观分析
2. 指出投资亮点的同时也要提示风险
3. 给出明确的投资建议参考
4. 使用中文回复
5. 输出严格的JSON格式，不要包含任何其他文字`,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 4000,
      });

      const content = response.choices[0]?.message?.content || '';

      // 尝试解析JSON响应
      let result: AnalysisResult;
      try {
        // 尝试提取JSON部分
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          result = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('No JSON found in response');
        }
      } catch (parseError) {
        // 如果解析失败，使用默认结构
        result = this.parseAnalysisFromText(content, analysis, stockData);
      }

      analysis.status = 'completed';
      analysis.analysis = result;
      this.analyses.set(analysis.id, analysis);
      this.saveAnalysis(analysis);

      this.logger.log(`Completed AI analysis for ${analysis.stockCode}`);
    } catch (error) {
      this.logger.error(`Failed to analyze ${analysis.stockCode}:`, error);
      analysis.status = 'failed';
      analysis.error = error instanceof Error ? error.message : '分析失败';
      this.analyses.set(analysis.id, analysis);
      this.saveAnalysis(analysis);
    }
  }

  private buildAnalysisPrompt(
    analysis: StockAnalysis,
    stockData: {
      marketCap: number;
      industry: string;
      fundHolders: {
        fundName: string;
        fundCompany: string;
        holdShares: string;
        holdRatio: string;
        holdValue: string;
      }[];
    }
  ): string {
    const fundHoldersText = stockData.fundHolders
      .map(
        h =>
          `- ${h.fundName}（${h.fundCompany}）：持仓${h.holdShares}股，占比${h.holdRatio}，市值${h.holdValue}万元`
      )
      .join('\n');

    // 按基金公司分组统计
    const companyGroups: Record<string, number> = {};
    stockData.fundHolders.forEach(h => {
      companyGroups[h.fundCompany] = (companyGroups[h.fundCompany] || 0) + 1;
    });
    const companySummary = Object.entries(companyGroups)
      .map(([company, count]) => `${company}(${count}只基金)`)
      .join('、');

    return `请分析以下股票的投资价值，并以JSON格式返回分析结果。

## 股票基本信息
- 股票代码：${analysis.stockCode}
- 股票名称：${analysis.stockName}
- 总市值：${stockData.marketCap.toFixed(2)}亿元
- 所属行业：${stockData.industry || '未知'}

## 持仓基金情况
共${stockData.fundHolders.length}只基金持有该股票，涉及基金公司：${companySummary}

持仓明细：
${fundHoldersText}

## 分析要求
请从以下维度进行分析，并输出JSON格式结果：

1. **摘要（summary）**：简要概述该股票的核心投资逻辑（100-150字）

2. **基本面分析（fundamentals）**：
   - marketCap: 市值规模评价（大盘/中盘/小盘及含义）
   - industry: 行业特点简述
   - industryPosition: 该股票在行业中的地位分析

3. **基金持仓分析（fundHolding）**：
   - overview: 机构持仓整体评价
   - companies: 各基金公司持仓分析数组，每个包含name和analysis

4. **投资亮点（investmentHighlights）**：3-5个投资亮点（数组）

5. **风险提示（riskWarnings）**：2-3个主要风险点（数组）

6. **总结（conclusion）**：综合评价（100-150字）

7. **投资建议（recommendation）**：建议评级（强烈推荐/推荐/中性/谨慎/回避）

请严格按以下JSON格式输出：
{
  "summary": "摘要内容",
  "fundamentals": {
    "marketCap": "市值评价",
    "industry": "行业特点",
    "industryPosition": "行业地位分析"
  },
  "fundHolding": {
    "overview": "持仓整体评价",
    "companies": [
      {"name": "基金公司名", "analysis": "分析内容"}
    ]
  },
  "investmentHighlights": ["亮点1", "亮点2"],
  "riskWarnings": ["风险1", "风险2"],
  "conclusion": "综合评价",
  "recommendation": "建议评级"
}`;
  }

  private parseAnalysisFromText(
    text: string,
    analysis: StockAnalysis,
    stockData: { marketCap: number; industry: string; fundHolders: any[] }
  ): AnalysisResult {
    // 如果AI返回的不是标准JSON，尝试从文本中提取信息
    const companyGroups: Record<string, number> = {};
    stockData.fundHolders.forEach(h => {
      companyGroups[h.fundCompany] = (companyGroups[h.fundCompany] || 0) + 1;
    });

    return {
      summary: text.slice(0, 200) || `${analysis.stockName}是一只市值${stockData.marketCap.toFixed(0)}亿的股票，被${stockData.fundHolders.length}只基金持有。`,
      fundamentals: {
        marketCap: `总市值${stockData.marketCap.toFixed(0)}亿元，属于${stockData.marketCap > 1000 ? '大盘股' : stockData.marketCap > 300 ? '中盘股' : '小盘股'}`,
        industry: stockData.industry || '未知行业',
        industryPosition: '请参考详细分析',
      },
      fundHolding: {
        overview: `共${stockData.fundHolders.length}只基金持有，涉及${Object.keys(companyGroups).length}家基金公司`,
        companies: Object.keys(companyGroups).map(name => ({
          name,
          analysis: `${name}旗下${companyGroups[name]}只基金持有该股票`,
        })),
      },
      investmentHighlights: ['获得多家知名基金公司持仓', '市值规模适中'],
      riskWarnings: ['市场波动风险', '行业政策风险'],
      conclusion: text.slice(-200) || '请结合市场环境和个人风险承受能力做出投资决策。',
      recommendation: '中性',
    };
  }

  // 导出分析报告为文本
  exportAnalysisAsText(analysis: StockAnalysis): string {
    if (!analysis.analysis) return '';

    const a = analysis.analysis;
    let text = `
================================================================================
                        股票投资分析报告
================================================================================

股票代码：${analysis.stockCode}
股票名称：${analysis.stockName}
分析日期：${analysis.date}
报告生成时间：${analysis.createdAt}

================================================================================
                            【摘要】
================================================================================

${a.summary}

================================================================================
                          【基本面分析】
================================================================================

市值规模：${a.fundamentals.marketCap}

所属行业：${a.fundamentals.industry}

行业地位：${a.fundamentals.industryPosition}

================================================================================
                          【基金持仓分析】
================================================================================

整体评价：${a.fundHolding.overview}

各基金公司分析：
${a.fundHolding.companies.map(c => `  • ${c.name}：${c.analysis}`).join('\n')}

================================================================================
                          【投资亮点】
================================================================================

${a.investmentHighlights.map((h, i) => `${i + 1}. ${h}`).join('\n\n')}

================================================================================
                          【风险提示】
================================================================================

${a.riskWarnings.map((r, i) => `${i + 1}. ${r}`).join('\n\n')}

================================================================================
                          【综合评价】
================================================================================

${a.conclusion}

================================================================================
                          【投资建议】
================================================================================

${a.recommendation}

================================================================================
                        免责声明
================================================================================

本报告由AI自动生成，仅供参考，不构成投资建议。投资有风险，入市需谨慎。
================================================================================
`;

    return text;
  }

  // 导出分析报告为Markdown
  exportAnalysisAsMarkdown(analysis: StockAnalysis): string {
    if (!analysis.analysis) return '';

    const a = analysis.analysis;
    return `# 股票投资分析报告

## 基本信息

| 项目 | 内容 |
|------|------|
| 股票代码 | ${analysis.stockCode} |
| 股票名称 | ${analysis.stockName} |
| 分析日期 | ${analysis.date} |

---

## 摘要

${a.summary}

---

## 基本面分析

### 市值规模
${a.fundamentals.marketCap}

### 所属行业
${a.fundamentals.industry}

### 行业地位
${a.fundamentals.industryPosition}

---

## 基金持仓分析

### 整体评价
${a.fundHolding.overview}

### 各基金公司分析

${a.fundHolding.companies.map(c => `#### ${c.name}\n${c.analysis}`).join('\n\n')}

---

## 投资亮点

${a.investmentHighlights.map(h => `- ${h}`).join('\n')}

---

## 风险提示

${a.riskWarnings.map(r => `- ${r}`).join('\n')}

---

## 综合评价

${a.conclusion}

---

## 投资建议

**${a.recommendation}**

---

> ⚠️ **免责声明**：本报告由AI自动生成，仅供参考，不构成投资建议。投资有风险，入市需谨慎。
`;
  }
}
