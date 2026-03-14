# -*- coding: utf-8 -*-
"""
股票筛选脚本
功能：筛选总市值大于200亿且有华夏基金、易方达基金、中欧基金、景林基金持仓的股票
注意：华夏、易方达、中欧为公募基金，从基金持仓数据获取；景林为私募基金，从十大流通股东获取
"""

import requests
import re
import time
import pandas as pd
from collections import defaultdict
from datetime import datetime
from bs4 import BeautifulSoup

# 禁用代理
import os
os.environ.pop('http_proxy', None)
os.environ.pop('https_proxy', None)
os.environ.pop('HTTP_PROXY', None)
os.environ.pop('HTTPS_PROXY', None)


class StockFilter:
    def __init__(self):
        self.session = requests.Session()
        self.session.trust_env = False
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        })

        # 公募基金公司关键词
        self.public_fund_companies = {
            '华夏': '华夏基金',
            '易方达': '易方达基金',
            '中欧': '中欧基金'
        }

        # 私募基金关键词（景林）
        self.private_fund_keywords = ['景林']

        # 缓存
        self.fund_list = []  # 目标基金列表（公募）
        self.stock_holders = defaultdict(list)  # 股票->持仓基金列表
        self.stock_market_cap = {}  # 股票市值
        self.stock_industry = {}  # 股票行业
        self.jinglin_stocks = {}  # 景林持仓的股票

    def request_with_retry(self, url, params=None, headers=None, timeout=30, retries=3):
        """带重试的请求"""
        for i in range(retries):
            try:
                r = self.session.get(url, params=params, headers=headers, timeout=timeout)
                return r
            except Exception as e:
                if i < retries - 1:
                    time.sleep(1)
                    continue
                print(f"请求失败: {url}, 错误: {e}")
                return None

    def get_target_funds(self):
        """获取目标公募基金公司旗下的基金列表（不包含景林，景林是私募）"""
        print("=" * 60)
        print("步骤1: 获取目标公募基金列表（华夏、易方达、中欧）")
        print("=" * 60)

        url = 'https://fund.eastmoney.com/js/fundcode_search.js'
        r = self.request_with_retry(url, timeout=60)
        if not r:
            print("获取基金列表失败")
            return False

        content = r.content.decode('utf-8')
        match = re.search(r'var r = \[(.*)\];', content, re.DOTALL)
        if not match:
            print("解析基金列表失败")
            return False

        # 解析基金列表
        items = re.findall(r'\["(\d{6})","([^"]*)","([^"]*)","([^"]*)","([^"]*)"\]', match.group(1))
        print(f"总共找到 {len(items)} 只公募基金")

        # 筛选目标基金（仅公募基金）
        fund_dict = {}  # 基金代码->基金信息
        for item in items:
            code, pinyin, name, fund_type, company = item
            for keyword, full_name in self.public_fund_companies.items():
                if keyword in name:
                    fund_dict[code] = {
                        'code': code,
                        'name': name,
                        'type': fund_type,
                        'company': full_name,
                        'keyword': keyword
                    }
                    break

        self.fund_list = list(fund_dict.values())

        # 统计各基金公司数量
        company_count = defaultdict(int)
        for fund in self.fund_list:
            company_count[fund['company']] += 1

        print(f"筛选出目标基金 {len(self.fund_list)} 只:")
        for company, count in company_count.items():
            print(f"  - {company}: {count} 只")

        return True

    def get_fund_holdings(self, max_funds=None):
        """获取基金持仓股票"""
        print("\n" + "=" * 60)
        print("步骤2: 获取基金持仓股票")
        print("=" * 60)

        funds_to_process = self.fund_list[:max_funds] if max_funds else self.fund_list
        total = len(funds_to_process)

        for i, fund in enumerate(funds_to_process):
            if (i + 1) % 50 == 0 or i == 0:
                print(f"正在处理: {i+1}/{total} - {fund['name']}")

            holdings = self._get_single_fund_holdings(fund['code'])
            if holdings:
                for holding in holdings:
                    stock_code = holding['stock_code']
                    self.stock_holders[stock_code].append({
                        'stock_name': holding['stock_name'],
                        'fund_code': fund['code'],
                        'fund_name': fund['name'],
                        'fund_company': fund['company'],
                        'hold_shares': holding['hold_shares'],
                        'hold_ratio': holding['hold_ratio'],
                        'hold_value': holding['hold_value']
                    })

            # 添加延时避免请求过快
            time.sleep(0.2)

        # 统计涉及的股票数量
        print(f"\n获取到 {len(self.stock_holders)} 只股票的持仓信息")
        return True

    def _get_single_fund_holdings(self, fund_code):
        """获取单个基金的持仓股票"""
        url = 'https://fundf10.eastmoney.com/FundArchivesDatas.aspx'
        params = {
            'type': 'jjcc',
            'code': fund_code,
            'topline': '10',
            'year': '',
            'month': '',
            'rt': str(time.time())
        }
        headers = {
            'Referer': f'https://fundf10.eastmoney.com/ccmx_{fund_code}.html'
        }

        r = self.request_with_retry(url, params=params, headers=headers)
        if not r:
            return []

        r.encoding = 'utf-8'
        content = r.text

        if 'content' not in content or len(content) < 500:
            return []

        # 解析持仓数据
        holdings = []

        # 提取持仓数据
        # 表格格式: 排名, 股票代码, 股票名称, 最新价, 涨跌幅, 相关链接, 占净值比例, 持股数(万股), 持仓市值(万元)
        rows = re.findall(r"<tr>(.*?)</tr>", content, re.DOTALL)
        for row in rows:
            tds = re.findall(r"<td[^>]*>(.*?)</td>", row, re.DOTALL)
            if len(tds) >= 9:
                try:
                    # 提取股票代码 - 从a标签的href中提取完整的6位代码
                    code_match = re.search(r'href=[\'"]//quote\.eastmoney\.com/unify/r/[\d\.]+(\d{6})[\'"]', tds[1])
                    stock_code = code_match.group(1) if code_match else ''

                    # 提取股票名称 - 从tds[2]的a标签中提取
                    name_match = re.search(r'<a[^>]+>([^<]+)</a>', tds[2])
                    stock_name = name_match.group(1).strip() if name_match else re.sub(r'<[^>]+>', '', tds[2]).strip()

                    # 提取持仓数据
                    hold_ratio = re.sub(r'<[^>]+>', '', tds[6]).strip()
                    hold_shares = re.sub(r'<[^>]+>', '', tds[7]).strip()
                    hold_value = re.sub(r'<[^>]+>', '', tds[8]).strip()

                    if stock_code and stock_name:
                        holdings.append({
                            'stock_code': stock_code,
                            'stock_name': stock_name,
                            'hold_shares': hold_shares,
                            'hold_ratio': hold_ratio,
                            'hold_value': hold_value
                        })
                except Exception:
                    continue

        return holdings

    def get_stock_market_cap(self):
        """获取股票市值"""
        print("\n" + "=" * 60)
        print("步骤3: 获取股票市值")
        print("=" * 60)

        stock_codes = list(self.stock_holders.keys())
        total = len(stock_codes)
        print(f"需要获取 {total} 只股票的市值")

        # 使用新浪接口分批获取
        batch_size = 100
        for i in range(0, total, batch_size):
            batch = stock_codes[i:i+batch_size]
            if (i // batch_size + 1) % 5 == 0 or i == 0:
                print(f"正在处理: {min(i+batch_size, total)}/{total}")

            # 转换股票代码格式 (000001 -> sz000001 或 sh600000)
            codes_with_prefix = []
            for code in batch:
                if code.startswith('6'):
                    codes_with_prefix.append(f'sh{code}')
                else:
                    codes_with_prefix.append(f'sz{code}')

            # 使用腾讯接口获取市值
            self._get_market_cap_tencent(codes_with_prefix, batch)

            time.sleep(0.3)

        # 筛选市值>200亿的股票
        filtered_stocks = {k: v for k, v in self.stock_market_cap.items() if v >= 200}
        print(f"\n市值>=200亿的股票: {len(filtered_stocks)} 只")

        return filtered_stocks

    def _get_market_cap_tencent(self, codes_with_prefix, original_codes):
        """使用腾讯接口获取市值"""
        url = f"https://qt.gtimg.cn/q={','.join(codes_with_prefix)}"
        r = self.request_with_retry(url)
        if not r:
            return

        r.encoding = 'utf-8'
        lines = r.text.strip().split('\n')

        for i, line in enumerate(lines):
            try:
                if 'v_' not in line:
                    continue

                parts = line.split('~')
                if len(parts) >= 46:
                    code = original_codes[i] if i < len(original_codes) else parts[2]
                    total_mv = float(parts[45]) if parts[45] else 0
                    self.stock_market_cap[code] = total_mv
            except Exception:
                continue

    def get_stock_industry(self, stock_codes):
        """获取股票行业信息"""
        print("\n" + "=" * 60)
        print("步骤4: 获取股票行业信息")
        print("=" * 60)

        total = len(stock_codes)
        print(f"需要获取 {total} 只股票的行业信息")

        for i, code in enumerate(stock_codes):
            if (i + 1) % 50 == 0 or i == 0:
                print(f"正在处理: {i+1}/{total}")

            industry = self._get_single_stock_industry(code)
            if industry:
                self.stock_industry[code] = industry

            time.sleep(0.15)

        print(f"获取到 {len(self.stock_industry)} 只股票的行业信息")
        return True

    def get_jinglin_holdings(self, stock_codes):
        """从流通股东中获取景林基金的持仓（景林是私募，不在公募基金列表中）"""
        print("\n" + "=" * 60)
        print("步骤: 获取景林基金持仓（使用akshare从流通股东获取）")
        print("=" * 60)

        # 使用akshare获取股东持仓数据
        try:
            import akshare as ak
        except ImportError:
            print("请安装akshare: pip install akshare")
            return False

        from datetime import datetime, timedelta

        # 景林产品关键词
        jinglin_keywords = ['景林']

        total = len(stock_codes)
        print(f"需要扫描 {total} 只股票的流通股东")

        found_count = 0
        for i, code in enumerate(stock_codes):
            if (i + 1) % 50 == 0 or i == 0:
                print(f"正在处理: {i+1}/{total}")

            try:
                # 使用akshare获取流通股东数据
                df = ak.stock_circulate_stock_holder(symbol=code)
                if df is not None and len(df) > 0:
                    # 搜索所有历史数据中的景林持仓
                    jinglin_rows = df[df['股东名称'].apply(lambda x: any(kw in str(x) for kw in jinglin_keywords))]

                    if len(jinglin_rows) > 0:
                        # 获取最新一期的景林持仓记录
                        latest_row = jinglin_rows.iloc[0]
                        holder_name = str(latest_row.get('股东名称', ''))
                        latest_date = latest_row.get('截止日期', '')
                        hold_shares = str(latest_row.get('持股数量', ''))
                        hold_ratio = str(latest_row.get('占流通股比例', ''))

                        # 检查日期是否在最近2年内（私募持仓更新可能较慢）
                        should_skip = False
                        try:
                            if isinstance(latest_date, str):
                                report_date = datetime.strptime(latest_date, '%Y-%m-%d')
                            else:
                                # 可能是 datetime.date 或 pandas Timestamp
                                report_date = latest_date

                            # 如果是 date 对象，转换为 datetime
                            if hasattr(report_date, 'year') and not isinstance(report_date, datetime):
                                from datetime import date
                                if isinstance(report_date, date):
                                    report_date = datetime.combine(report_date, datetime.min.time())

                            # 只保留最近2年内的持仓（私募持仓披露可能较慢）
                            two_years_ago = datetime.now() - timedelta(days=730)
                            if report_date < two_years_ago:
                                # 超过2年，跳过
                                should_skip = True
                                print(f"  跳过过期持仓: {code} - {holder_name} ({latest_date})")
                        except Exception as date_err:
                            # 日期解析错误时不跳过，保留该记录
                            pass

                        if should_skip:
                            time.sleep(0.1)
                            continue

                        # 获取股票名称（从其他数据中）
                        stock_name = self.stock_holders.get(code, [{}])[0].get('stock_name', '') if code in self.stock_holders else ''

                        self.jinglin_stocks[code] = {
                            'holder_name': holder_name,
                            'hold_shares': hold_shares,
                            'hold_ratio': hold_ratio,
                            'latest_date': str(latest_date)
                        }
                        # 同时添加到stock_holders
                        self.stock_holders[code].append({
                            'stock_name': stock_name,
                            'fund_code': 'PRIVATE',
                            'fund_name': holder_name,
                            'fund_company': '景林基金',
                            'hold_shares': hold_shares,
                            'hold_ratio': hold_ratio,
                            'hold_value': ''
                        })
                        found_count += 1
                        print(f"  发现景林持仓: {code} - {holder_name} ({latest_date})")

            except Exception as e:
                # 某些股票可能没有数据
                pass

            time.sleep(0.1)

        print(f"找到 {found_count} 条景林持仓记录，涉及 {len(self.jinglin_stocks)} 只股票")
        return True

    def _get_stock_top_holders(self, stock_code):
        """获取股票的十大流通股东"""
        try:
            # 使用同花顺接口
            url = f'http://basic.10jqka.com.cn/{stock_code}/holder.html'
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            }
            r = self.session.get(url, headers=headers, timeout=10)
            r.encoding = 'gbk'

            if r.status_code != 200 or len(r.text) < 1000:
                return []

            # 解析十大流通股东
            soup = BeautifulSoup(r.text, 'html.parser')
            holders = []

            # 查找流通股东表格
            tables = soup.find_all('table')

            for table in tables:
                rows = table.find_all('tr')
                if len(rows) < 3:
                    continue

                # 获取整个表格的文本，检查是否是流通股东表格
                table_text = table.get_text()
                # 修改：检查'占流通股'而不是'期末持股'（同花顺页面格式不同）
                if '占流通股' not in table_text:
                    continue

                # 找到流通股东表格，解析数据
                for row in rows[1:11]:  # 前10个股东
                    # 获取所有单元格（包括th和td）
                    cells = row.find_all(['th', 'td'])
                    if len(cells) >= 4:
                        # 第一个单元格可能是th（股东名称）
                        name_cell = cells[0]
                        name = name_cell.get_text(strip=True)

                        # 跳过链接文本，只取股东名称
                        if len(name) > 50:
                            # 可能有嵌套内容，只取主体名称
                            name = name[:50]

                        shares = cells[1].get_text(strip=True)  # 持股数量
                        ratio = cells[3].get_text(strip=True)  # 占流通股比例

                        # 过滤无效数据
                        if name and name not in ['股东名称', '合计', '排名', '期末持股', '机构或基金名称'] and len(name) > 1:
                            holders.append({
                                'name': name,
                                'shares': shares,
                                'ratio': ratio
                            })

                if holders:
                    break

            return holders[:10]

        except Exception as e:
            return []

    def _get_single_stock_industry(self, stock_code):
        """获取单个股票的行业信息"""
        # 添加市场前缀
        if stock_code.startswith('6'):
            market_code = f'SH{stock_code}'
        else:
            market_code = f'SZ{stock_code}'

        url = 'https://emweb.eastmoney.com/PC_HSF10/CompanySurvey/CompanySurveyAjax'
        params = {'code': market_code}

        r = self.request_with_retry(url, params=params)
        if not r:
            return None

        try:
            data = r.json()
            if data and 'jbzl' in data:
                jbzl = data['jbzl']
                return {
                    'industry': jbzl.get('sshy', ''),
                    'industry_zjh': jbzl.get('sszjhhy', '')
                }
        except Exception:
            pass

        return None

    def generate_json(self, output_file='stock_data.json'):
        """生成JSON结果数据（供Web前端使用）"""
        print("\n" + "=" * 60)
        print("步骤: 生成JSON数据文件")
        print("=" * 60)

        # 筛选市值>=200亿的股票
        filtered_stocks = [code for code, cap in self.stock_market_cap.items() if cap >= 200]

        if not filtered_stocks:
            print("没有符合条件的股票")
            return None

        # 整理汇总数据
        summary_results = []
        for stock_code in filtered_stocks:
            holders = self.stock_holders.get(stock_code, [])
            if not holders:
                continue

            stock_name = holders[0].get('stock_name', '')
            market_cap = self.stock_market_cap.get(stock_code, 0)
            industry = self.stock_industry.get(stock_code, {})

            fund_names = []
            fund_companies = []
            hold_shares_list = []
            hold_ratio_list = []
            hold_value_list = []

            for h in holders:
                fund_names.append(h['fund_name'])
                if h['fund_company'] not in fund_companies:
                    fund_companies.append(h['fund_company'])
                hold_shares_list.append(h['hold_shares'])
                hold_ratio_list.append(h['hold_ratio'])
                hold_value_list.append(h['hold_value'])

            summary_results.append({
                '股票代码': stock_code,
                '股票名称': stock_name,
                '总市值亿': market_cap,
                '所属行业': industry.get('industry', ''),
                '证监会行业': industry.get('industry_zjh', ''),
                '持仓基金数量': len(fund_names),
                '持仓基金公司': '、'.join(fund_companies),
                '持仓基金列表': '、'.join(fund_names[:5]) + ('...' if len(fund_names) > 5 else ''),
                '合计持仓股数万股': ', '.join(hold_shares_list),
                '持仓比例合计': ', '.join(hold_ratio_list),
                '合计持仓市值万元': ', '.join(hold_value_list)
            })

        # 整理明细数据
        detail_results = []
        for stock_code in filtered_stocks:
            holders = self.stock_holders.get(stock_code, [])
            if not holders:
                continue

            stock_name = holders[0].get('stock_name', '')
            market_cap = self.stock_market_cap.get(stock_code, 0)
            industry = self.stock_industry.get(stock_code, {})

            for h in holders:
                detail_results.append({
                    '股票代码': stock_code,
                    '股票名称': h.get('stock_name', stock_name),
                    '总市值亿': market_cap,
                    '所属行业': industry.get('industry', ''),
                    '证监会行业': industry.get('industry_zjh', ''),
                    '持仓基金': h['fund_name'],
                    '基金公司': h['fund_company'],
                    '持仓股数万股': h['hold_shares'],
                    '持仓比例': h['hold_ratio'],
                    '持仓市值万元': h['hold_value']
                })

        # 当前时间
        now = datetime.now()
        date_str = now.strftime('%Y-%m-%d')
        time_str = now.strftime('%Y-%m-%d %H:%M:%S')

        # 组装JSON数据
        json_data = {
            'date': date_str,
            'updateTime': time_str,
            'summary': summary_results,
            'detail': detail_results
        }

        # 保存JSON文件
        import json

        # 1. 保存带日期的历史文件
        date_file = f'stock_data_{date_str}.json'
        with open(date_file, 'w', encoding='utf-8') as f:
            json.dump(json_data, f, ensure_ascii=False, indent=2)
        print(f"历史数据已保存到: {date_file}")

        # 2. 保存最新数据文件（覆盖）
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(json_data, f, ensure_ascii=False, indent=2)
        print(f"最新数据已保存到: {output_file}")

        print(f"汇总数据: {len(summary_results)} 条")
        print(f"明细数据: {len(detail_results)} 条")

        return output_file, date_file

    def generate_excel(self, output_file='stock_filter_result.xlsx'):
        """生成Excel结果"""
        print("\n" + "=" * 60)
        print("步骤5: 生成Excel结果")
        print("=" * 60)

        # 筛选市值>=200亿的股票
        filtered_stocks = [code for code, cap in self.stock_market_cap.items() if cap >= 200]

        if not filtered_stocks:
            print("没有符合条件的股票")
            return None

        # 整理数据 - 明细表
        detail_results = []
        # 整理数据 - 汇总表
        summary_results = []

        for stock_code in filtered_stocks:
            holders = self.stock_holders.get(stock_code, [])
            if not holders:
                continue

            # 获取股票名称和市值
            stock_name = holders[0].get('stock_name', '')
            market_cap = self.stock_market_cap.get(stock_code, 0)
            industry = self.stock_industry.get(stock_code, {})

            # 收集持仓基金信息
            fund_names = []
            fund_companies = []
            hold_shares_list = []
            hold_ratio_list = []
            hold_value_list = []

            # 添加每条持仓记录到明细表
            for h in holders:
                fund_names.append(h['fund_name'])
                if h['fund_company'] not in fund_companies:
                    fund_companies.append(h['fund_company'])
                hold_shares_list.append(h['hold_shares'])
                hold_ratio_list.append(h['hold_ratio'])
                hold_value_list.append(h['hold_value'])

                detail_results.append({
                    '股票代码': stock_code,
                    '股票名称': h.get('stock_name', stock_name),
                    '总市值(亿)': market_cap,
                    '所属行业': industry.get('industry', ''),
                    '证监会行业': industry.get('industry_zjh', ''),
                    '持仓基金': h['fund_name'],
                    '基金公司': h['fund_company'],
                    '持仓股数(万股)': h['hold_shares'],
                    '持仓比例(%)': h['hold_ratio'],
                    '持仓市值(万元)': h['hold_value']
                })

            # 添加汇总记录
            summary_results.append({
                '股票代码': stock_code,
                '股票名称': stock_name,
                '总市值(亿)': market_cap,
                '所属行业': industry.get('industry', ''),
                '证监会行业': industry.get('industry_zjh', ''),
                '持仓基金数量': len(fund_names),
                '持仓基金公司': '、'.join(fund_companies),
                '持仓基金列表': '、'.join(fund_names[:5]) + ('...' if len(fund_names) > 5 else ''),
                '合计持仓股数(万股)': ', '.join(hold_shares_list),
                '持仓比例合计': ', '.join(hold_ratio_list),
                '合计持仓市值(万元)': ', '.join(hold_value_list)
            })

        if not detail_results:
            print("没有符合条件的股票")
            return None

        # 创建明细DataFrame
        df_detail = pd.DataFrame(detail_results)
        df_detail = df_detail.sort_values('总市值(亿)', ascending=False)

        # 创建汇总DataFrame
        df_summary = pd.DataFrame(summary_results)
        df_summary = df_summary.sort_values('总市值(亿)', ascending=False)

        # 保存Excel（多Sheet）
        with pd.ExcelWriter(output_file, engine='openpyxl') as writer:
            df_summary.to_excel(writer, sheet_name='汇总表', index=False)
            df_detail.to_excel(writer, sheet_name='明细表', index=False)

        print(f"\n结果已保存到: {output_file}")
        print(f"汇总表: {len(df_summary)} 只股票")
        print(f"明细表: {len(df_detail)} 条记录")

        # 打印摘要
        print("\n" + "=" * 60)
        print("筛选结果摘要")
        print("=" * 60)
        print(f"总市值>=200亿的股票数: {len(filtered_stocks)}")
        print(f"涉及基金公司: {', '.join(df_summary['持仓基金公司'].unique())}")

        # 按基金公司统计
        company_stocks = {}
        for _, row in df_summary.iterrows():
            for company in row['持仓基金公司'].split('、'):
                if company not in company_stocks:
                    company_stocks[company] = []
                if row['股票名称'] not in company_stocks[company]:
                    company_stocks[company].append(row['股票名称'])

        print("\n各基金公司持仓股票数量:")
        for company, stocks in company_stocks.items():
            print(f"  {company}: {len(stocks)} 只")

        print(f"\n前10只股票(按市值排序):")
        for i, row in df_summary.head(10).iterrows():
            print(f"  {row['股票代码']} {row['股票名称']} 市值:{row['总市值(亿)']}亿 行业:{row['所属行业']} 基金数:{row['持仓基金数量']}")

        return output_file

    def run(self, max_funds=None):
        """运行完整流程"""
        print("\n" + "=" * 60)
        print(f"股票筛选脚本 - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print("=" * 60)
        print("说明: 华夏、易方达、中欧为公募基金，从基金持仓获取")
        print("      景林为私募基金，从股票十大流通股东获取")
        print("=" * 60)

        start_time = time.time()

        # 1. 获取目标公募基金列表
        if not self.get_target_funds():
            return None

        # 2. 获取公募基金持仓股票
        if not self.get_fund_holdings(max_funds):
            return None

        # 3. 获取股票市值
        self.get_stock_market_cap()

        # 4. 筛选市值>=200亿的股票
        filtered_stocks = [k for k, v in self.stock_market_cap.items() if v >= 200]
        if not filtered_stocks:
            print("没有市值>=200亿的股票")
            return None

        # 5. 获取股票行业
        self.get_stock_industry(filtered_stocks)

        # 6. 获取景林基金持仓（从十大流通股东）
        self.get_jinglin_holdings(filtered_stocks)

        # 7. 生成Excel
        output_file = f'stock_filter_{datetime.now().strftime("%Y%m%d_%H%M%S")}.xlsx'
        self.generate_excel(output_file)

        # 8. 生成JSON数据（供Web前端使用）
        json_file = 'stock_data.json'
        self.generate_json(json_file)

        elapsed = time.time() - start_time
        print(f"\n总耗时: {elapsed:.1f} 秒")

        return output_file


if __name__ == '__main__':
    # 创建筛选器
    filter_tool = StockFilter()

    # 运行 (max_funds=None 表示处理全部基金，可设置如 max_funds=50 测试)
    filter_tool.run(max_funds=None)
