import { Response } from 'express';
import { StockService } from './stock.service';
import { AiAnalysisService } from './ai-analysis.service';
export declare class StockController {
    private readonly stockService;
    private readonly aiAnalysisService;
    constructor(stockService: StockService, aiAnalysisService: AiAnalysisService);
    getHomePage(res: Response): void;
    getAnalysesPage(res: Response): void;
    getAnalysisDetailPage(id: string, res: Response): void;
    getAvailableDates(): {
        date: string;
        filename: string;
    }[];
    loadDataByDate(date: string): {
        success: boolean;
        date: string;
        updateTime: string;
        statistics: {
            totalStocks: number;
            totalMarketCap: number;
            avgMarketCap: number;
            companyStats: Record<string, number>;
            industryStats: Record<string, number>;
            date: string;
        };
    };
    getCurrentDate(): {
        date: string;
        updateTime: string;
    };
    getUpdateTime(): {
        updateTime: string;
    };
    getSummary(company?: string, minCap?: string, maxCap?: string, industry?: string, keyword?: string): import("./stock.service").StockSummary[];
    getDetail(code?: string): import("./stock.service").StockDetail[];
    getStock(code: string): {
        summary: import("./stock.service").StockSummary | undefined;
        detail: import("./stock.service").StockDetail[];
    };
    getStatistics(): {
        totalStocks: number;
        totalMarketCap: number;
        avgMarketCap: number;
        companyStats: Record<string, number>;
        industryStats: Record<string, number>;
        date: string;
    };
    getCompanies(): string[];
    getIndustries(): string[];
    exportExcel(res: Response, date?: string): void;
    refreshData(): {
        success: boolean;
        message: string;
        date: string;
        updateTime: string;
    };
    createAnalysis(code: string): Promise<{
        success: boolean;
        analysisId: string;
    }>;
    getAnalysis(id: string): import("./ai-analysis.service").StockAnalysis;
    getAllAnalyses(): import("./ai-analysis.service").StockAnalysis[];
    getAnalysesByStock(code: string): import("./ai-analysis.service").StockAnalysis[];
    downloadAnalysis(id: string, format: string, res: Response): void;
    private generateMainPage;
    private generateAnalysesPage;
    private generateAnalysisDetailPage;
    private getCommonStyles;
}
