import { Injectable, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';

export interface StockSummary {
  股票代码: string;
  股票名称: string;
  总市值亿: number;
  所属行业: string;
  证监会行业: string;
  持仓基金数量: number;
  持仓基金公司: string;
  持仓基金列表: string;
  合计持仓股数万股: string;
  持仓比例合计: string;
  合计持仓市值万元: string;
}

export interface StockDetail {
  股票代码: string;
  股票名称: string;
  总市值亿: number;
  所属行业: string;
  证监会行业: string;
  持仓基金: string;
  基金公司: string;
  持仓股数万股: string;
  持仓比例: string;
  持仓市值万元: string;
}

export interface StockData {
  date: string;
  updateTime: string;
  summary: StockSummary[];
  detail: StockDetail[];
}

@Injectable()
export class StockService {
  private data: StockData | null = null;
  private currentDataPath: string;
  private dataDir: string;

  constructor() {
    // 数据目录：检查多个可能的位置
    this.dataDir = this.findDataDir();
    this.currentDataPath = this.findDataFile();
    this.loadData();
  }

  private findDataDir(): string {
    const possibleDirs = [
      path.join(__dirname, '..', '..', 'data'),
      path.join(__dirname, '..', 'data'),
      path.join(process.cwd(), 'data'),
      process.cwd(),
    ];

    for (const dir of possibleDirs) {
      if (fs.existsSync(dir)) {
        // 检查是否有任何数据文件
        const files = this.scanDataFiles(dir);
        if (files.length > 0 || fs.existsSync(path.join(dir, 'stock_data.json'))) {
          return dir;
        }
      }
    }

    // 默认返回
    return path.join(process.cwd(), 'data');
  }

  private findDataFile(): string {
    const possiblePaths = [
      path.join(this.dataDir, 'stock_data.json'),
      path.join(__dirname, '..', '..', 'data', 'stock_data.json'),
      path.join(__dirname, '..', 'data', 'stock_data.json'),
      path.join(process.cwd(), 'data', 'stock_data.json'),
      path.join(process.cwd(), 'stock_data.json'),
    ];

    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        return p;
      }
    }

    return possiblePaths[0];
  }

  private scanDataFiles(dir: string = this.dataDir): string[] {
    try {
      if (!fs.existsSync(dir)) {
        return [];
      }
      const files = fs.readdirSync(dir);
      // 匹配 stock_data_YYYY-MM-DD.json 格式
      const datePattern = /^stock_data_(\d{4}-\d{2}-\d{2})\.json$/;
      const dateFiles = files
        .filter(f => datePattern.test(f))
        .map(f => ({
          filename: f,
          date: f.match(datePattern)?.[1] || '',
          path: path.join(dir, f),
        }))
        .sort((a, b) => b.date.localeCompare(a.date)); // 按日期降序

      return dateFiles.map(f => f.path);
    } catch (error) {
      console.error('Error scanning data files:', error);
      return [];
    }
  }

  private loadData(filePath: string = this.currentDataPath): void {
    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        this.data = JSON.parse(content);
        console.log(`Stock data loaded from ${filePath}, updateTime: ${this.data?.updateTime}`);
      } else {
        console.log(`Data file not found at ${filePath}`);
        this.data = null;
      }
    } catch (error) {
      console.error('Failed to load stock data:', error);
      this.data = null;
    }
  }

  // 获取可用日期列表
  getAvailableDates(): { date: string; filename: string }[] {
    const files = this.scanDataFiles();

    // 同时检查主文件
    const mainFile = path.join(this.dataDir, 'stock_data.json');
    const results: { date: string; filename: string }[] = [];

    // 先添加历史日期文件
    files.forEach(f => {
      const match = path.basename(f).match(/stock_data_(\d{4}-\d{2}-\d{2})\.json/);
      if (match) {
        results.push({ date: match[1], filename: path.basename(f) });
      }
    });

    return results;
  }

  // 加载指定日期的数据
  loadDataByDate(date: string): boolean {
    // 格式: YYYY-MM-DD
    const filename = `stock_data_${date}.json`;
    const filePath = path.join(this.dataDir, filename);

    if (fs.existsSync(filePath)) {
      this.loadData(filePath);
      this.currentDataPath = filePath;
      return true;
    }

    return false;
  }

  // 重新加载数据（用于定时刷新）
  reloadData(): boolean {
    // 尝试加载最新的主数据文件
    this.currentDataPath = this.findDataFile();
    this.loadData();
    return this.data !== null;
  }

  // 获取当前数据日期
  getCurrentDate(): string {
    return this.data?.date || '暂无数据';
  }

  // 获取更新时间
  getUpdateTime(): string {
    return this.data?.updateTime || '暂无数据';
  }

  // 获取汇总数据（支持筛选）
  getSummary(options: {
    company?: string;
    minMarketCap?: number;
    maxMarketCap?: number;
    industry?: string;
    keyword?: string;
  } = {}): StockSummary[] {
    if (!this.data) return [];

    let result = [...this.data.summary];

    // 按基金公司筛选
    if (options.company) {
      result = result.filter(item =>
        item.持仓基金公司.includes(options.company!)
      );
    }

    // 按市值筛选
    if (options.minMarketCap !== undefined) {
      result = result.filter(item => item.总市值亿 >= options.minMarketCap!);
    }
    if (options.maxMarketCap !== undefined) {
      result = result.filter(item => item.总市值亿 <= options.maxMarketCap!);
    }

    // 按行业筛选
    if (options.industry) {
      result = result.filter(item =>
        item.所属行业.includes(options.industry!) ||
        item.证监会行业.includes(options.industry!)
      );
    }

    // 关键词搜索
    if (options.keyword) {
      const keyword = options.keyword.toLowerCase();
      result = result.filter(item =>
        item.股票代码.toLowerCase().includes(keyword) ||
        item.股票名称.toLowerCase().includes(keyword) ||
        item.持仓基金列表.toLowerCase().includes(keyword)
      );
    }

    return result;
  }

  // 获取明细数据
  getDetail(stockCode?: string): StockDetail[] {
    if (!this.data) return [];

    if (stockCode) {
      return this.data.detail.filter(item => item.股票代码 === stockCode);
    }
    return this.data.detail;
  }

  // 获取单个股票详情
  getStockByCode(stockCode: string): { summary: StockSummary | undefined; detail: StockDetail[] } | null {
    if (!this.data) return null;

    const summary = this.data.summary.find(item => item.股票代码 === stockCode);
    const detail = this.data.detail.filter(item => item.股票代码 === stockCode);

    return { summary, detail };
  }

  // 获取统计信息
  getStatistics() {
    if (!this.data || this.data.summary.length === 0) {
      return {
        totalStocks: 0,
        totalMarketCap: 0,
        avgMarketCap: 0,
        companyStats: {},
        industryStats: {},
        date: '暂无数据',
      };
    }

    const summary = this.data.summary;

    // 基金公司统计
    const companyStats: Record<string, number> = {};
    summary.forEach(item => {
      const companies = item.持仓基金公司.split('、');
      companies.forEach(company => {
        companyStats[company] = (companyStats[company] || 0) + 1;
      });
    });

    // 行业统计
    const industryStats: Record<string, number> = {};
    summary.forEach(item => {
      const industry = item.所属行业 || '未知';
      industryStats[industry] = (industryStats[industry] || 0) + 1;
    });

    return {
      totalStocks: summary.length,
      totalMarketCap: summary.reduce((sum, item) => sum + item.总市值亿, 0),
      avgMarketCap: summary.reduce((sum, item) => sum + item.总市值亿, 0) / summary.length,
      companyStats,
      industryStats,
      date: this.data.date,
    };
  }

  // 导出为Excel
  exportToExcel(): Buffer {
    if (!this.data) {
      throw new NotFoundException('暂无数据可导出');
    }

    const workbook = XLSX.utils.book_new();

    // 创建汇总表
    const summaryData = this.data.summary.map(item => ({
      '股票代码': item.股票代码,
      '股票名称': item.股票名称,
      '总市值(亿)': item.总市值亿,
      '所属行业': item.所属行业,
      '证监会行业': item.证监会行业,
      '持仓基金数量': item.持仓基金数量,
      '持仓基金公司': item.持仓基金公司,
      '持仓基金列表': item.持仓基金列表,
      '合计持仓股数(万股)': item.合计持仓股数万股,
      '持仓比例合计': item.持仓比例合计,
      '合计持仓市值(万元)': item.合计持仓市值万元,
    }));

    const summarySheet = XLSX.utils.json_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(workbook, summarySheet, '汇总表');

    // 创建明细表
    const detailData = this.data.detail.map(item => ({
      '股票代码': item.股票代码,
      '股票名称': item.股票名称,
      '总市值(亿)': item.总市值亿,
      '所属行业': item.所属行业,
      '证监会行业': item.证监会行业,
      '持仓基金': item.持仓基金,
      '基金公司': item.基金公司,
      '持仓股数(万股)': item.持仓股数万股,
      '持仓比例(%)': item.持仓比例,
      '持仓市值(万元)': item.持仓市值万元,
    }));

    const detailSheet = XLSX.utils.json_to_sheet(detailData);
    XLSX.utils.book_append_sheet(workbook, detailSheet, '明细表');

    // 生成Buffer
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  }

  // 获取基金公司列表（用于筛选）
  getCompanies(): string[] {
    if (!this.data) return [];

    const companies = new Set<string>();
    this.data.summary.forEach(item => {
      const comps = item.持仓基金公司.split('、');
      comps.forEach(comp => companies.add(comp));
    });

    return Array.from(companies).sort();
  }

  // 获取行业列表（用于筛选）
  getIndustries(): string[] {
    if (!this.data) return [];

    const industries = new Set<string>();
    this.data.summary.forEach(item => {
      if (item.所属行业) {
        industries.add(item.所属行业);
      }
    });

    return Array.from(industries).sort();
  }
}
