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

  // API: 导出Excel
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

    try {
      const buffer = this.stockService.exportToExcel({
        companies,
        minMarketCap: minCap ? parseFloat(minCap) : undefined,
        maxMarketCap: maxCap ? parseFloat(maxCap) : undefined,
        industry,
        keyword,
      });
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
                <div>
                    <h1>📈 股票筛选数据平台</h1>
                    <p class="subtitle">筛选条件：总市值 ≥ 200亿 | 持仓基金：华夏、易方达、中欧、景林</p>
                </div>
                <div class="date-section">
                    <div class="nav-links">
                        <a href="/" class="nav-link active">📊 数据列表</a>
                        <a href="/analyses" class="nav-link">🤖 AI分析</a>
                    </div>
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
                <div class="filter-group">
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
                        导出
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
                            <th class="sortable" onclick="sortTable('所属行业')">所属行业</th>
                            <th class="sortable" onclick="sortTable('持仓基金数量')">基金数</th>
                            <th>持仓基金公司</th>
                            <th>操作</th>
                        </tr>
                    </thead>
                    <tbody id="stockTable">
                        <tr><td colspan="7" class="loading">加载中</td></tr>
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    <div class="modal" id="detailModal">
        <div class="modal-content">
            <div class="modal-header">
                <h3 id="modalTitle">持仓明细</h3>
                <button class="close-btn" onclick="closeModal()">×</button>
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

        document.addEventListener('DOMContentLoaded', async () => {
            await loadDates();
            await Promise.all([
                loadStatistics(),
                loadCompanies(),
                loadIndustries(),
                loadSummary(),
                loadCurrentDate()
            ]);
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
                const res = await fetch('/api/summary?' + params.toString());
                currentData = await res.json();
                renderTable();
            } catch (e) {
                document.getElementById('stockTable').innerHTML = '<tr><td colspan="7" class="no-data">加载数据失败，请刷新重试</td></tr>';
            }
        }

        function renderTable() {
            const sorted = [...currentData].sort((a, b) => {
                const aVal = a[sortField];
                const bVal = b[sortField];
                if (typeof aVal === 'number') return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
                return sortOrder === 'asc' ? String(aVal).localeCompare(String(bVal)) : String(bVal).localeCompare(String(aVal));
            });
            document.getElementById('resultCount').textContent = '共 ' + sorted.length + ' 条结果';
            if (sorted.length === 0) {
                document.getElementById('stockTable').innerHTML = '<tr><td colspan="7" class="no-data">没有符合条件的数据</td></tr>';
                return;
            }
            const html = sorted.map(stock => {
                const companies = stock.持仓基金公司.split('、');
                const companyTags = companies.map(c => {
                    let cls = 'company-tag';
                    if (c.includes('华夏')) cls += ' huaxia';
                    else if (c.includes('易方达')) cls += ' yifangda';
                    else if (c.includes('中欧')) cls += ' zhongou';
                    else if (c.includes('景林')) cls += ' jinglin';
                    return '<span class="' + cls + '">' + c + '</span>';
                }).join('');
                return '<tr>' +
                    '<td class="stock-code">' + stock.股票代码 + '</td>' +
                    '<td class="stock-name">' + stock.股票名称 + '</td>' +
                    '<td class="market-cap">' + stock.总市值亿.toFixed(0).toLocaleString() + '</td>' +
                    '<td>' + (stock.所属行业 || '-') + '</td>' +
                    '<td><span class="fund-count">' + stock.持仓基金数量 + '</span></td>' +
                    '<td>' + companyTags + '</td>' +
                    '<td class="action-btns">' +
                        '<button class="detail-btn" onclick="showDetail(\\'' + stock.股票代码 + '\\', \\'' + stock.股票名称 + '\\')">明细</button>' +
                        '<button class="analyze-btn" onclick="startAnalyze(\\'' + stock.股票代码 + '\\', \\'' + stock.股票名称 + '\\')">🤖 AI分析</button>' +
                    '</td>' +
                    '</tr>';
            }).join('');
            document.getElementById('stockTable').innerHTML = html;
        }

        function sortTable(field) {
            if (sortField === field) {
                sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
            } else {
                sortField = field;
                sortOrder = 'desc';
            }
            renderTable();
        }

        function applyFilters() { loadSummary(); }
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
            try {
                const res = await fetch('/api/detail?code=' + code);
                const data = await res.json();
                document.getElementById('modalTitle').textContent = name + ' (' + code + ') 持仓明细';
                const html = data.map(d => '<tr>' +
                    '<td>' + d.持仓基金 + '</td>' +
                    '<td><span class="company-tag">' + d.基金公司 + '</span></td>' +
                    '<td>' + d.持仓股数万股 + '</td>' +
                    '<td>' + d.持仓比例 + '</td>' +
                    '<td>' + d.持仓市值万元 + '</td>' +
                    '</tr>'
                ).join('');
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
                <div>
                    <h1>🤖 AI分析报告</h1>
                    <p class="subtitle">查看所有股票的AI投资分析报告</p>
                </div>
                <div class="date-section">
                    <div class="nav-links">
                        <a href="/" class="nav-link">📊 数据列表</a>
                        <a href="/analyses" class="nav-link active">🤖 AI分析</a>
                    </div>
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
                <div>
                    <h1>🤖 AI分析报告</h1>
                    <p class="subtitle">${analysis.stockName} (${analysis.stockCode}) - 分析日期：${analysis.date}</p>
                </div>
                <div class="date-section">
                    <div class="nav-links">
                        <a href="/" class="nav-link">📊 数据列表</a>
                        <a href="/analyses" class="nav-link">🤖 AI分析</a>
                    </div>
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
            align-items: flex-start;
            flex-wrap: wrap;
            gap: 20px;
        }

        .header h1 {
            font-size: 32px;
            font-weight: 700;
            background: linear-gradient(135deg, var(--text-primary) 0%, var(--primary-light) 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            margin-bottom: 8px;
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
            margin-bottom: 12px;
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

        .date-section {
            display: flex;
            flex-direction: column;
            gap: 12px;
            align-items: flex-end;
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
            z-index: 100;
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

        table { width: 100%; border-collapse: collapse; }

        th, td {
            padding: 16px 20px;
            text-align: left;
            border-bottom: 1px solid var(--border);
        }

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
        tr { transition: background 0.2s; }
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
            display: inline-block;
            padding: 4px 10px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 500;
            margin: 2px;
        }

        .company-tag.huaxia { background: rgba(59, 130, 246, 0.2); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.3); }
        .company-tag.yifangda { background: rgba(249, 115, 22, 0.2); color: #fb923c; border: 1px solid rgba(249, 115, 22, 0.3); }
        .company-tag.zhongou { background: rgba(168, 85, 247, 0.2); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.3); }
        .company-tag.jinglin { background: rgba(34, 197, 94, 0.2); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.3); }

        .action-btns {
            display: flex;
            gap: 8px;
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
            .header h1 { font-size: 24px; }
            .header-content { flex-direction: column; }
            .date-section { align-items: flex-start; width: 100%; }
            .nav-links { width: 100%; justify-content: center; }
            .filter-row { flex-direction: column; }
            .filter-group { width: 100%; }
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
