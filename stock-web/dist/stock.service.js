"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StockService = void 0;
const common_1 = require("@nestjs/common");
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
let StockService = class StockService {
    constructor() {
        this.data = null;
        this.dataDir = this.findDataDir();
        this.currentDataPath = this.findDataFile();
        this.loadData();
    }
    findDataDir() {
        const possibleDirs = [
            path.join(__dirname, '..', '..', 'data'),
            path.join(__dirname, '..', 'data'),
            path.join(process.cwd(), 'data'),
            process.cwd(),
        ];
        for (const dir of possibleDirs) {
            if (fs.existsSync(dir)) {
                const files = this.scanDataFiles(dir);
                if (files.length > 0 || fs.existsSync(path.join(dir, 'stock_data.json'))) {
                    return dir;
                }
            }
        }
        return path.join(process.cwd(), 'data');
    }
    findDataFile() {
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
    scanDataFiles(dir = this.dataDir) {
        try {
            if (!fs.existsSync(dir)) {
                return [];
            }
            const files = fs.readdirSync(dir);
            const datePattern = /^stock_data_(\d{4}-\d{2}-\d{2})\.json$/;
            const dateFiles = files
                .filter(f => datePattern.test(f))
                .map(f => ({
                filename: f,
                date: f.match(datePattern)?.[1] || '',
                path: path.join(dir, f),
            }))
                .sort((a, b) => b.date.localeCompare(a.date));
            return dateFiles.map(f => f.path);
        }
        catch (error) {
            console.error('Error scanning data files:', error);
            return [];
        }
    }
    loadData(filePath = this.currentDataPath) {
        try {
            if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, 'utf-8');
                this.data = JSON.parse(content);
                console.log(`Stock data loaded from ${filePath}, updateTime: ${this.data?.updateTime}`);
            }
            else {
                console.log(`Data file not found at ${filePath}`);
                this.data = null;
            }
        }
        catch (error) {
            console.error('Failed to load stock data:', error);
            this.data = null;
        }
    }
    getAvailableDates() {
        const files = this.scanDataFiles();
        const mainFile = path.join(this.dataDir, 'stock_data.json');
        const results = [];
        files.forEach(f => {
            const match = path.basename(f).match(/stock_data_(\d{4}-\d{2}-\d{2})\.json/);
            if (match) {
                results.push({ date: match[1], filename: path.basename(f) });
            }
        });
        return results;
    }
    loadDataByDate(date) {
        const filename = `stock_data_${date}.json`;
        const filePath = path.join(this.dataDir, filename);
        if (fs.existsSync(filePath)) {
            this.loadData(filePath);
            this.currentDataPath = filePath;
            return true;
        }
        return false;
    }
    reloadData() {
        this.currentDataPath = this.findDataFile();
        this.loadData();
        return this.data !== null;
    }
    getCurrentDate() {
        return this.data?.date || '暂无数据';
    }
    getUpdateTime() {
        return this.data?.updateTime || '暂无数据';
    }
    getSummary(options = {}) {
        if (!this.data)
            return [];
        let result = [...this.data.summary];
        if (options.company) {
            result = result.filter(item => item.持仓基金公司.includes(options.company));
        }
        if (options.minMarketCap !== undefined) {
            result = result.filter(item => item.总市值亿 >= options.minMarketCap);
        }
        if (options.maxMarketCap !== undefined) {
            result = result.filter(item => item.总市值亿 <= options.maxMarketCap);
        }
        if (options.industry) {
            result = result.filter(item => item.所属行业.includes(options.industry) ||
                item.证监会行业.includes(options.industry));
        }
        if (options.keyword) {
            const keyword = options.keyword.toLowerCase();
            result = result.filter(item => item.股票代码.toLowerCase().includes(keyword) ||
                item.股票名称.toLowerCase().includes(keyword) ||
                item.持仓基金列表.toLowerCase().includes(keyword));
        }
        return result;
    }
    getDetail(stockCode) {
        if (!this.data)
            return [];
        if (stockCode) {
            return this.data.detail.filter(item => item.股票代码 === stockCode);
        }
        return this.data.detail;
    }
    getStockByCode(stockCode) {
        if (!this.data)
            return null;
        const summary = this.data.summary.find(item => item.股票代码 === stockCode);
        const detail = this.data.detail.filter(item => item.股票代码 === stockCode);
        return { summary, detail };
    }
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
        const companyStats = {};
        summary.forEach(item => {
            const companies = item.持仓基金公司.split('、');
            companies.forEach(company => {
                companyStats[company] = (companyStats[company] || 0) + 1;
            });
        });
        const industryStats = {};
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
    exportToExcel() {
        if (!this.data) {
            throw new common_1.NotFoundException('暂无数据可导出');
        }
        const workbook = XLSX.utils.book_new();
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
        return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    }
    getCompanies() {
        if (!this.data)
            return [];
        const companies = new Set();
        this.data.summary.forEach(item => {
            const comps = item.持仓基金公司.split('、');
            comps.forEach(comp => companies.add(comp));
        });
        return Array.from(companies).sort();
    }
    getIndustries() {
        if (!this.data)
            return [];
        const industries = new Set();
        this.data.summary.forEach(item => {
            if (item.所属行业) {
                industries.add(item.所属行业);
            }
        });
        return Array.from(industries).sort();
    }
};
exports.StockService = StockService;
exports.StockService = StockService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], StockService);
//# sourceMappingURL=stock.service.js.map