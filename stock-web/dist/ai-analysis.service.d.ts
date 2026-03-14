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
export declare class AiAnalysisService {
    private readonly logger;
    private openai;
    private analysesDir;
    private analyses;
    constructor();
    private ensureDirExists;
    private loadExistingAnalyses;
    private saveAnalysis;
    getAllAnalyses(): StockAnalysis[];
    getAnalysesByStock(stockCode: string): StockAnalysis[];
    getAnalysis(id: string): StockAnalysis | undefined;
    createAnalysis(stockCode: string, stockName: string, stockData: {
        marketCap: number;
        industry: string;
        fundHolders: {
            fundName: string;
            fundCompany: string;
            holdShares: string;
            holdRatio: string;
            holdValue: string;
        }[];
    }): Promise<StockAnalysis>;
    private runAnalysis;
    private buildAnalysisPrompt;
    private parseAnalysisFromText;
    exportAnalysisAsText(analysis: StockAnalysis): string;
    exportAnalysisAsMarkdown(analysis: StockAnalysis): string;
}
