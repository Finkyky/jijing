import { Controller, Get, Post, Query, Res, NotFoundException, Param } from '@nestjs/common';
import { Response } from 'express';
import { StockService } from './stock.service';
import { AiAnalysisService } from './ai-analysis.service';

@Controller()
export class StockController {
  constructor(
    private readonly stockService: StockService,
    private readonly aiAnalysisService: AiAnalysisService,
  ) {}

  // 首页
  @Get()
  getHomePage(@Res() res: Response) {
    const html = this.generateMainPage();
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  }

  // 分析列表页
  @Get('analyses')
  getAnalysesPage(@Res() res: Response) {
    const html = this.generateAnalysesPage();
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  }

  // 投资策略页
  @Get('strategies')
  getStrategiesPage(@Res() res: Response) {
    const html = this.generateStrategiesPage();
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  }

  // API: 获取策略数据
  @Get('api/strategies')
  getStrategiesData(@Query('date') date?: string) {
    if (date) {
      this.stockService.loadDataByDate(date);
    }
    return this.stockService.getStrategiesData();
  }

  // 分析详情页
  @Get('analysis/:id')
  getAnalysisDetailPage(@Param('id') id: string, @Res() res: Response) {
    const analysis = this.aiAnalysisService.getAnalysis(id);
    if (!analysis) {
      throw new NotFoundException('分析报告不存在');
    }
    const html = this.generateAnalysisDetailPage(analysis);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  }

  // API: 获取可用日期列表
  @Get('api/dates')
  getAvailableDates() {
    return this.stockService.getAvailableDates();
  }

  // API: 切换日期数据
  @Get('api/date/:date')
  loadDataByDate(@Param('date') date: string) {
    const success = this.stockService.loadDataByDate(date);
    if (!success) {
      throw new NotFoundException(`未找到 ${date} 的数据`);
    }
    return {
      success: true,
      date: this.stockService.getCurrentDate(),
      updateTime: this.stockService.getUpdateTime(),
      statistics: this.stockService.getStatistics(),
    };
  }

  // API: 获取当前日期
  @Get('api/current-date')
  getCurrentDate() {
    return {
      date: this.stockService.getCurrentDate(),
      updateTime: this.stockService.getUpdateTime(),
    };
  }

  // API: 获取更新时间
  @Get('api/update-time')
  getUpdateTime() {
    return { updateTime: this.stockService.getUpdateTime() };
  }

  // API: 获取汇总数据
  @Get('api/summary')
  getSummary(
    @Query('company') company?: string | string[],
    @Query('minCap') minCap?: string,
    @Query('maxCap') maxCap?: string,
    @Query('industry') industry?: string,
    @Query('keyword') keyword?: string,
  ) {
    // 支持多个基金公司筛选（数组或单个值）
    let companies: string[] | undefined;
    if (company) {
      companies = Array.isArray(company) ? company : [company];
    }
    return this.stockService.getSummary({
      companies,
      minMarketCap: minCap ? parseFloat(minCap) : undefined,
      maxMarketCap: maxCap ? parseFloat(maxCap) : undefined,
      industry,
      keyword,
    });
  }

  // API: 获取轻量级汇总数据（用于列表展示，减少数据传输）
  @Get('api/summary/light')
  getSummaryLight(
    @Query('company') company?: string | string[],
    @Query('minCap') minCap?: string,
    @Query('maxCap') maxCap?: string,
    @Query('industry') industry?: string,
    @Query('keyword') keyword?: string,
  ) {
    let companies: string[] | undefined;
    if (company) {
      companies = Array.isArray(company) ? company : [company];
    }
    return this.stockService.getSummaryLight({
      companies,
      minMarketCap: minCap ? parseFloat(minCap) : undefined,
      maxMarketCap: maxCap ? parseFloat(maxCap) : undefined,
      industry,
      keyword,
    });
  }

  // API: 获取明细数据
  @Get('api/detail')
  getDetail(@Query('code') code?: string) {
    return this.stockService.getDetail(code);
  }

  // API: 获取单个股票详情
  @Get('api/stock/:code')
  getStock(code: string) {
    const result = this.stockService.getStockByCode(code);
    if (!result) {
      throw new NotFoundException('股票不存在');
    }
    return result;
  }

  // API: 获取统计信息
  @Get('api/statistics')
  getStatistics() {
    return this.stockService.getStatistics();
  }

  // API: 获取基金公司列表
  @Get('api/companies')
  getCompanies() {
    return this.stockService.getCompanies();
  }

  // API: 获取行业列表
  @Get('api/industries')
  getIndustries() {
    return this.stockService.getIndustries();
  }

  // API: 获取所有股票代码列表（用于前端获取实时行情）
  @Get('api/stock-codes')
  getStockCodes() {
    return this.stockService.getAllStockCodes();
  }

