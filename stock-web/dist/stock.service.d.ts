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
export declare class StockService {
    private data;
    private currentDataPath;
    private dataDir;
    constructor();
    private findDataDir;
    private findDataFile;
    private scanDataFiles;
    private loadData;
    getAvailableDates(): {
        date: string;
        filename: string;
    }[];
    loadDataByDate(date: string): boolean;
    reloadData(): boolean;
    getCurrentDate(): string;
    getUpdateTime(): string;
    getSummary(options?: {
        company?: string;
        minMarketCap?: number;
        maxMarketCap?: number;
        industry?: string;
        keyword?: string;
    }): StockSummary[];
    getDetail(stockCode?: string): StockDetail[];
    getStockByCode(stockCode: string): {
        summary: StockSummary | undefined;
        detail: StockDetail[];
    } | null;
    getStatistics(): {
        totalStocks: number;
        totalMarketCap: number;
        avgMarketCap: number;
        companyStats: Record<string, number>;
        industryStats: Record<string, number>;
        date: string;
    };
    exportToExcel(): Buffer;
    getCompanies(): string[];
    getIndustries(): string[];
}