  // API: 导出汇总表Excel
  @Get('api/export')
  exportExcel(
    @Res() res: Response,
    @Query('date') date?: string,
    @Query('company') company?: string | string[],
    @Query('minCap') minCap?: string,
    @Query('maxCap') maxCap?: string,
    @Query('industry') industry?: string,
    @Query('keyword') keyword?: string,
  ) {
    if (date) {
      this.stockService.loadDataByDate(date);
    }

    // 支持多个基金公司筛选
    let companies: string[] | undefined;
    if (company) {
      companies = Array.isArray(company) ? company : [company];
    }

    const options = {
      companies,
      minMarketCap: minCap ? parseFloat(minCap) : undefined,
      maxMarketCap: maxCap ? parseFloat(maxCap) : undefined,
      industry,
      keyword,
    };

    try {
      const buffer = this.stockService.exportToExcel(options);
      const timestamp = date || new Date().toISOString().slice(0, 10);
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=stock_filter_${timestamp}.xlsx`,
      );
      res.send(buffer);
    } catch (error) {
      throw new NotFoundException('导出失败：暂无数据');
    }
  }

  // API: 导出单只股票明细Excel
  @Get('api/export/detail')
  exportDetailExcel(
    @Res() res: Response,
    @Query('code') code: string,
    @Query('name') name: string,
    @Query('date') date?: string,
  ) {
    if (date) {
      this.stockService.loadDataByDate(date);
    }

    try {
      const buffer = this.stockService.exportDetailExcel(code, name);
      const timestamp = date || new Date().toISOString().slice(0, 10);
      const filename = `${code}_${name}_detail_${timestamp}.xlsx`;
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      );
      res.send(buffer);
    } catch (error) {
      throw new NotFoundException('导出失败：' + (error.message || '暂无数据'));
    }
  }

  // API: 刷新数据
  @Get('api/refresh')
  refreshData() {
    const success = this.stockService.reloadData();
    return {
      success,
      message: success ? '数据刷新成功' : '数据刷新失败，请检查数据文件',
      date: this.stockService.getCurrentDate(),
      updateTime: this.stockService.getUpdateTime(),
    };
  }

  // API: 创建AI分析
  @Post('api/analyze/:code')
  async createAnalysis(@Param('code') code: string) {
    const stockData = this.stockService.getStockByCode(code);
    if (!stockData || !stockData.summary) {
      throw new NotFoundException('股票不存在');
    }

    const analysis = await this.aiAnalysisService.createAnalysis(
      code,
      stockData.summary.股票名称,
      {
        marketCap: stockData.summary.总市值亿,
        industry: stockData.summary.所属行业,
        fundHolders: stockData.detail.map(d => ({
          fundName: d.持仓基金,
          fundCompany: d.基金公司,
          holdShares: d.持仓股数万股,
          holdRatio: d.持仓比例,
          holdValue: d.持仓市值万元,
        })),
      },
    );

    return { success: true, analysisId: analysis.id };
  }

  // API: 获取分析结果
  @Get('api/analysis/:id')
  getAnalysis(@Param('id') id: string) {
    const analysis = this.aiAnalysisService.getAnalysis(id);
    if (!analysis) {
      throw new NotFoundException('分析报告不存在');
    }
    return analysis;
  }

  // API: 获取所有分析列表
  @Get('api/analyses')
  getAllAnalyses() {
    return this.aiAnalysisService.getAllAnalyses();
  }

  // API: 获取股票的分析历史
  @Get('api/analyses/:code')
  getAnalysesByStock(@Param('code') code: string) {
    return this.aiAnalysisService.getAnalysesByStock(code);
  }

  // API: 下载分析报告
  @Get('api/analysis/:id/download')
  downloadAnalysis(@Param('id') id: string, @Query('format') format: string, @Res() res: Response) {
    const analysis = this.aiAnalysisService.getAnalysis(id);
    if (!analysis || !analysis.analysis) {
      throw new NotFoundException('分析报告不存在或未完成');
    }

    let content: string;
    let filename: string;
    let contentType: string;

    if (format === 'md' || format === 'markdown') {
      content = this.aiAnalysisService.exportAnalysisAsMarkdown(analysis);
      filename = `analysis_${analysis.stockCode}_${analysis.date}.md`;
      contentType = 'text/markdown; charset=utf-8';
    } else {
      content = this.aiAnalysisService.exportAnalysisAsText(analysis);
      filename = `analysis_${analysis.stockCode}_${analysis.date}.txt`;
      contentType = 'text/plain; charset=utf-8';
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(content);
  }

  // 生成主页面HTML
  private generateMainPage(): string {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>股票筛选数据平台</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        ${this.getCommonStyles()}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="header-content">
                <div class="header-left">
                    <h1>📈 股票筛选数据平台</h1>
                    <div class="nav-links">
                        <a href="/" class="nav-link active">📊 数据列表</a>
                        <a href="/strategies" class="nav-link">💡 投资策略</a>
                        <a href="/analyses" class="nav-link">🤖 AI分析</a>
                    </div>
                </div>
                <div class="header-right">
                    <div class="date-selector">
                        <label for="dateSelect">📅 选择日期</label>
                        <select id="dateSelect" onchange="changeDate()">
                            <option value="">加载中...</option>
                        </select>
                    </div>
                    <span class="update-time" id="updateTime">数据更新时间：加载中...</span>
                </div>
            </div>
        </div>

        <div class="stats" id="stats">
            <div class="stat-card">
                <div class="value" id="totalStocks">-</div>
                <div class="label">符合条件的股票</div>
            </div>
            <div class="stat-card">
                <div class="value" id="totalMarketCap">-</div>
                <div class="label">总市值(亿)</div>
            </div>
            <div class="stat-card">
                <div class="value" id="avgMarketCap">-</div>
                <div class="label">平均市值(亿)</div>
            </div>
        </div>

        <div class="filters">
            <div class="filters-header">
                <svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path>
                </svg>
                <h3>筛选条件</h3>
            </div>
            <div class="filter-row">
                <div class="filter-group multi-select-group">
                    <label>基金公司</label>
                    <div class="multi-select-container" id="companyFilterContainer">
                        <div class="multi-select-trigger" onclick="toggleCompanyDropdown()">
                            <span id="companyFilterText">全部</span>
                            <svg class="dropdown-icon" width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                            </svg>
                        </div>
                        <div class="multi-select-dropdown" id="companyFilterDropdown">
                            <label class="multi-select-option">
                                <input type="checkbox" value="" onchange="updateCompanyFilterText()"> 全部
                            </label>
                        </div>
                    </div>
                </div>
                <div class="filter-group">
                    <label>最小市值(亿)</label>
                    <input type="number" id="minCapFilter" placeholder="如: 500">
                </div>
                <div class="filter-group">
                    <label>最大市值(亿)</label>
                    <input type="number" id="maxCapFilter" placeholder="如: 5000">
                </div>
                <div class="filter-group">
                    <label>行业</label>
                    <select id="industryFilter">
                        <option value="">全部</option>
                    </select>
                </div>
                <div class="filter-group">
                    <label>关键词搜索</label>
                    <input type="text" id="keywordFilter" placeholder="股票代码/名称/基金">
                </div>
                <div class="actions">
                    <button class="btn btn-primary" onclick="applyFilters()">
                        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                        </svg>
                        筛选
                    </button>
                    <button class="btn btn-secondary" onclick="resetFilters()">重置</button>
                    <button class="btn btn-success" onclick="exportExcel()">
                        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                        </svg>
                        导出汇总表
                    </button>
                </div>
            </div>
        </div>

        <div class="table-container">
            <div class="table-header">
                <h3>
                    股票列表
                    <span class="date-badge" id="currentDateBadge"></span>
                </h3>
                <span class="result-count" id="resultCount">共 0 条结果</span>
            </div>
            <div class="scroll-wrapper">
                <table>
                    <thead>
                        <tr>
                            <th class="sortable" onclick="sortTable('股票代码')">股票代码</th>
                            <th class="sortable" onclick="sortTable('股票名称')">股票名称</th>
                            <th class="sortable" onclick="sortTable('总市值亿')">总市值(亿)</th>
                            <th>现价</th>
                            <th>涨幅</th>
                            <th>PE(TTM)</th>
                            <th>换手率</th>
                            <th>成交额(万)</th>
                            <th class="sortable" onclick="sortTable('所属行业')">所属行业</th>
                            <th class="sortable" onclick="sortTable('持仓基金数量')">基金数</th>
                            <th>持仓基金公司</th>
                            <th>操作</th>
                        </tr>
                    </thead>
                    <tbody id="stockTable">
                        <tr><td colspan="12" class="loading">加载中</td></tr>
                    </tbody>
                </table>
            </div>
        </div>

        <div class="pagination" id="pagination"></div>
    </div>

    <div class="modal" id="detailModal">
        <div class="modal-content">
            <div class="modal-header">
                <h3 id="modalTitle">持仓明细</h3>
                <div class="modal-header-actions">
                    <button class="btn btn-sm btn-success" onclick="exportDetailExcel()">
                        <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                        </svg>
                        导出明细
                    </button>
                    <button class="close-btn" onclick="closeModal()">×</button>
                </div>
            </div>
            <div class="modal-body">
                <table class="detail-table">
                    <thead>
                        <tr>
                            <th>持仓基金</th>
                            <th>基金公司</th>
                            <th>持仓股数(万股)</th>
                            <th>持仓比例(%)</th>
                            <th>持仓市值(万元)</th>
                        </tr>
                    </thead>
                    <tbody id="detailTable"></tbody>
                </table>
            </div>
        </div>
    </div>

    <div class="modal" id="analyzeModal">
        <div class="modal-content analyze-modal">
            <div class="modal-header">
                <h3 id="analyzeTitle">🤖 AI分析</h3>
                <button class="close-btn" onclick="closeAnalyzeModal()">×</button>
            </div>
            <div class="modal-body" id="analyzeBody">
                <div class="analyze-loading">
                    <div class="spinner"></div>
                    <p>AI正在分析中，请稍候...</p>
                    <p class="analyze-tip">分析通常需要10-30秒</p>
                </div>
            </div>
        </div>
    </div>

    <script>
        let currentData = [];
        let sortField = '总市值亿';
        let sortOrder = 'desc';
        let currentDate = '';
        let currentDetailCode = '';  // 当前查看明细的股票代码
        let currentDetailName = '';  // 当前查看明细的股票名称
        let stockQuotes = {};  // 股票实时行情数据
        let quoteTimer = null;  // 行情刷新定时器
        let currentPage = 1;  // 当前页码
        const pageSize = 100;  // 每页显示条数，减少DOM节点

        document.addEventListener('DOMContentLoaded', async () => {
            await loadDates();
            // 先加载最关键的数据
            await loadSummary();
            // 然后并行加载次要数据
            loadStatistics();
            loadCurrentDate();
            // 延迟加载公司和行业列表（用户可能不会马上用）
            setTimeout(() => {
                loadCompanies();
                loadIndustries();
            }, 100);
        });

        async function loadDates() {
            try {
                const res = await fetch('/api/dates');
                const dates = await res.json();
                const select = document.getElementById('dateSelect');
                select.innerHTML = '';
                const latestOption = document.createElement('option');
                latestOption.value = 'latest';
                latestOption.textContent = '最新数据';
                select.appendChild(latestOption);
                dates.forEach(d => {
                    const opt = document.createElement('option');
                    opt.value = d.date;
                    opt.textContent = d.date;
                    select.appendChild(opt);
                });
                select.value = 'latest';
            } catch (e) {
                console.error('加载日期列表失败', e);
                document.getElementById('dateSelect').innerHTML = '<option value="latest">最新数据</option>';
            }
        }

        async function loadCurrentDate() {
            try {
                const res = await fetch('/api/current-date');
                const data = await res.json();
                currentDate = data.date;
                document.getElementById('updateTime').textContent = '数据更新时间：' + data.updateTime;
                document.getElementById('currentDateBadge').textContent = data.date || '';
            } catch (e) {
                document.getElementById('updateTime').textContent = '数据更新时间：加载失败';
            }
        }

        async function changeDate() {
            const select = document.getElementById('dateSelect');
            const selectedDate = select.value;
            if (selectedDate === 'latest') {
                await fetch('/api/refresh');
            } else if (selectedDate) {
                try {
                    const res = await fetch('/api/date/' + selectedDate);
                    const data = await res.json();
                    if (data.success) {
                        currentDate = data.date;
                        document.getElementById('updateTime').textContent = '数据更新时间：' + data.updateTime;
                        document.getElementById('currentDateBadge').textContent = data.date;
                        await Promise.all([loadStatistics(), loadCompanies(), loadIndustries(), loadSummary()]);
                    }
                } catch (e) {
                    alert('切换日期失败：' + e.message);
                }
            }
        }

        async function loadStatistics() {
            try {
                const res = await fetch('/api/statistics');
                const data = await res.json();
                document.getElementById('totalStocks').textContent = data.totalStocks.toLocaleString();
                document.getElementById('totalMarketCap').textContent = data.totalMarketCap.toFixed(0).toLocaleString();
                document.getElementById('avgMarketCap').textContent = data.avgMarketCap.toFixed(0);
                document.getElementById('currentDateBadge').textContent = data.date || '';
            } catch (e) {
                console.error('加载统计失败', e);
            }
        }

        async function loadCompanies() {
            try {
                const res = await fetch('/api/companies');
                const companies = await res.json();
                const dropdown = document.getElementById('companyFilterDropdown');
                dropdown.innerHTML = '<label class="multi-select-option"><input type="checkbox" value="" onchange="toggleAllCompanies()"> 全部</label>';
                companies.forEach(c => {
                    const label = document.createElement('label');
                    label.className = 'multi-select-option';
                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.value = c;
                    checkbox.onchange = onCompanyChange;
                    label.appendChild(checkbox);
                    label.appendChild(document.createTextNode(' ' + c));
                    dropdown.appendChild(label);
                });
                updateCompanyFilterText();
            } catch (e) {
                console.error('加载公司列表失败', e);
            }
        }

        function toggleCompanyDropdown() {
            const trigger = document.querySelector('.multi-select-trigger');
            const dropdown = document.getElementById('companyFilterDropdown');
            const isOpen = dropdown.classList.contains('show');
            if (isOpen) {
                dropdown.classList.remove('show');
                trigger.classList.remove('active');
            } else {
                dropdown.classList.add('show');
                trigger.classList.add('active');
            }
        }

        function getSelectedCompanies() {
            const dropdown = document.getElementById('companyFilterDropdown');
            if (!dropdown) return [];
            const checkboxes = dropdown.querySelectorAll('input[type="checkbox"]:checked');
            return Array.from(checkboxes).map(cb => cb.value).filter(v => v !== '');
        }

        function toggleAllCompanies() {
            const dropdown = document.getElementById('companyFilterDropdown');
            const allCheckbox = dropdown.querySelector('input[value=""]');
            const otherCheckboxes = dropdown.querySelectorAll('input[type="checkbox"]:not([value=""])');
            otherCheckboxes.forEach(cb => cb.checked = false);
            allCheckbox.checked = true;
            updateCompanyFilterText();
        }

        function updateCompanyFilterText() {
            const selected = getSelectedCompanies();
            const textEl = document.getElementById('companyFilterText');
            const dropdown = document.getElementById('companyFilterDropdown');
            const allCheckbox = dropdown.querySelector('input[value=""]');

            if (selected.length === 0) {
                textEl.textContent = '全部';
                allCheckbox.checked = true;
            } else {
                textEl.textContent = '已选择 ' + selected.length + ' 个';
                allCheckbox.checked = false;
            }
        }

        // 当用户点击非"全部"选项时
        function onCompanyChange() {
            const dropdown = document.getElementById('companyFilterDropdown');
            const allCheckbox = dropdown.querySelector('input[value=""]');
            const selected = getSelectedCompanies();
            // 如果有选中的公司，取消"全部"的勾选
            if (selected.length > 0) {
                allCheckbox.checked = false;
            } else {
                allCheckbox.checked = true;
            }
            updateCompanyFilterText();
        }

        // 点击下拉项时不关闭下拉框（允许选择多个）
        document.getElementById('companyFilterDropdown').addEventListener('click', function(e) {
            e.stopPropagation();
        });

        async function loadIndustries() {
            try {
                const res = await fetch('/api/industries');
                const industries = await res.json();
                const select = document.getElementById('industryFilter');
                const currentValue = select.value;
                select.innerHTML = '<option value="">全部</option>';
                industries.forEach(i => {
                    const opt = document.createElement('option');
                    opt.value = i;
                    opt.textContent = i;
                    select.appendChild(opt);
                });
                select.value = currentValue;
            } catch (e) {
                console.error('加载行业列表失败', e);
            }
        }

        async function loadSummary() {
            const params = new URLSearchParams();
            const companies = getSelectedCompanies();
            companies.forEach(c => params.append('company', c));
            const minCap = document.getElementById('minCapFilter').value;
            const maxCap = document.getElementById('maxCapFilter').value;
            const industry = document.getElementById('industryFilter').value;
            const keyword = document.getElementById('keywordFilter').value;
            if (minCap) params.append('minCap', minCap);
            if (maxCap) params.append('maxCap', maxCap);
            if (industry) params.append('industry', industry);
            if (keyword) params.append('keyword', keyword);
            try {
                // 使用轻量级API减少数据传输
                const res = await fetch('/api/summary/light?' + params.toString());
                currentData = await res.json();
                renderTable();
                // 启动实时行情刷新
                startQuoteRefresh();
            } catch (e) {
                document.getElementById('stockTable').innerHTML = '<tr><td colspan="9" class="no-data">加载数据失败，请刷新重试</td></tr>';
            }
        }

        // 判断是否在交易时间（A股：9:00-11:30, 13:00-15:00 工作日）
        function isTradingTime() {
            const now = new Date();
            const day = now.getDay();
            // 周末不交易
            if (day === 0 || day === 6) return false;

            const hours = now.getHours();
            const minutes = now.getMinutes();
            const timeNum = hours * 100 + minutes;

            // 上午 9:00-11:30，下午 13:00-15:00
            return (timeNum >= 900 && timeNum <= 1130) || (timeNum >= 1300 && timeNum <= 1500);
        }

        // 启动实时行情刷新（优化：只在交易时间刷新当前页）
        function startQuoteRefresh() {
            // 清除旧的定时器
            if (quoteTimer) {
                clearInterval(quoteTimer);
            }

            // 判断是否在交易时间
            if (isTradingTime()) {
                // 盘中：每1秒刷新一次当前页行情
                quoteTimer = setInterval(() => {
                    if (currentData.length === 0) return;
                    const startIndex = (currentPage - 1) * pageSize;
                    const sorted = [...currentData].sort((a, b) => {
                        let aVal = a[sortField];
                        let bVal = b[sortField];
                        if (typeof aVal === 'number') return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
                        return sortOrder === 'asc' ? String(aVal).localeCompare(String(bVal)) : String(bVal).localeCompare(String(aVal));
                    });
                    const pageData = sorted.slice(startIndex, startIndex + pageSize);
                    fetchPageQuotes(pageData);
                }, 1000);
            }
        }

        // 获取当前页股票实时行情
        function fetchPageQuotes(pageData) {
            if (!pageData || pageData.length === 0) return;

            const codes = pageData.map(s => s.股票代码);
            const codeList = codes.map(code => {
                if (code.startsWith('6')) {
                    return 'sh' + code;
                } else {
                    return 'sz' + code;
                }
            });

            // 单批请求当前页（最多100条）
            const url = 'https://qt.gtimg.cn/q=' + codeList.join(',');
            fetch(url)
                .then(response => response.text())
                .then(text => parseQuoteResponse(text, codes))
                .then(() => updateQuoteDisplay())
                .catch(e => console.error('获取行情失败:', e));
        }

        // 解析腾讯行情接口返回
        function parseQuoteResponse(text, originalCodes) {
            const lines = text.trim().split('\\n');
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (!line || line.indexOf('~') < 0) continue;

                // 解析格式: v_sh600519="1~贵州茅台~600519~价格~..." 或直接 "1~贵州茅台~600519~价格~..."
                let quoteData = line;
                if (line.startsWith('v_')) {
                    // 提取等号后面的内容
                    const eqIdx = line.indexOf('=');
                    if (eqIdx > 0) {
                        quoteData = line.substring(eqIdx + 1).replace(/^"|"$/g, '');
                    }
                }

                const parts = quoteData.split('~');
                if (parts.length >= 46) {
                    const code = parts[2]; // 股票代码在第三个字段
                    if (!code) continue;

                    const price = parseFloat(parts[3]); // 当前价格
                    const changePercent = parseFloat(parts[32]); // 涨跌幅
                    const marketCap = parseFloat(parts[45]); // 总市值（亿）
                    const pe = parseFloat(parts[39]); // PE(市盈率)
                    const turnoverRate = parseFloat(parts[38]); // 换手率
                    const high52w = parseFloat(parts[42]); // 52周最高
                    const low52w = parseFloat(parts[43]); // 52周最低
                    const volume = parseFloat(parts[6]); // 成交量（手）
                    const amount = parseFloat(parts[37]); // 成交额（万）

                    if (!isNaN(price) && price > 0) {
                        stockQuotes[code] = {
                            price: price,
                            changePercent: isNaN(changePercent) ? 0 : changePercent,
                            marketCap: isNaN(marketCap) ? null : marketCap,
                            pe: isNaN(pe) ? null : pe,
                            turnoverRate: isNaN(turnoverRate) ? null : turnoverRate,
                            high52w: isNaN(high52w) ? null : high52w,
                            low52w: isNaN(low52w) ? null : low52w,
                            volume: isNaN(volume) ? null : volume,
                            amount: isNaN(amount) ? null : amount
                        };
                    }
                }
            }
        }

        // 更新表格中的行情显示
        function updateQuoteDisplay() {
            for (const code in stockQuotes) {
                const quote = stockQuotes[code];
                const priceEl = document.getElementById('price-' + code);
                const changeEl = document.getElementById('change-' + code);
                const capEl = document.getElementById('cap-' + code);
                const peEl = document.getElementById('pe-' + code);
                const turnoverEl = document.getElementById('turnover-' + code);
                const amountEl = document.getElementById('amount-' + code);

                if (priceEl) {
                    priceEl.textContent = quote.price.toFixed(2);
                }
                if (changeEl) {
                    const change = quote.changePercent;
                    changeEl.textContent = (change >= 0 ? '+' : '') + change.toFixed(2) + '%';
                    // 设置颜色
                    if (change > 0) {
                        changeEl.className = 'stock-change up';
                    } else if (change < 0) {
                        changeEl.className = 'stock-change down';
                    } else {
                        changeEl.className = 'stock-change';
                    }
                }
                if (capEl && quote.marketCap !== null && quote.marketCap > 0) {
                    capEl.textContent = quote.marketCap.toFixed(0).toLocaleString();
                }
                if (peEl) {
                    peEl.textContent = quote.pe !== null && quote.pe > 0 ? quote.pe.toFixed(2) : '-';
                }
                if (turnoverEl) {
                    turnoverEl.textContent = quote.turnoverRate !== null && quote.turnoverRate > 0 ? quote.turnoverRate.toFixed(2) + '%' : '-';
                }
                if (amountEl) {
                    amountEl.textContent = quote.amount !== null && quote.amount > 0 ? quote.amount.toFixed(0).toLocaleString() : '-';
                }
            }
        }

        function renderTable() {
            const sorted = [...currentData].sort((a, b) => {
                let aVal, bVal;

                // 处理市值字段（可能被实时更新）
                if (sortField === '总市值亿') {
                    aVal = a.总市值亿;
                    bVal = b.总市值亿;
                    return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
                }

                aVal = a[sortField];
                bVal = b[sortField];
                if (typeof aVal === 'number') return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
                return sortOrder === 'asc' ? String(aVal).localeCompare(String(bVal)) : String(bVal).localeCompare(String(aVal));
            });

            document.getElementById('resultCount').textContent = '共 ' + sorted.length + ' 条结果';

            if (sorted.length === 0) {
                document.getElementById('stockTable').innerHTML = '<tr><td colspan="12" class="no-data">没有符合条件的数据</td></tr>';
                document.getElementById('pagination').innerHTML = '';
                return;
            }

            // 分页渲染
            const totalPages = Math.ceil(sorted.length / pageSize);
            if (currentPage > totalPages) currentPage = totalPages;
            if (currentPage < 1) currentPage = 1;

            const startIndex = (currentPage - 1) * pageSize;
            const endIndex = Math.min(startIndex + pageSize, sorted.length);
            const pageData = sorted.slice(startIndex, endIndex);

            const html = pageData.map(stock => {
                const companies = stock.持仓基金公司.split('、');
                const companyTags = companies.map((c, idx) => {
                    const colorClass = getCompanyColorClass(c);
                    // 前6个标签默认显示，其余隐藏
                    const hiddenClass = idx >= 6 ? ' hidden-tag' : '';
                    return '<span class="company-tag ' + colorClass + hiddenClass + '">' + c + '</span>';
                }).join('');
                const showMoreBtn = companies.length > 6
                    ? '<button class="show-more-btn" data-count="' + (companies.length - 6) + '" onclick="toggleCompanyTags(this)">+' + (companies.length - 6) + '</button>'
                    : '';
                return '<tr>' +
                    '<td class="stock-code">' + stock.股票代码 + '</td>' +
                    '<td class="stock-name">' + stock.股票名称 + '</td>' +
                    '<td class="market-cap" id="cap-' + stock.股票代码 + '">' + stock.总市值亿.toFixed(0).toLocaleString() + '</td>' +
                    '<td class="stock-price" id="price-' + stock.股票代码 + '">-</td>' +
                    '<td class="stock-change" id="change-' + stock.股票代码 + '">-</td>' +
                    '<td class="stock-pe" id="pe-' + stock.股票代码 + '">-</td>' +
                    '<td class="stock-turnover" id="turnover-' + stock.股票代码 + '">-</td>' +
                    '<td class="stock-amount" id="amount-' + stock.股票代码 + '">-</td>' +
                    '<td>' + (stock.所属行业 || '-') + '</td>' +
                    '<td><span class="fund-count">' + stock.持仓基金数量 + '</span></td>' +
                    '<td class="company-tags-cell"><div class="company-tags-wrapper">' + companyTags + '</div>' + showMoreBtn + '</td>' +
                    '<td class="action-cell"><div class="action-btns">' +
                        '<button class="detail-btn" onclick="showDetail(\\'' + stock.股票代码 + '\\', \\'' + stock.股票名称 + '\\')">明细</button>' +
                        '<button class="analyze-btn" onclick="startAnalyze(\\'' + stock.股票代码 + '\\', \\'' + stock.股票名称 + '\\')">🤖 AI分析</button>' +
                    '</div></td>' +
                    '</tr>';
            }).join('');
            document.getElementById('stockTable').innerHTML = html;

            // 渲染分页控件
            renderPagination(sorted.length, totalPages);

            // 只获取当前页的行情数据
            fetchPageQuotes(pageData);
        }

        // 渲染分页控件
        function renderPagination(total, totalPages) {
            let html = '';
            html += '<button class="page-btn" onclick="goToPage(1)" ' + (currentPage === 1 ? 'disabled' : '') + '>首页</button>';
            html += '<button class="page-btn" onclick="goToPage(' + (currentPage - 1) + ')" ' + (currentPage === 1 ? 'disabled' : '') + '>上一页</button>';

            // 显示页码范围
            let startPage = Math.max(1, currentPage - 2);
            let endPage = Math.min(totalPages, currentPage + 2);

            if (startPage > 1) html += '<span class="page-ellipsis">...</span>';

            for (let i = startPage; i <= endPage; i++) {
                html += '<button class="page-btn ' + (i === currentPage ? 'active' : '') + '" onclick="goToPage(' + i + ')">' + i + '</button>';
            }

            if (endPage < totalPages) html += '<span class="page-ellipsis">...</span>';

            html += '<button class="page-btn" onclick="goToPage(' + (currentPage + 1) + ')" ' + (currentPage === totalPages ? 'disabled' : '') + '>下一页</button>';
            html += '<button class="page-btn" onclick="goToPage(' + totalPages + ')" ' + (currentPage === totalPages ? 'disabled' : '') + '>末页</button>';
            html += '<span class="page-info">第 ' + currentPage + '/' + totalPages + ' 页</span>';

            document.getElementById('pagination').innerHTML = html;
        }

        // 跳转到指定页
        function goToPage(page) {
            currentPage = page;
            renderTable();
            // 滚动到表格顶部
            document.querySelector('.table-container').scrollIntoView({ behavior: 'smooth' });
        }

        // 展开/收起基金公司标签
        function toggleCompanyTags(btn) {
            const cell = btn.parentElement;
            const wrapper = cell.querySelector('.company-tags-wrapper');
            const isExpanded = btn.classList.contains('expanded');
            const hiddenCount = parseInt(btn.getAttribute('data-count')) || 0;

            if (isExpanded) {
                // 收起
                btn.textContent = '+' + hiddenCount;
                btn.classList.remove('expanded');
                wrapper.classList.remove('expanded');
            } else {
                // 展开
                btn.textContent = '收起';
                btn.classList.add('expanded');
                wrapper.classList.add('expanded');
            }
        }

        // 基金公司颜色映射
        function getCompanyColorClass(company) {
            const colorMap = {
                // 头部公募 - 蓝色系
                '华夏基金': 'blue',
                '易方达基金': 'orange',
                '南方基金': 'red',
                '嘉实基金': 'purple',
                '广发基金': 'green',
                '博时基金': 'teal',
                '富国基金': 'indigo',
                '招商基金': 'cyan',
                '汇添富基金': 'pink',
                '鹏华基金': 'amber',
                // 银行系公募 - 绿色系
                '工银瑞信基金': 'emerald',
                '建信基金': 'lime',
                '中银基金': 'sky',
                '交银施罗德基金': 'violet',
                '农银汇理基金': 'fuchsia',
                '民生加银基金': 'rose',
                '永赢基金': 'slate',
                // 其他大型公募
                '银华基金': 'blue',
                '国泰基金': 'orange',
                '华安基金': 'red',
                '兴证全球基金': 'purple',
                '景顺长城基金': 'green',
                '上投摩根基金': 'teal',
                '摩根基金': 'teal',
                '华宝基金': 'indigo',
                '华泰柏瑞基金': 'cyan',
                '中欧基金': 'pink',
                '东方基金': 'amber',
                '平安基金': 'emerald',
                '长城基金': 'lime',
                '融通基金': 'sky',
                '诺安基金': 'violet',
                '海富通基金': 'fuchsia',
                '万家基金': 'rose',
                '天弘基金': 'slate',
                '大成基金': 'blue',
                '中信保诚基金': 'orange',
                '光大保德信基金': 'red',
                '泓德基金': 'purple',
                '中庚基金': 'green',
                '东吴基金': 'teal',
                '国投瑞银基金': 'indigo',
                '华商基金': 'cyan',
                '金鹰基金': 'pink',
                '财通基金': 'amber',
                '浙商基金': 'emerald',
                '前海开源基金': 'lime',
                '银河基金': 'sky',
                '国联安基金': 'violet',
                '申万菱信基金': 'fuchsia',
                '宝盈基金': 'rose',
                '长盛基金': 'slate',
                // 私募基金 - 特殊颜色
                '景林资产': 'jinglin',
                '高毅资产': 'jinglin',
                '淡水泉投资': 'jinglin',
                '重阳投资': 'jinglin',
                '千合资本': 'jinglin',
                '和王投资': 'jinglin',
                '幻方量化': 'jinglin',
                '九坤投资': 'jinglin',
                '明汯投资': 'jinglin',
                '灵均投资': 'jinglin',
                '衍复投资': 'jinglin',
                '希瓦资产': 'jinglin',
                '林园投资': 'jinglin',
                '东方港湾': 'jinglin',
                '汉和资本': 'jinglin',
                '源乐晟资产': 'jinglin',
                '朱雀基金': 'jinglin',
                '星石投资': 'jinglin',
            };
            // 检查是否包含关键词
            for (const [key, value] of Object.entries(colorMap)) {
                if (company.includes(key) || key.includes(company)) {
                    return value;
                }
            }
            // 默认颜色
            return 'default';
        }

        function sortTable(field) {
            if (sortField === field) {
                sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
            } else {
                sortField = field;
                sortOrder = 'desc';
            }
            currentPage = 1;  // 排序后回到第一页
            renderTable();
        }

        function applyFilters() {
            currentPage = 1;  // 筛选后回到第一页
            loadSummary();
        }
        function resetFilters() {
            // Reset company filter
            const dropdown = document.getElementById('companyFilterDropdown');
            const allCheckbox = dropdown.querySelector('input[value=""]');
            const otherCheckboxes = dropdown.querySelectorAll('input[type="checkbox"]:not([value=""])');
            otherCheckboxes.forEach(cb => cb.checked = false);
            allCheckbox.checked = true;
            updateCompanyFilterText();

            document.getElementById('minCapFilter').value = '';
            document.getElementById('maxCapFilter').value = '';
            document.getElementById('industryFilter').value = '';
            document.getElementById('keywordFilter').value = '';
            loadSummary();
        }

        async function showDetail(code, name) {
            currentDetailCode = code;
            currentDetailName = name;
            try {
                const res = await fetch('/api/detail?code=' + code);
                const data = await res.json();
                document.getElementById('modalTitle').textContent = name + ' (' + code + ') 持仓明细';
                const html = data.map(d => {
                    const colorClass = getCompanyColorClass(d.基金公司);
                    return '<tr>' +
                        '<td>' + d.持仓基金 + '</td>' +
                        '<td><span class="company-tag ' + colorClass + '">' + d.基金公司 + '</span></td>' +
                        '<td>' + d.持仓股数万股 + '</td>' +
                        '<td>' + d.持仓比例 + '</td>' +
                        '<td>' + d.持仓市值万元 + '</td>' +
                        '</tr>';
                }).join('');
                document.getElementById('detailTable').innerHTML = html;
                document.getElementById('detailModal').classList.add('active');
            } catch (e) {
                alert('加载明细失败');
            }
        }

        function closeModal() {
            document.getElementById('detailModal').classList.remove('active');
        }

        let analyzeInterval = null;
        async function startAnalyze(code, name) {
            document.getElementById('analyzeTitle').textContent = '🤖 AI分析 - ' + name + ' (' + code + ')';
            document.getElementById('analyzeBody').innerHTML = '<div class="analyze-loading"><div class="spinner"></div><p>AI正在分析中，请稍候...</p><p class="analyze-tip">分析通常需要10-30秒</p></div>';
            document.getElementById('analyzeModal').classList.add('active');

            try {
                const res = await fetch('/api/analyze/' + code, { method: 'POST' });
                const data = await res.json();

                if (data.success && data.analysisId) {
                    // 轮询检查分析状态
                    analyzeInterval = setInterval(async () => {
                        try {
                            const statusRes = await fetch('/api/analysis/' + data.analysisId);
                            const analysis = await statusRes.json();
                            if (analysis.status === 'completed') {
                                clearInterval(analyzeInterval);
                                window.location.href = '/analysis/' + data.analysisId;
                            } else if (analysis.status === 'failed') {
                                clearInterval(analyzeInterval);
                                document.getElementById('analyzeBody').innerHTML = '<div class="analyze-error"><p>❌ 分析失败</p><p>' + (analysis.error || '未知错误') + '</p></div>';
                            }
                        } catch (e) {
                            clearInterval(analyzeInterval);
                            document.getElementById('analyzeBody').innerHTML = '<div class="analyze-error"><p>❌ 检查状态失败</p></div>';
                        }
                    }, 2000);
                } else {
                    document.getElementById('analyzeBody').innerHTML = '<div class="analyze-error"><p>❌ 创建分析任务失败</p></div>';
                }
            } catch (e) {
                document.getElementById('analyzeBody').innerHTML = '<div class="analyze-error"><p>❌ 请求失败</p><p>' + e.message + '</p></div>';
            }
        }

        function closeAnalyzeModal() {
            if (analyzeInterval) clearInterval(analyzeInterval);
            document.getElementById('analyzeModal').classList.remove('active');
        }

        function exportExcel() {
            const params = new URLSearchParams();
            const dateSelect = document.getElementById('dateSelect');
            const selectedDate = dateSelect.value;
            if (selectedDate && selectedDate !== 'latest') {
                params.append('date', selectedDate);
            }
            // 添加筛选参数
            const companies = getSelectedCompanies();
            companies.forEach(c => params.append('company', c));
            const minCap = document.getElementById('minCapFilter').value;
            const maxCap = document.getElementById('maxCapFilter').value;
            const industry = document.getElementById('industryFilter').value;
            const keyword = document.getElementById('keywordFilter').value;
            if (minCap) params.append('minCap', minCap);
            if (maxCap) params.append('maxCap', maxCap);
            if (industry) params.append('industry', industry);
            if (keyword) params.append('keyword', keyword);

            window.location.href = '/api/export?' + params.toString();
        }

        function exportDetailExcel() {
            if (!currentDetailCode) {
                alert('请先选择要导出的股票');
                return;
            }
            const params = new URLSearchParams();
            const dateSelect = document.getElementById('dateSelect');
            const selectedDate = dateSelect.value;
            if (selectedDate && selectedDate !== 'latest') {
                params.append('date', selectedDate);
            }
            params.append('code', currentDetailCode);
            params.append('name', currentDetailName);

            window.location.href = '/api/export/detail?' + params.toString();
        }

        document.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') applyFilters();
        });

        document.getElementById('detailModal').addEventListener('click', function(e) {
            if (e.target === this) closeModal();
        });

        document.getElementById('analyzeModal').addEventListener('click', function(e) {
            if (e.target === this) closeAnalyzeModal();
        });

        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                closeModal();
                closeAnalyzeModal();
                // Close company dropdown
                const dropdown = document.getElementById('companyFilterDropdown');
                const trigger = document.querySelector('.multi-select-trigger');
                if (dropdown && trigger) {
                    dropdown.classList.remove('show');
                    trigger.classList.remove('active');
                }
            }
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', function(e) {
            const container = document.getElementById('companyFilterContainer');
            const dropdown = document.getElementById('companyFilterDropdown');
            const trigger = document.querySelector('.multi-select-trigger');
            if (container && dropdown && trigger && !container.contains(e.target)) {
                dropdown.classList.remove('show');
                trigger.classList.remove('active');
            }
        });
    </script>
</body>
</html>`;
  }

  // 生成分析列表页
  private generateAnalysesPage(): string {
    const analyses = this.aiAnalysisService.getAllAnalyses();

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI分析报告 - 股票筛选平台</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        ${this.getCommonStyles()}
        .analyses-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
            gap: 20px;
        }
        .analysis-card {
            background: var(--bg-card);
            border-radius: var(--radius-lg);
            padding: 24px;
            border: 1px solid var(--border);
            transition: all 0.3s ease;
            cursor: pointer;
        }
        .analysis-card:hover {
            transform: translateY(-4px);
            box-shadow: var(--shadow-lg);
            border-color: var(--primary);
        }
        .analysis-card-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 16px;
        }
        .analysis-card-title {
            font-size: 18px;
            font-weight: 600;
            color: var(--text-primary);
        }
        .analysis-card-code {
            font-size: 14px;
            color: var(--primary-light);
            font-family: monospace;
        }
        .analysis-card-status {
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 500;
        }
        .status-completed {
            background: rgba(16, 185, 129, 0.2);
            color: #4ade80;
        }
        .status-pending {
            background: rgba(245, 158, 11, 0.2);
            color: #fbbf24;
        }
        .status-failed {
            background: rgba(239, 68, 68, 0.2);
            color: #f87171;
        }
        .analysis-card-meta {
            display: flex;
            gap: 16px;
            color: var(--text-secondary);
            font-size: 13px;
            margin-bottom: 12px;
        }
        .analysis-card-summary {
            color: var(--text-secondary);
            font-size: 14px;
            line-height: 1.6;
            display: -webkit-box;
            -webkit-line-clamp: 3;
            -webkit-box-orient: vertical;
            overflow: hidden;
        }
        .analysis-card-footer {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-top: 16px;
            padding-top: 16px;
            border-top: 1px solid var(--border);
        }
        .analysis-recommendation {
            padding: 6px 14px;
            border-radius: 20px;
            font-size: 13px;
            font-weight: 500;
        }
        .rec-强烈推荐 { background: rgba(16, 185, 129, 0.2); color: #4ade80; }
        .rec-推荐 { background: rgba(14, 165, 233, 0.2); color: #38bdf8; }
        .rec-中性 { background: rgba(245, 158, 11, 0.2); color: #fbbf24; }
        .rec-谨慎 { background: rgba(249, 115, 22, 0.2); color: #fb923c; }
        .rec-回避 { background: rgba(239, 68, 68, 0.2); color: #f87171; }
        .empty-state {
            text-align: center;
            padding: 80px 20px;
            color: var(--text-secondary);
        }
        .empty-state-icon {
            font-size: 64px;
            margin-bottom: 20px;
        }
        .empty-state-title {
            font-size: 20px;
            font-weight: 600;
            margin-bottom: 8px;
            color: var(--text-primary);
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="header-content">
                <div class="header-left">
                    <h1>🤖 AI分析报告</h1>
                    <div class="nav-links">
                        <a href="/" class="nav-link">📊 数据列表</a>
                        <a href="/strategies" class="nav-link">💡 投资策略</a>
                        <a href="/analyses" class="nav-link active">🤖 AI分析</a>
                    </div>
                </div>
                <div class="header-right">
                    <p class="subtitle">查看所有股票的AI投资分析报告</p>
                </div>
            </div>
        </div>

        <div class="table-container">
            <div class="table-header">
                <h3>分析报告列表</h3>
                <span class="result-count">共 ${analyses.length} 份报告</span>
            </div>
            <div style="padding: 24px;">
                ${analyses.length > 0 ? `
                <div class="analyses-grid">
                    ${analyses.map(a => `
                    <div class="analysis-card" onclick="window.location.href='/analysis/${a.id}'">
                        <div class="analysis-card-header">
                            <div>
                                <div class="analysis-card-title">${a.stockName}</div>
                                <div class="analysis-card-code">${a.stockCode}</div>
                            </div>
                            <span class="analysis-card-status status-${a.status}">${
                                a.status === 'completed' ? '已完成' : a.status === 'pending' ? '分析中' : '失败'
                            }</span>
                        </div>
                        <div class="analysis-card-meta">
                            <span>📅 ${a.date}</span>
                            <span>🕐 ${new Date(a.createdAt).toLocaleString('zh-CN')}</span>
                        </div>
                        ${a.analysis ? `
                        <div class="analysis-card-summary">${a.analysis.summary}</div>
                        <div class="analysis-card-footer">
                            <span class="analysis-recommendation rec-${a.analysis.recommendation}">${a.analysis.recommendation}</span>
                            <span style="color: var(--text-muted); font-size: 13px;">点击查看详情 →</span>
                        </div>
                        ` : a.error ? `
                        <div class="analysis-card-summary" style="color: #f87171;">❌ ${a.error}</div>
                        ` : `
                        <div class="analysis-card-summary">分析进行中...</div>
                        `}
                    </div>
                    `).join('')}
                </div>
                ` : `
                <div class="empty-state">
                    <div class="empty-state-icon">📊</div>
                    <div class="empty-state-title">暂无分析报告</div>
                    <p>请从股票列表中选择股票进行AI分析</p>
                    <a href="/" class="btn btn-primary" style="margin-top: 20px; display: inline-block;">前往股票列表</a>
                </div>
                `}
            </div>
        </div>
    </div>
</body>
</html>`;
  }

  // 生成投资策略页
  private generateStrategiesPage(): string {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>投资策略 - 股票筛选平台</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        ${this.getCommonStyles()}

        .strategy-tabs {
            display: flex;
            gap: 8px;
            margin-bottom: 24px;
            flex-wrap: wrap;
            align-items: center;
        }
        .strategy-tab {
            padding: 12px 24px;
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: var(--radius);
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
            color: var(--text-secondary);
        }
        .strategy-tab:hover {
            border-color: var(--primary);
            color: var(--primary);
        }
        .strategy-tab.active {
            background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%);
            color: white;
            border-color: var(--primary);
        }
        .strategy-tabs .date-selector {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-left: auto;
        }
        .strategy-tabs .date-selector select {
            padding: 8px 12px;
            border: 1px solid var(--border);
            border-radius: var(--radius);
            background: var(--bg-card);
            color: var(--text-primary);
            font-size: 14px;
            cursor: pointer;
        }
        .strategy-tabs .date-selector select:focus {
            outline: none;
            border-color: var(--primary);
        }
        .strategy-desc {
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: var(--radius-lg);
            padding: 20px;
            margin-bottom: 24px;
        }
        .strategy-desc h3 {
            font-size: 16px;
            font-weight: 600;
            color: var(--text-primary);
            margin-bottom: 8px;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .strategy-desc p {
            color: var(--text-secondary);
            font-size: 14px;
            line-height: 1.6;
        }
        .strategy-table-container {
            background: var(--bg-card);
            border-radius: var(--radius-lg);
            overflow: hidden;
            border: 1px solid var(--border);
        }
        .strategy-table {
            width: 100%;
            border-collapse: collapse;
        }
        .strategy-table th, .strategy-table td {
            padding: 14px 16px;
            text-align: left;
            border-bottom: 1px solid var(--border);
            vertical-align: middle;
        }
        .strategy-table th {
            background: var(--bg-secondary);
            font-weight: 600;
            color: var(--text-secondary);
            font-size: 13px;
            position: sticky;
            top: 0;
        }
        .strategy-table tr:hover {
            background: var(--bg-card-hover);
        }
        .rank-badge {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 28px;
            height: 28px;
            border-radius: 50%;
            font-size: 13px;
            font-weight: 600;
        }
        .rank-1 { background: linear-gradient(135deg, #ffd700, #ffb700); color: #000; }
        .rank-2 { background: linear-gradient(135deg, #c0c0c0, #a0a0a0); color: #000; }
        .rank-3 { background: linear-gradient(135deg, #cd7f32, #b5651d); color: #fff; }
        .rank-other { background: var(--bg-secondary); color: var(--text-secondary); }
        .tag {
            display: inline-flex;
            align-items: center;
            padding: 3px 8px;
            border-radius: 10px;
            font-size: 11px;
            font-weight: 500;
            margin-right: 4px;
            margin-bottom: 4px;
        }
        .tag-hot { background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); }
        .tag-focus { background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3); }
        .tag-potential { background: rgba(99, 102, 241, 0.15); color: #818cf8; border: 1px solid rgba(99, 102, 241, 0.3); }
        .tag-consensus { background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); }
        .tag-heavy { background: rgba(236, 72, 153, 0.15); color: #f472b6; border: 1px solid rgba(236, 72, 153, 0.3); }
        .tag-leader { background: rgba(139, 92, 246, 0.15); color: #a78bfa; border: 1px solid rgba(139, 92, 246, 0.3); }
        .score-bar {
            width: 100px;
            height: 6px;
            background: var(--bg-secondary);
            border-radius: 3px;
            overflow: hidden;
        }
        .score-bar-fill {
            height: 100%;
            border-radius: 3px;
            transition: width 0.3s;
        }
        .score-high { background: linear-gradient(90deg, #34d399, #10b981); }
        .score-medium { background: linear-gradient(90deg, #fbbf24, #f59e0b); }
        .score-low { background: linear-gradient(90deg, #f87171, #ef4444); }
        .cap-tag {
            padding: 2px 8px;
            border-radius: 8px;
            font-size: 11px;
            font-weight: 500;
        }
        .cap-super { background: rgba(139, 92, 246, 0.15); color: #a78bfa; }
        .cap-large { background: rgba(59, 130, 246, 0.15); color: #60a5fa; }
        .cap-medium { background: rgba(34, 197, 94, 0.15); color: #4ade80; }
        .cap-small { background: rgba(245, 158, 11, 0.15); color: #fbbf24; }
        .loading-state {
            text-align: center;
            padding: 60px;
            color: var(--text-secondary);
        }
        @media (max-width: 768px) {
            .strategy-tabs {
                overflow-x: auto;
                flex-wrap: wrap;
            }
            .strategy-tabs .date-selector {
                margin-left: 0;
                width: 100%;
                margin-top: 8px;
            }
            .strategy-table th, .strategy-table td {
                padding: 10px 8px;
                font-size: 13px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <header class="header">
            <div class="header-left">
                <h1 class="logo">📈 股票筛选平台</h1>
                <nav class="nav">
                    <a href="/" class="nav-link">📊 数据列表</a>
                    <a href="/strategies" class="nav-link active">💡 投资策略</a>
                    <a href="/analyses" class="nav-link">🤖 AI分析</a>
                </nav>
            </div>
        </header>

        <div class="strategy-header">
            <div class="strategy-tabs" id="strategyTabs">
                <button class="strategy-tab active" data-strategy="consensus" onclick="switchStrategy('consensus')">
                    🎯 共识度策略
                </button>
                <button class="strategy-tab" data-strategy="concentration" onclick="switchStrategy('concentration')">
                    📊 持仓集中度
                </button>
            <button class="strategy-tab" data-strategy="coverage" onclick="switchStrategy('coverage')">
                🔥 机构覆盖度
            </button>
            <button class="strategy-tab" data-strategy="leader" onclick="switchStrategy('leader')">
                🏆 行业龙头
            </button>
            <button class="strategy-tab" data-strategy="marketcap" onclick="switchStrategy('marketcap')">
                💰 市值因子
            </button>
            <div class="date-selector" style="margin-left: auto;">
                <label for="dateSelect">📅</label>
                <select id="dateSelect" onchange="loadData()">
                    <option value="">加载中...</option>
                </select>
            </div>
        </div>

        <div class="strategy-desc" id="strategyDesc">
            <h3>🎯 共识度策略</h3>
            <p>计算公式：持仓基金数量 × 基金公司数量。多家基金公司共同看好的股票，市场共识强，投资价值相对较高。</p>
        </div>

        <div class="table-container" style="max-height: calc(100vh - 320px); overflow: auto;">
            <table class="strategy-table">
                <thead id="tableHead">
                </thead>
                <tbody id="tableBody">
                    <tr><td colspan="8" class="loading-state">加载中...</td></tr>
                </tbody>
            </table>
        </div>
    </div>

    <script>
        let currentData = [];
        let currentStrategy = 'consensus';

        const strategyConfigs = {
            consensus: {
                title: '🎯 共识度策略',
                desc: '计算公式：持仓基金数量 × 基金公司数量。多家基金公司共同看好的股票，市场共识强，投资价值相对较高。',
                columns: ['排名', '股票代码', '股票名称', '市值(亿)', '行业', '基金数', '公司数', '共识度得分', '标签'],
                sortField: 'consensusScore',
                sortOrder: 'desc'
            },
            concentration: {
                title: '📊 持仓集中度策略',
                desc: '计算公式：持仓比例合计 / 持仓基金数量 = 平均每只基金持仓比例。数值越高表示基金重仓持有，信心更强。',
                columns: ['排名', '股票代码', '股票名称', '市值(亿)', '行业', '基金数', '平均持仓比例', '集中度评级', '标签'],
                sortField: 'avgHoldingRatio',
                sortOrder: 'desc'
            },
            coverage: {
                title: '🔥 机构覆盖度策略',
                desc: '根据持仓基金数量分级：50+只为热门股，20-50只为关注股，10-20只为潜力股，10以下为冷门股。',
                columns: ['排名', '股票代码', '股票名称', '市值(亿)', '行业', '基金数', '公司数', '覆盖等级', '标签'],
                sortField: 'fundCount',
                sortOrder: 'desc'
            },
            leader: {
                title: '🏆 行业龙头策略',
                desc: '按行业分组，在各自行业内按持仓市值排序，TOP3标记为行业龙头。适合寻找各赛道的领军标的。',
                columns: ['排名', '股票代码', '股票名称', '行业', '市值(亿)', '基金数', '行业排名', '持仓市值(万)', '标签'],
                sortField: 'industryRank',
                sortOrder: 'asc'
            },
            marketcap: {
                title: '💰 市值因子策略',
                desc: '按市值分级：超大盘(>2000亿)、大盘(500-2000亿)、中盘(100-500亿)、小盘(<100亿)。分析不同市值区间的机构偏好。',
                columns: ['排名', '股票代码', '股票名称', '市值(亿)', '市值等级', '基金数', '公司数', '共识度得分', '标签'],
                sortField: 'marketCap',
                sortOrder: 'desc'
            }
        };

        document.addEventListener('DOMContentLoaded', async () => {
            await loadDates();
            await loadData();
        });

        async function loadDates() {
            try {
                const res = await fetch('/api/dates');
                const dates = await res.json();
                const select = document.getElementById('dateSelect');
                select.innerHTML = '<option value="latest">最新数据</option>';
                dates.forEach(d => {
                    const opt = document.createElement('option');
                    opt.value = d.date;
                    opt.textContent = d.date;
                    select.appendChild(opt);
                });
            } catch (e) {
                console.error('加载日期列表失败', e);
            }
        }

        async function loadData() {
            const dateSelect = document.getElementById('dateSelect');
            const date = dateSelect.value === 'latest' ? '' : dateSelect.value;
            const url = '/api/strategies' + (date ? '?date=' + date : '');

            try {
                const res = await fetch(url);
                currentData = await res.json();
                renderTable();
            } catch (e) {
                console.error('加载数据失败', e);
                document.getElementById('tableBody').innerHTML = '<tr><td colspan="8" class="loading-state">加载失败</td></tr>';
            }
        }

        function switchStrategy(strategy) {
            currentStrategy = strategy;
            document.querySelectorAll('.strategy-tab').forEach(tab => {
                tab.classList.toggle('active', tab.dataset.strategy === strategy);
            });
            const config = strategyConfigs[strategy];
            document.getElementById('strategyDesc').innerHTML = '<h3>' + config.title + '</h3><p>' + config.desc + '</p>';
            renderTable();
        }

        function renderTable() {
            const config = strategyConfigs[currentStrategy];
            let data = [...currentData];

            // 计算各项指标
            data = calculateMetrics(data);

            // 排序
            data.sort((a, b) => {
                const aVal = a[config.sortField];
                const bVal = b[config.sortField];
                if (typeof aVal === 'string' && typeof bVal === 'string') {
                    return config.sortOrder === 'desc' ? bVal.localeCompare(aVal) : aVal.localeCompare(bVal);
                }
                return config.sortOrder === 'desc' ? (bVal || 0) - (aVal || 0) : (aVal || 0) - (bVal || 0);
            });

            // 渲染表头
            document.getElementById('tableHead').innerHTML = '<tr>' + config.columns.map(c => '<th>' + c + '</th>').join('') + '</tr>';

            // 渲染表体
            const html = data.slice(0, 100).map((item, idx) => {
                return renderRow(item, idx + 1, currentStrategy);
            }).join('');
            document.getElementById('tableBody').innerHTML = html || '<tr><td colspan="' + config.columns.length + '" class="loading-state">暂无数据</td></tr>';
        }

        function calculateMetrics(data) {
            // 预先计算行业分组和排序（只做一次）
            const industryGroups = {};
            for (const item of data) {
                const industry = item.所属行业 || '其他';
                if (!industryGroups[industry]) industryGroups[industry] = [];
                industryGroups[industry].push(item);
            }

            // 预先计算每个行业的排序
            const industrySortedMap = {};
            for (const [industry, group] of Object.entries(industryGroups)) {
                industrySortedMap[industry] = [...group].sort((a, b) => {
                    const aVal = parseFloat(String(a.合计持仓市值万元 || 0).replace(/,/g, '')) || 0;
                    const bVal = parseFloat(String(b.合计持仓市值万元 || 0).replace(/,/g, '')) || 0;
                    return bVal - aVal;
                });
            }

            // 一次性计算所有指标
            for (const item of data) {
                // 共识度得分
                const companyCount = item.持仓基金公司 ? item.持仓基金公司.split('、').length : 0;
                item.companyCount = companyCount;
                item.consensusScore = item.持仓基金数量 * companyCount;

                // 平均持仓比例
                const ratioStr = String(item.持仓比例合计 || '');
                const holdingRatioSum = parseFloat(ratioStr.replace('%', '').replace(/,/g, '')) || 0;
                item.avgHoldingRatio = item.持仓基金数量 > 0 ? (holdingRatioSum / item.持仓基金数量).toFixed(2) : 0;

                // 市值等级
                const cap = item.总市值亿;
                item.capLevel = cap >= 2000 ? '超大盘' : cap >= 500 ? '大盘' : cap >= 100 ? '中盘' : '小盘';

                // 行业排名（使用预先计算的排序）
                const industry = item.所属行业 || '其他';
                const sortedGroup = industrySortedMap[industry] || [];
                item.industryRank = sortedGroup.findIndex(s => s.股票代码 === item.股票代码) + 1;
                item.industryTotal = industryGroups[industry]?.length || 0;

                // 持仓市值数值
                item.holdingMarketValue = parseFloat(String(item.合计持仓市值万元 || 0).replace(/,/g, '')) || 0;
            }

            return data;
        }

        function renderRow(item, rank, strategy) {
            const rankClass = rank <= 3 ? 'rank-' + rank : 'rank-other';
            const tags = getTags(item, strategy);

            if (strategy === 'consensus') {
                const scorePercent = Math.min(item.consensusScore / 500, 1) * 100;
                const scoreClass = scorePercent >= 70 ? 'score-high' : scorePercent >= 40 ? 'score-medium' : 'score-low';
                return '<tr>' +
                    '<td><span class="rank-badge ' + rankClass + '">' + rank + '</span></td>' +
                    '<td class="stock-code">' + item.股票代码 + '</td>' +
                    '<td class="stock-name">' + item.股票名称 + '</td>' +
                    '<td>' + item.总市值亿.toFixed(0) + '</td>' +
                    '<td>' + (item.所属行业 || '-') + '</td>' +
                    '<td><span class="fund-count">' + item.持仓基金数量 + '</span></td>' +
                    '<td>' + item.companyCount + '</td>' +
                    '<td><div class="score-bar"><div class="score-bar-fill ' + scoreClass + '" style="width: ' + scorePercent + '%"></div></div><span style="margin-left: 8px; font-size: 12px;">' + item.consensusScore + '</span></td>' +
                    '<td>' + tags + '</td>' +
                    '</tr>';
            } else if (strategy === 'concentration') {
                const ratio = parseFloat(item.avgHoldingRatio);
                const rating = ratio >= 5 ? '高度集中' : ratio >= 2 ? '中度集中' : '分散配置';
                const ratingClass = ratio >= 5 ? 'tag-heavy' : ratio >= 2 ? 'tag-focus' : 'tag-potential';
                return '<tr>' +
                    '<td><span class="rank-badge ' + rankClass + '">' + rank + '</span></td>' +
                    '<td class="stock-code">' + item.股票代码 + '</td>' +
                    '<td class="stock-name">' + item.股票名称 + '</td>' +
                    '<td>' + item.总市值亿.toFixed(0) + '</td>' +
                    '<td>' + (item.所属行业 || '-') + '</td>' +
                    '<td><span class="fund-count">' + item.持仓基金数量 + '</span></td>' +
                    '<td>' + item.avgHoldingRatio + '%</td>' +
                    '<td><span class="tag ' + ratingClass + '">' + rating + '</span></td>' +
                    '<td>' + tags + '</td>' +
                    '</tr>';
            } else if (strategy === 'coverage') {
                const fc = item.持仓基金数量;
                let level, levelClass;
                if (fc >= 50) { level = '热门股'; levelClass = 'tag-hot'; }
                else if (fc >= 20) { level = '关注股'; levelClass = 'tag-focus'; }
                else if (fc >= 10) { level = '潜力股'; levelClass = 'tag-potential'; }
                else { level = '冷门股'; levelClass = 'tag-potential'; }
                return '<tr>' +
                    '<td><span class="rank-badge ' + rankClass + '">' + rank + '</span></td>' +
                    '<td class="stock-code">' + item.股票代码 + '</td>' +
                    '<td class="stock-name">' + item.股票名称 + '</td>' +
                    '<td>' + item.总市值亿.toFixed(0) + '</td>' +
                    '<td>' + (item.所属行业 || '-') + '</td>' +
                    '<td><span class="fund-count">' + fc + '</span></td>' +
                    '<td>' + item.companyCount + '</td>' +
                    '<td><span class="tag ' + levelClass + '">' + level + '</span></td>' +
                    '<td>' + tags + '</td>' +
                    '</tr>';
            } else if (strategy === 'leader') {
                const isLeader = item.industryRank <= 3;
                return '<tr>' +
                    '<td><span class="rank-badge ' + rankClass + '">' + rank + '</span></td>' +
                    '<td class="stock-code">' + item.股票代码 + '</td>' +
                    '<td class="stock-name">' + item.股票名称 + '</td>' +
                    '<td>' + (item.所属行业 || '-') + '</td>' +
                    '<td>' + item.总市值亿.toFixed(0) + '</td>' +
                    '<td>' + item.持仓基金数量 + '</td>' +
                    '<td>' + item.industryRank + '/' + item.industryTotal + '</td>' +
                    '<td>' + (item.holdingMarketValue / 10000).toFixed(2) + '亿</td>' +
                    '<td>' + (isLeader ? '<span class="tag tag-leader">🏆 行业龙头</span>' : '') + '</td>' +
                    '</tr>';
            } else if (strategy === 'marketcap') {
                const capClass = item.capLevel === '超大盘' ? 'cap-super' : item.capLevel === '大盘' ? 'cap-large' : item.capLevel === '中盘' ? 'cap-medium' : 'cap-small';
                const scorePercent = Math.min(item.consensusScore / 500, 1) * 100;
                const scoreClass = scorePercent >= 70 ? 'score-high' : scorePercent >= 40 ? 'score-medium' : 'score-low';
                return '<tr>' +
                    '<td><span class="rank-badge ' + rankClass + '">' + rank + '</span></td>' +
                    '<td class="stock-code">' + item.股票代码 + '</td>' +
                    '<td class="stock-name">' + item.股票名称 + '</td>' +
                    '<td>' + item.总市值亿.toFixed(0) + '</td>' +
                    '<td><span class="cap-tag ' + capClass + '">' + item.capLevel + '</span></td>' +
                    '<td>' + item.持仓基金数量 + '</td>' +
                    '<td>' + item.companyCount + '</td>' +
                    '<td><div class="score-bar"><div class="score-bar-fill ' + scoreClass + '" style="width: ' + scorePercent + '%"></div></div><span style="margin-left: 8px; font-size: 12px;">' + item.consensusScore + '</span></td>' +
                    '<td>' + tags + '</td>' +
                    '</tr>';
            }
            return '';
        }

        function getTags(item, strategy) {
            const tags = [];
            if (item.持仓基金数量 >= 50) tags.push('<span class="tag tag-hot">热门</span>');
            if (item.companyCount >= 10) tags.push('<span class="tag tag-consensus">高共识</span>');
            if (parseFloat(item.avgHoldingRatio) >= 5) tags.push('<span class="tag tag-heavy">重仓</span>');
            return tags.join('');
        }
    </script>
</body>
</html>`;
  }

  // 生成分析详情页
  private generateAnalysisDetailPage(analysis: any): string {
    const a = analysis.analysis;
    const recClass = a?.recommendation ? `rec-${a.recommendation}` : '';

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${analysis.stockName} - AI分析报告</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        ${this.getCommonStyles()}
        .analysis-detail {
            max-width: 900px;
            margin: 0 auto;
        }
        .detail-card {
            background: var(--bg-card);
            border-radius: var(--radius-lg);
            padding: 28px;
            margin-bottom: 20px;
            border: 1px solid var(--border);
        }
        .detail-card-title {
            font-size: 18px;
            font-weight: 600;
            color: var(--text-primary);
            margin-bottom: 20px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .detail-card-title::before {
            content: '';
            width: 4px;
            height: 20px;
            background: linear-gradient(135deg, var(--primary), var(--secondary));
            border-radius: 2px;
        }
        .info-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
        }
        .info-item {
            background: var(--bg-secondary);
            padding: 16px;
            border-radius: var(--radius);
        }
        .info-label {
            font-size: 12px;
            color: var(--text-muted);
            margin-bottom: 6px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .info-value {
            font-size: 16px;
            color: var(--text-primary);
            font-weight: 500;
        }
        .summary-text {
            font-size: 16px;
            line-height: 1.8;
            color: var(--text-secondary);
        }
        .highlight-list {
            list-style: none;
        }
        .highlight-list li {
            padding: 14px 16px;
            background: var(--bg-secondary);
            border-radius: var(--radius);
            margin-bottom: 10px;
            border-left: 3px solid var(--success);
            color: var(--text-secondary);
            line-height: 1.6;
        }
        .risk-list {
            list-style: none;
        }
        .risk-list li {
            padding: 14px 16px;
            background: rgba(239, 68, 68, 0.1);
            border-radius: var(--radius);
            margin-bottom: 10px;
            border-left: 3px solid var(--danger);
            color: var(--text-secondary);
            line-height: 1.6;
        }
        .company-analysis {
            background: var(--bg-secondary);
            padding: 16px;
            border-radius: var(--radius);
            margin-bottom: 12px;
        }
        .company-analysis-name {
            font-weight: 600;
            color: var(--primary-light);
            margin-bottom: 8px;
        }
        .company-analysis-text {
            color: var(--text-secondary);
            line-height: 1.6;
        }
        .recommendation-box {
            text-align: center;
            padding: 24px;
            background: linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(14, 165, 233, 0.1));
            border-radius: var(--radius-lg);
        }
        .recommendation-label {
            font-size: 14px;
            color: var(--text-secondary);
            margin-bottom: 10px;
        }
        .recommendation-value {
            font-size: 28px;
            font-weight: 700;
        }
        .rec-强烈推荐 { color: #4ade80; }
        .rec-推荐 { color: #38bdf8; }
        .rec-中性 { color: #fbbf24; }
        .rec-谨慎 { color: #fb923c; }
        .rec-回避 { color: #f87171; }
        .download-section {
            display: flex;
            gap: 12px;
            margin-top: 24px;
        }
        .back-link {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            color: var(--text-secondary);
            text-decoration: none;
            font-size: 14px;
            margin-bottom: 20px;
            transition: color 0.2s;
        }
        .back-link:hover {
            color: var(--primary-light);
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="header-content">
                <div class="header-left">
                    <h1>🤖 AI分析报告</h1>
                    <div class="nav-links">
                        <a href="/" class="nav-link">📊 数据列表</a>
                        <a href="/strategies" class="nav-link">💡 投资策略</a>
                        <a href="/analyses" class="nav-link active">🤖 AI分析</a>
                    </div>
                </div>
                <div class="header-right">
                    <p class="subtitle">${analysis.stockName} (${analysis.stockCode}) - 分析日期：${analysis.date}</p>
                </div>
            </div>
        </div>

        <div class="analysis-detail">
            <a href="/analyses" class="back-link">← 返回分析列表</a>

            ${analysis.status === 'completed' && a ? `
            <div class="detail-card">
                <h2 class="detail-card-title">📊 基本信息</h2>
                <div class="info-grid">
                    <div class="info-item">
                        <div class="info-label">股票代码</div>
                        <div class="info-value">${analysis.stockCode}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">股票名称</div>
                        <div class="info-value">${analysis.stockName}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">分析日期</div>
                        <div class="info-value">${analysis.date}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">生成时间</div>
                        <div class="info-value">${new Date(analysis.createdAt).toLocaleString('zh-CN')}</div>
                    </div>
                </div>
            </div>

            <div class="detail-card">
                <h2 class="detail-card-title">📝 摘要</h2>
                <p class="summary-text">${a.summary}</p>
            </div>

            <div class="detail-card">
                <h2 class="detail-card-title">📈 基本面分析</h2>
                <div class="info-grid">
                    <div class="info-item">
                        <div class="info-label">市值规模</div>
                        <div class="info-value">${a.fundamentals.marketCap}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">所属行业</div>
                        <div class="info-value">${a.fundamentals.industry}</div>
                    </div>
                </div>
                <div style="margin-top: 20px;">
                    <div class="info-label" style="margin-bottom: 8px;">行业地位</div>
                    <p class="summary-text">${a.fundamentals.industryPosition}</p>
                </div>
            </div>

            <div class="detail-card">
                <h2 class="detail-card-title">🏦 基金持仓分析</h2>
                <p class="summary-text" style="margin-bottom: 20px;">${a.fundHolding.overview}</p>
                ${a.fundHolding.companies.map((c: { name: string; analysis: string }) => `
                <div class="company-analysis">
                    <div class="company-analysis-name">${c.name}</div>
                    <div class="company-analysis-text">${c.analysis}</div>
                </div>
                `).join('')}
            </div>

            <div class="detail-card">
                <h2 class="detail-card-title">✨ 投资亮点</h2>
                <ul class="highlight-list">
                    ${a.investmentHighlights.map((h: string) => `<li>${h}</li>`).join('')}
                </ul>
            </div>

            <div class="detail-card">
                <h2 class="detail-card-title">⚠️ 风险提示</h2>
                <ul class="risk-list">
                    ${a.riskWarnings.map((r: string) => `<li>${r}</li>`).join('')}
                </ul>
            </div>

            <div class="detail-card">
                <h2 class="detail-card-title">💡 综合评价</h2>
                <p class="summary-text">${a.conclusion}</p>
            </div>

            <div class="detail-card">
                <h2 class="detail-card-title">🎯 投资建议</h2>
                <div class="recommendation-box">
                    <div class="recommendation-label">综合评级</div>
                    <div class="recommendation-value ${recClass}">${a.recommendation}</div>
                </div>
            </div>

            <div class="detail-card">
                <h2 class="detail-card-title">📥 下载报告</h2>
                <div class="download-section">
                    <a href="/api/analysis/${analysis.id}/download?format=txt" class="btn btn-primary">下载 TXT 格式</a>
                    <a href="/api/analysis/${analysis.id}/download?format=md" class="btn btn-secondary">下载 Markdown 格式</a>
                </div>
            </div>

            <div class="detail-card" style="background: rgba(245, 158, 11, 0.1); border-color: rgba(245, 158, 11, 0.3);">
                <p style="color: var(--text-secondary); font-size: 14px; line-height: 1.8; margin: 0;">
                    ⚠️ <strong>免责声明</strong>：本报告由AI自动生成，仅供参考，不构成投资建议。投资有风险，入市需谨慎。
                </p>
            </div>
            ` : analysis.status === 'pending' ? `
            <div class="detail-card">
                <div style="text-align: center; padding: 60px 20px;">
                    <div class="spinner" style="margin: 0 auto 20px;"></div>
                    <h3 style="color: var(--text-primary); margin-bottom: 10px;">AI正在分析中</h3>
                    <p style="color: var(--text-secondary);">分析通常需要10-30秒，请稍候...</p>
                    <button class="btn btn-primary" style="margin-top: 20px;" onclick="location.reload()">刷新状态</button>
                </div>
            </div>
            ` : `
            <div class="detail-card">
                <div style="text-align: center; padding: 60px 20px;">
                    <h3 style="color: var(--danger); margin-bottom: 10px;">❌ 分析失败</h3>
                    <p style="color: var(--text-secondary);">${analysis.error || '未知错误'}</p>
                    <a href="/" class="btn btn-primary" style="margin-top: 20px; display: inline-block;">返回股票列表</a>
                </div>
            </div>
            `}
        </div>
    </div>

    ${analysis.status === 'pending' ? `
    <script>
        setTimeout(() => location.reload(), 3000);
    </script>
    ` : ''}
</body>
</html>`;
  }

  // 通用样式
  private getCommonStyles(): string {
    return `
        :root {
            --primary: #6366f1;
            --primary-dark: #4f46e5;
            --primary-light: #818cf8;
            --secondary: #0ea5e9;
            --accent: #f59e0b;
            --success: #10b981;
            --danger: #ef4444;
            --bg-primary: #0f172a;
            --bg-secondary: #1e293b;
            --bg-card: #1e293b;
            --bg-card-hover: #334155;
            --text-primary: #f8fafc;
            --text-secondary: #94a3b8;
            --text-muted: #64748b;
            --border: #334155;
            --shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -2px rgba(0, 0, 0, 0.2);
            --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -4px rgba(0, 0, 0, 0.2);
            --radius: 12px;
            --radius-lg: 16px;
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: var(--bg-primary);
            color: var(--text-primary);
            min-height: 100vh;
            line-height: 1.6;
        }

        body::before {
            content: '';
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background:
                radial-gradient(ellipse at 20% 20%, rgba(99, 102, 241, 0.15) 0%, transparent 50%),
                radial-gradient(ellipse at 80% 80%, rgba(14, 165, 233, 0.1) 0%, transparent 50%),
                radial-gradient(ellipse at 50% 50%, rgba(245, 158, 11, 0.05) 0%, transparent 50%);
            pointer-events: none;
            z-index: -1;
        }

        .container {
            max-width: 1400px;
            margin: 0 auto;
            padding: 24px;
        }

        .header {
            background: linear-gradient(135deg, var(--bg-card) 0%, rgba(30, 41, 59, 0.8) 100%);
            border-radius: var(--radius-lg);
            padding: 32px;
            margin-bottom: 24px;
            box-shadow: var(--shadow-lg);
            border: 1px solid var(--border);
            position: relative;
            overflow: hidden;
        }

        .header::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 3px;
            background: linear-gradient(90deg, var(--primary), var(--secondary), var(--accent));
        }

        .header-content {
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 20px;
        }

        .header-left {
            display: flex;
            align-items: center;
            gap: 24px;
        }

        .header-left h1 {
            margin-bottom: 0;
        }

        .header-right {
            display: flex;
            align-items: center;
            gap: 16px;
        }

        .header h1 {
            font-size: 28px;
            font-weight: 700;
            background: linear-gradient(135deg, var(--text-primary) 0%, var(--primary-light) 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }

        .header .subtitle {
            color: var(--text-secondary);
            font-size: 15px;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .header .subtitle::before {
            content: '';
            display: inline-block;
            width: 8px;
            height: 8px;
            background: var(--success);
            border-radius: 50%;
            animation: pulse 2s infinite;
        }

        @keyframes pulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.5; transform: scale(1.2); }
        }

        .nav-links {
            display: flex;
            gap: 8px;
        }

        .nav-link {
            padding: 8px 16px;
            border-radius: var(--radius);
            text-decoration: none;
            color: var(--text-secondary);
            font-size: 14px;
            font-weight: 500;
            transition: all 0.2s;
            background: var(--bg-secondary);
            border: 1px solid var(--border);
        }

        .nav-link:hover {
            color: var(--primary-light);
            border-color: var(--primary);
        }

        .nav-link.active {
            color: var(--text-primary);
            background: var(--primary);
            border-color: var(--primary);
        }

        .date-selector {
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .date-selector label {
            font-size: 14px;
            color: var(--text-secondary);
            font-weight: 500;
        }

        .date-selector select {
            padding: 10px 16px;
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            border-radius: var(--radius);
            color: var(--text-primary);
            font-size: 14px;
            min-width: 180px;
            cursor: pointer;
            transition: all 0.2s;
        }

        .date-selector select:hover { border-color: var(--primary); }
        .date-selector select:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2); }

        .update-time {
            color: var(--text-muted);
            font-size: 13px;
        }

        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
            gap: 20px;
            margin-bottom: 24px;
        }

        .stat-card {
            background: var(--bg-card);
            border-radius: var(--radius-lg);
            padding: 16px 20px;
            border: 1px solid var(--border);
            transition: all 0.3s ease;
            position: relative;
            overflow: hidden;
        }

        .stat-card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 3px;
        }

        .stat-card:nth-child(1)::before { background: linear-gradient(90deg, var(--primary), var(--primary-light)); }
        .stat-card:nth-child(2)::before { background: linear-gradient(90deg, var(--secondary), #38bdf8); }
        .stat-card:nth-child(3)::before { background: linear-gradient(90deg, var(--success), #34d399); }

        .stat-card:hover {
            transform: translateY(-4px);
            box-shadow: var(--shadow-lg);
            border-color: var(--primary);
        }

        .stat-card .value {
            font-size: 24px;
            font-weight: 700;
            background: linear-gradient(135deg, var(--text-primary), var(--primary-light));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }

        .stat-card .label {
            color: var(--text-secondary);
            font-size: 12px;
            margin-top: 2px;
            font-weight: 500;
        }

        .filters {
            background: var(--bg-card);
            border-radius: var(--radius-lg);
            padding: 24px;
            margin-bottom: 24px;
            box-shadow: var(--shadow);
            border: 1px solid var(--border);
        }

        .filters-header {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 20px;
        }

        .filters-header h3 {
            color: var(--text-primary);
            font-size: 18px;
            font-weight: 600;
        }

        .filters-header .icon {
            width: 20px;
            height: 20px;
            color: var(--primary);
        }

        .filter-row {
            display: flex;
            flex-wrap: wrap;
            gap: 16px;
            align-items: flex-end;
        }

        .filter-group {
            display: flex;
            flex-direction: column;
            gap: 6px;
            flex: 1;
            min-width: 150px;
        }

        .filter-group.multi-select-group {
            min-width: 200px;
            flex: 0 0 auto;
        }

        .filter-group label {
            font-size: 13px;
            color: var(--text-secondary);
            font-weight: 500;
        }

        .filter-group input,
        .filter-group select {
            padding: 12px 16px;
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            border-radius: var(--radius);
            color: var(--text-primary);
            font-size: 14px;
            transition: all 0.2s;
        }

        .filter-group input::placeholder { color: var(--text-muted); }
        .filter-group input:hover, .filter-group select:hover { border-color: var(--primary); }
        .filter-group input:focus, .filter-group select:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2); }

        /* Multi-select styles */
        .multi-select-container {
            position: relative;
            min-width: 200px;
        }
        .multi-select-trigger {
            padding: 12px 16px;
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            border-radius: var(--radius);
            color: var(--text-primary);
            font-size: 14px;
            cursor: pointer;
            display: flex;
            justify-content: space-between;
            align-items: center;
            transition: all 0.2s;
            min-height: 46px;
        }
        .multi-select-trigger:hover { border-color: var(--primary); }
        .multi-select-trigger:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2); }
        .multi-select-trigger.active { border-color: var(--primary); }
        .dropdown-icon { transition: transform 0.2s; }
        .multi-select-trigger.active .dropdown-icon { transform: rotate(180deg); }
        .multi-select-dropdown {
            position: absolute;
            top: 100%;
            left: 0;
            right: 0;
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: var(--radius);
            margin-top: 4px;
            max-height: 300px;
            overflow-y: auto;
            z-index: 1000;
            display: none;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }
        .multi-select-dropdown.show { display: block; }
        .multi-select-option {
            display: flex;
            align-items: center;
            padding: 10px 16px;
            cursor: pointer;
            transition: background 0.15s;
            font-size: 14px;
        }
        .multi-select-option:hover { background: var(--bg-secondary); }
        .multi-select-option input { margin-right: 10px; width: 16px; height: 16px; cursor: pointer; }
        .multi-select-tags { display: flex; flex-wrap: wrap; gap: 4px; }
        .multi-select-tag {
            background: var(--primary);
            color: white;
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 12px;
            display: inline-flex;
            align-items: center;
            gap: 4px;
        }
        .multi-select-tag .remove-tag {
            cursor: pointer;
            opacity: 0.8;
        }
        .multi-select-tag .remove-tag:hover { opacity: 1; }

        .actions {
            display: flex;
            gap: 12px;
            margin-left: auto;
        }

        .btn {
            padding: 12px 24px;
            border: none;
            border-radius: var(--radius);
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
            display: inline-flex;
            align-items: center;
            gap: 8px;
            text-decoration: none;
        }

        .btn-primary {
            background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%);
            color: white;
        }

        .btn-primary:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
        }

        .btn-secondary {
            background: var(--bg-secondary);
            color: var(--text-primary);
            border: 1px solid var(--border);
        }

        .btn-secondary:hover {
            background: var(--bg-card-hover);
            border-color: var(--primary);
        }

        .btn-success {
            background: linear-gradient(135deg, var(--success) 0%, #059669 100%);
            color: white;
        }

        .btn-success:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
        }

        .btn-sm {
            padding: 4px 10px;
            font-size: 12px;
        }

        .modal-header-actions {
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .table-container {
            background: var(--bg-card);
            border-radius: var(--radius-lg);
            overflow: hidden;
            box-shadow: var(--shadow);
            border: 1px solid var(--border);
        }

        .table-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 20px 24px;
            border-bottom: 1px solid var(--border);
            background: linear-gradient(135deg, var(--bg-card) 0%, var(--bg-secondary) 100%);
        }

        .table-header h3 {
            color: var(--text-primary);
            font-size: 18px;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .date-badge {
            display: inline-flex;
            align-items: center;
            padding: 4px 12px;
            background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%);
            color: white;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 500;
        }

        .result-count {
            color: var(--text-secondary);
            font-size: 14px;
            background: var(--bg-secondary);
            padding: 6px 14px;
            border-radius: 20px;
        }

        .scroll-wrapper {
            max-height: 600px;
            overflow-y: auto;
        }

        .scroll-wrapper::-webkit-scrollbar { width: 8px; }
        .scroll-wrapper::-webkit-scrollbar-track { background: var(--bg-secondary); }
        .scroll-wrapper::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }
        .scroll-wrapper::-webkit-scrollbar-thumb:hover { background: var(--primary); }

        .pagination {
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 8px;
            margin-top: 20px;
            flex-wrap: wrap;
        }

        .page-btn {
            padding: 8px 16px;
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            border-radius: var(--radius);
            color: var(--text-primary);
            cursor: pointer;
            transition: all 0.2s;
            font-size: 14px;
        }

        .page-btn:hover:not(:disabled) {
            background: var(--primary);
            border-color: var(--primary);
        }

        .page-btn.active {
            background: var(--primary);
            border-color: var(--primary);
        }

        .page-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .page-info {
            color: var(--text-secondary);
            font-size: 14px;
            margin-left: 12px;
        }

        .page-ellipsis {
            color: var(--text-secondary);
            padding: 0 8px;
        }

        table { width: 100%; border-collapse: collapse; table-layout: fixed; }

        th, td {
            padding: 12px 10px;
            text-align: left;
            border-bottom: 1px solid var(--border);
            vertical-align: middle;
        }

        th:nth-child(1), td:nth-child(1) { width: 80px; }  /* 股票代码 */
        th:nth-child(2), td:nth-child(2) { width: 90px; }  /* 股票名称 */
        th:nth-child(3), td:nth-child(3) { width: 85px; }  /* 总市值 */
        th:nth-child(4), td:nth-child(4) { width: 65px; }  /* 现价 */
        th:nth-child(5), td:nth-child(5) { width: 70px; }  /* 涨幅 */
        th:nth-child(6), td:nth-child(6) { width: 65px; }  /* PE */
        th:nth-child(7), td:nth-child(7) { width: 65px; }  /* 换手率 */
        th:nth-child(8), td:nth-child(8) { width: 80px; }  /* 成交额 */
        th:nth-child(9), td:nth-child(9) { width: 100px; }  /* 所属行业 */
        th:nth-child(10), td:nth-child(10) { width: 60px; text-align: center; }  /* 基金数 */
        th:nth-child(11), td:nth-child(11) { width: 320px; }  /* 持仓基金公司 */
        th:nth-child(12), td:nth-child(12) { width: 150px; }  /* 操作 */

        th {
            background: var(--bg-secondary);
            font-weight: 600;
            color: var(--text-secondary);
            font-size: 13px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            position: sticky;
            top: 0;
            z-index: 1;
            cursor: pointer;
            transition: color 0.2s;
        }

        th:hover { color: var(--primary-light); }
        tr {
            transition: background 0.2s;
        }
        tr:hover { background: var(--bg-card-hover); }

        .stock-code {
            font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
            color: var(--primary-light);
            font-weight: 600;
            font-size: 14px;
        }

        .stock-name {
            font-weight: 600;
            color: var(--text-primary);
            font-size: 15px;
        }

        .market-cap {
            font-weight: 700;
            color: var(--success);
            font-size: 15px;
        }

        .stock-price {
            font-weight: 600;
            color: var(--text-primary);
            font-size: 14px;
            font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
        }

        .stock-change {
            font-weight: 600;
            font-size: 14px;
            font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
            padding: 4px 8px;
            border-radius: 6px;
        }

        .stock-change.up {
            color: #ef4444;
            background: rgba(239, 68, 68, 0.15);
        }

        .stock-change.down {
            color: #22c55e;
            background: rgba(34, 197, 94, 0.15);
        }

        .stock-amount {
            font-weight: 600;
            color: #f59e0b;
            font-size: 13px;
            font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
        }

        .fund-count {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-width: 32px;
            height: 28px;
            background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%);
            color: white;
            padding: 0 10px;
            border-radius: 14px;
            font-size: 13px;
            font-weight: 600;
        }

        .company-tag {
            display: inline-flex;
            align-items: center;
            padding: 3px 8px;
            border-radius: 10px;
            font-size: 11px;
            font-weight: 500;
            margin: 0;
            transition: all 0.15s ease;
            white-space: nowrap;
        }
        .company-tag:hover {
            transform: scale(1.05);
        }

        /* 基金公司标签颜色 */
        .company-tag.blue { background: rgba(59, 130, 246, 0.2); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.3); }
        .company-tag.orange { background: rgba(249, 115, 22, 0.2); color: #fb923c; border: 1px solid rgba(249, 115, 22, 0.3); }
        .company-tag.red { background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); }
        .company-tag.purple { background: rgba(168, 85, 247, 0.2); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.3); }
        .company-tag.green { background: rgba(34, 197, 94, 0.2); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.3); }
        .company-tag.teal { background: rgba(20, 184, 166, 0.2); color: #2dd4bf; border: 1px solid rgba(20, 184, 166, 0.3); }
        .company-tag.indigo { background: rgba(99, 102, 241, 0.2); color: #818cf8; border: 1px solid rgba(99, 102, 241, 0.3); }
        .company-tag.cyan { background: rgba(6, 182, 212, 0.2); color: #22d3ee; border: 1px solid rgba(6, 182, 212, 0.3); }
        .company-tag.pink { background: rgba(236, 72, 153, 0.2); color: #f472b6; border: 1px solid rgba(236, 72, 153, 0.3); }
        .company-tag.amber { background: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3); }
        .company-tag.emerald { background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); }
        .company-tag.lime { background: rgba(132, 204, 22, 0.2); color: #a3e635; border: 1px solid rgba(132, 204, 22, 0.3); }
        .company-tag.sky { background: rgba(14, 165, 233, 0.2); color: #38bdf8; border: 1px solid rgba(14, 165, 233, 0.3); }
        .company-tag.violet { background: rgba(139, 92, 246, 0.2); color: #a78bfa; border: 1px solid rgba(139, 92, 246, 0.3); }
        .company-tag.fuchsia { background: rgba(217, 70, 239, 0.2); color: #e879f9; border: 1px solid rgba(217, 70, 239, 0.3); }
        .company-tag.rose { background: rgba(244, 63, 94, 0.2); color: #fb7185; border: 1px solid rgba(244, 63, 94, 0.3); }
        .company-tag.slate { background: rgba(100, 116, 139, 0.2); color: #94a3b8; border: 1px solid rgba(100, 116, 139, 0.3); }
        .company-tag.jinglin { background: rgba(34, 197, 94, 0.2); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.3); }
        .company-tag.default { background: rgba(148, 163, 184, 0.2); color: #94a3b8; border: 1px solid rgba(148, 163, 184, 0.3); }

        .company-tags-cell {
            width: 320px;
            vertical-align: middle;
        }
        .company-tags-wrapper {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 4px 6px;
            min-height: 24px;
            line-height: 1.5;
        }
        .company-tags-wrapper:not(.expanded) {
            max-height: 52px;
            overflow: hidden;
        }
        .company-tags-wrapper:not(.expanded)::after {
            content: '';
            position: absolute;
            bottom: 0;
            right: 0;
            width: 60px;
            height: 26px;
            background: linear-gradient(to right, transparent, var(--bg-card));
            pointer-events: none;
        }
        .company-tags-wrapper.expanded {
            max-height: 500px;
        }
        .company-tag {
            display: inline-flex;
            align-items: center;
            padding: 2px 8px;
            border-radius: 10px;
            font-size: 11px;
            font-weight: 500;
            white-space: nowrap;
        }
        .company-tag.hidden-tag {
            display: none;
        }
        .company-tags-wrapper.expanded .company-tag.hidden-tag {
            display: inline-flex;
        }
        .show-more-btn {
            background: linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(99, 102, 241, 0.25) 100%);
            color: var(--primary);
            border: 1px solid rgba(99, 102, 241, 0.4);
            padding: 3px 10px;
            border-radius: 12px;
            font-size: 11px;
            cursor: pointer;
            margin-left: 2px;
            transition: all 0.25s ease;
            white-space: nowrap;
            font-weight: 500;
            flex-shrink: 0;
        }
        .show-more-btn:hover {
            background: linear-gradient(135deg, var(--primary) 0%, #4f46e5 100%);
            color: white;
            transform: translateY(-1px);
            box-shadow: 0 2px 8px rgba(99, 102, 241, 0.3);
        }
        .show-more-btn.expanded {
            background: rgba(99, 102, 241, 0.2);
            border-radius: 12px;
        }

        .action-btns {
            display: inline-flex;
            gap: 8px;
            align-items: center;
            white-space: nowrap;
        }

        .action-cell {
            vertical-align: middle;
        }

        .detail-btn {
            background: transparent;
            color: var(--primary-light);
            border: 1px solid var(--primary);
            padding: 6px 12px;
            border-radius: var(--radius);
            cursor: pointer;
            font-size: 12px;
            font-weight: 500;
            transition: all 0.2s;
            white-space: nowrap;
        }

        .detail-btn:hover {
            background: var(--primary);
            color: white;
        }

        .analyze-btn {
            background: linear-gradient(135deg, var(--accent) 0%, #d97706 100%);
            color: white;
            border: none;
            padding: 6px 12px;
            border-radius: var(--radius);
            cursor: pointer;
            font-size: 12px;
            font-weight: 500;
            transition: all 0.2s;
            white-space: nowrap;
        }

        .analyze-btn:hover {
            transform: translateY(-1px);
            box-shadow: 0 4px 8px rgba(245, 158, 11, 0.3);
        }

        .modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.7);
            backdrop-filter: blur(4px);
            z-index: 1000;
            justify-content: center;
            align-items: center;
            animation: fadeIn 0.2s ease;
        }

        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

        .modal.active { display: flex; }

        .modal-content {
            background: var(--bg-card);
            border-radius: var(--radius-lg);
            max-width: 850px;
            width: 90%;
            max-height: 80vh;
            overflow: auto;
            box-shadow: var(--shadow-lg);
            border: 1px solid var(--border);
            animation: slideUp 0.3s ease;
        }

        .analyze-modal {
            max-width: 500px;
        }

        @keyframes slideUp {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .modal-header {
            padding: 24px;
            border-bottom: 1px solid var(--border);
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: linear-gradient(135deg, var(--bg-card) 0%, var(--bg-secondary) 100%);
        }

        .modal-header h3 {
            color: var(--text-primary);
            font-size: 20px;
            font-weight: 600;
        }

        .close-btn {
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            color: var(--text-secondary);
            width: 36px;
            height: 36px;
            border-radius: 50%;
            font-size: 20px;
            cursor: pointer;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .close-btn:hover {
            background: var(--danger);
            border-color: var(--danger);
            color: white;
        }

        .modal-body {
            padding: 24px;
        }

        .detail-table {
            width: 100%;
            border-collapse: collapse;
        }

        .detail-table th, .detail-table td {
            padding: 14px 16px;
            font-size: 14px;
            border-bottom: 1px solid var(--border);
        }

        .detail-table th {
            background: var(--bg-secondary);
            color: var(--text-secondary);
            font-weight: 600;
            font-size: 13px;
            text-transform: uppercase;
        }

        .detail-table tr:hover { background: var(--bg-card-hover); }

        .loading, .no-data {
            text-align: center;
            padding: 60px;
            color: var(--text-secondary);
        }

        .loading::after {
            content: '';
            display: inline-block;
            width: 20px;
            height: 20px;
            border: 2px solid var(--border);
            border-top-color: var(--primary);
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin-left: 12px;
            vertical-align: middle;
        }

        @keyframes spin { to { transform: rotate(360deg); } }

        .analyze-loading {
            text-align: center;
            padding: 40px 20px;
        }

        .spinner {
            width: 50px;
            height: 50px;
            border: 4px solid var(--border);
            border-top-color: var(--primary);
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 0 auto 20px;
        }

        .analyze-tip {
            font-size: 13px;
            color: var(--text-muted);
            margin-top: 10px;
        }

        .analyze-error {
            text-align: center;
            padding: 40px 20px;
            color: var(--danger);
        }

        @media (max-width: 768px) {
            .container { padding: 16px; }
            .header { padding: 20px; }
            .header h1 { font-size: 22px; }
            .header-content { flex-direction: column; align-items: flex-start; gap: 16px; }
            .header-left { flex-direction: column; align-items: flex-start; gap: 12px; width: 100%; }
            .header-right { flex-direction: column; align-items: flex-start; width: 100%; }
            .nav-links { width: 100%; }
            .filter-row { flex-direction: column; }
            .filter-group { width: 100%; }
            .filter-group.multi-select-group { min-width: 100%; }
            .filter-group input, .filter-group select { width: 100%; }
            .actions { width: 100%; justify-content: center; margin-left: 0; margin-top: 16px; }
            .btn { flex: 1; justify-content: center; }
            th, td { padding: 12px 8px; font-size: 13px; }
            .stat-card .value { font-size: 20px; }
            .action-btns { flex-direction: column; }
        }
    `;
  }
}
