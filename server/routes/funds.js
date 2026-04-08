/**
 * 资金汇总、趋势和收益率计算路由
 * 职责：
 * - 提供首页资金汇总数据
 * - 计算总资产趋势
 * - 提供分类详情和收益率计算
 * - 提醒今日待录入账户
 */

import { Router } from 'express';
import db from '../db/index.js';

const router = Router();

/**
 * GET /summary
 * 用途：首页汇总
 * 计算各一级分类的总金额（包括子分类下的所有账户）
 * 返回：{ total_amount, categories: [{ id, name, amount }] }
 */
router.get('/summary', (req, res) => {
  try {
    const userId = req.userId;

    // 获取所有一级分类
    const categories = db.prepare(`
      SELECT id, name FROM dict_categories WHERE parent_id IS NULL ORDER BY sort_order
    `).all();

    // 计算每个一级分类的总金额
    const categoryAmounts = categories.map(cat => {
      // 获取该分类及其子分类下的所有账户
      const childIds = db.prepare(`
        SELECT id FROM dict_categories WHERE parent_id = ?
      `).all(cat.id).map(c => c.id);
      
      const allCategoryIds = [cat.id, ...childIds];
      const placeholders = allCategoryIds.map(() => '?').join(',');

      const result = db.prepare(`
        SELECT COALESCE(SUM(current_amount), 0) as amount
        FROM fund_accounts
        WHERE user_id = ? AND dict_category_id IN (${placeholders})
      `).get(userId, ...allCategoryIds);

      return {
        id: cat.id,
        name: cat.name,
        amount: Math.round(result.amount * 100) / 100
      };
    });

    const totalAmount = categoryAmounts.reduce((sum, cat) => sum + cat.amount, 0);

    // 计算当天入金出金的净变化
    const todayChangeResult = db.prepare(`
      SELECT 
        COALESCE(SUM(CASE WHEN t.type = 'deposit' THEN t.amount ELSE 0 END), 0) as total_deposit,
        COALESCE(SUM(CASE WHEN t.type = 'withdraw' THEN t.amount ELSE 0 END), 0) as total_withdraw
      FROM fund_transactions t
      JOIN fund_accounts a ON t.account_id = a.id
      WHERE a.user_id = ? AND t.transaction_date = date('now')
    `).get(userId);

    const totalChangeToday = Math.round(
      (todayChangeResult.total_deposit - todayChangeResult.total_withdraw) * 100
    ) / 100;

    res.json({
      total_amount: Math.round(totalAmount * 100) / 100,
      total_change_today: totalChangeToday,
      categories: categoryAmounts
    });
  } catch (error) {
    console.error('获取汇总数据失败:', error);
    res.status(500).json({ error: '获取汇总数据失败' });
  }
});

/**
 * GET /total-trend
 * 用途：总资产趋势
 * 查询参数：?days=7|30|90|365|all
 * 聚合所有账户的每日总金额（前向填充：使用每个账户的最新已知余额）
 * days >= 365 或 all 时按月聚合，days >= 90 时按周聚合，其余按天
 * 返回：[{ date, total_amount }]
 */
router.get('/total-trend', (req, res) => {
  try {
    const { days = 30 } = req.query;
    const userId = req.userId;
    const daysNum = days === 'all' ? null : (parseInt(days) || 30);

    // 获取用户的所有账户（含 current_amount，用于无每日记录时的兜底）
    const accounts = db.prepare(`
      SELECT id, current_amount FROM fund_accounts WHERE user_id = ?
    `).all(userId);

    if (accounts.length === 0) {
      return res.json([]);
    }

    const accountIds = accounts.map(a => a.id);
    const placeholders = accountIds.map(() => '?').join(',');

    // 构建日期过滤条件
    const dateCondition = daysNum === null
      ? ''
      : `AND record_date >= date('now', '-${daysNum} days')`;

    // 获取所有账户在日期范围内的每日记录，按账户和日期排序
    const allRecords = db.prepare(`
      SELECT account_id, record_date as date, amount
      FROM fund_daily_records
      WHERE account_id IN (${placeholders})
        ${dateCondition}
      ORDER BY account_id, record_date ASC
    `).all(...accountIds);

    // 按账户分组记录
    const accountRecordMap = {};
    for (const record of allRecords) {
      if (!accountRecordMap[record.account_id]) {
        accountRecordMap[record.account_id] = [];
      }
      accountRecordMap[record.account_id].push({ date: record.date, amount: record.amount });
    }

    // 初始化每个账户的最新已知余额：
    // 优先用日期范围之前的最后一条每日记录，其次用 current_amount 兜底
    const latestAmounts = {};
    for (const acc of accounts) {
      latestAmounts[acc.id] = acc.current_amount || 0;
    }
    if (daysNum !== null) {
      const initialRecords = db.prepare(`
        SELECT fdr.account_id, fdr.amount
        FROM fund_daily_records fdr
        INNER JOIN (
          SELECT account_id, MAX(record_date) as max_date
          FROM fund_daily_records
          WHERE account_id IN (${placeholders})
            AND record_date < date('now', '-${daysNum} days')
          GROUP BY account_id
        ) latest ON fdr.account_id = latest.account_id AND fdr.record_date = latest.max_date
        WHERE fdr.account_id IN (${placeholders})
      `).all(...accountIds, ...accountIds);

      for (const record of initialRecords) {
        latestAmounts[record.account_id] = record.amount;
      }
    }

    // 获取所有出现过的日期（排序）
    const allDates = [...new Set(allRecords.map(r => r.date))].sort();

    if (allDates.length === 0) {
      // 无每日记录时，返回当前总额作为唯一数据点
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
      const total = accountIds.reduce((sum, aid) => sum + (latestAmounts[aid] || 0), 0);
      return res.json([{ date: todayStr, total_amount: Math.round(total * 100) / 100 }]);
    }

    // 前向填充：为每个日期计算所有账户的最新已知金额总和
    const accountPtrs = {};
    for (const aid of accountIds) {
      accountPtrs[aid] = -1;
    }

    const dailyTotals = allDates.map(date => {
      let total = 0;
      for (const aid of accountIds) {
        const records = accountRecordMap[aid] || [];
        // 推进指针到 <= date 的最后一条记录
        while (accountPtrs[aid] + 1 < records.length && records[accountPtrs[aid] + 1].date <= date) {
          accountPtrs[aid]++;
          latestAmounts[aid] = records[accountPtrs[aid]].amount;
        }
        total += latestAmounts[aid];
      }
      return { date, total_amount: Math.round(total * 100) / 100 };
    });

    // 根据时间范围决定聚合粒度
    let formattedTrends;
    if (daysNum === null || daysNum >= 365) {
      // 按月聚合 - 取每月最后一个数据点
      const monthMap = new Map();
      for (const item of dailyTotals) {
        const monthKey = item.date.substring(0, 7);
        monthMap.set(monthKey, { date: monthKey, total_amount: item.total_amount });
      }
      formattedTrends = Array.from(monthMap.values()).sort((a, b) => a.date.localeCompare(b.date));
    } else if (daysNum >= 90) {
      // 按周聚合 - 取每周最后一个数据点
      const weekMap = new Map();
      for (const item of dailyTotals) {
        const weekKey = _getWeekKey(item.date);
        weekMap.set(weekKey, item);
      }
      formattedTrends = Array.from(weekMap.values()).sort((a, b) => a.date.localeCompare(b.date));
    } else {
      formattedTrends = dailyTotals;
    }

    // 只在按天聚合时补充今日快照
    if (daysNum !== null && daysNum < 90) {
      // 使用本地时间计算今日日期字符串
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;

      // 计算所有账户的当前实际总额
      const currentTotal = db.prepare(`
        SELECT COALESCE(SUM(current_amount), 0) as total
        FROM fund_accounts WHERE user_id = ?
      `).get(userId);

      // 补充/修正今日数据点
      const todayIdx = formattedTrends.findIndex(t => t.date === todayStr);
      if (todayIdx >= 0) {
        // 已有今日数据但可能不完整，用实际总额替换
        formattedTrends[todayIdx].total_amount = Math.round(currentTotal.total * 100) / 100;
      } else {
        // 没有今日数据，添加
        formattedTrends.push({
          date: todayStr,
          total_amount: Math.round(currentTotal.total * 100) / 100,
        });
      }

      // 确保按日期升序排列
      formattedTrends.sort((a, b) => a.date.localeCompare(b.date));
    }

    res.json(formattedTrends);
  } catch (error) {
    console.error('获取总资产趋势失败:', error);
    res.status(500).json({ error: '获取总资产趋势失败' });
  }
});

/**
 * GET /category/:id/detail
 * 用途：分类详情
 * 返回该一级分类下的二级分类明细和账户信息
 * 返回：{ id, name, total_amount, trend: [...], children: [{ id, name, accounts: [{ id, name, current_amount, daily_change }] }] }
 * 对于没有二级分类的一级分类（如活钱），直接返回该分类下的账户
 */
router.get('/category/:id/detail', (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;

    // 获取分类信息
    const category = db.prepare(`
      SELECT id, name FROM dict_categories WHERE id = ? AND parent_id IS NULL
    `).get(id);

    if (!category) {
      return res.status(404).json({ error: '分类不存在' });
    }

    // 获取子分类
    const childCategories = db.prepare(`
      SELECT id, name FROM dict_categories WHERE parent_id = ? ORDER BY sort_order
    `).all(id);

    // 获取该分类及其子分类下的所有账户
    const allCategoryIds = [parseInt(id), ...childCategories.map(c => c.id)];
    const placeholders = allCategoryIds.map(() => '?').join(',');

    const accounts = db.prepare(`
      SELECT 
        fa.id,
        fa.name,
        fa.dict_category_id,
        fa.current_amount,
        dc.name as category_name
      FROM fund_accounts fa
      LEFT JOIN dict_categories dc ON fa.dict_category_id = dc.id
      WHERE fa.user_id = ? AND fa.dict_category_id IN (${placeholders})
    `).all(userId, ...allCategoryIds);

    // 获取趋势数据，支持 days 参数（默认7天）
    const { days = 7 } = req.query;
    const daysNum = days === 'all' ? null : (parseInt(days) || 7);

    const accountIds = accounts.map(a => a.id);
    let trend = [];
    if (accountIds.length > 0) {
      const accountPlaceholders = accountIds.map(() => '?').join(',');

      // 根据时间范围决定聚合粒度
      let groupBy, dateFormat;
      if (daysNum === null || daysNum >= 365) {
        groupBy = "strftime('%Y-%m', record_date)";
        dateFormat = "strftime('%Y-%m', record_date)";
      } else if (daysNum >= 90) {
        groupBy = "strftime('%Y-%W', record_date)";
        dateFormat = "MIN(record_date)";
      } else {
        groupBy = 'record_date';
        dateFormat = 'record_date';
      }

      const dateCondition = daysNum === null
        ? ''
        : `AND record_date >= date('now', '-${daysNum} days')`;

      trend = db.prepare(`
        SELECT 
          ${dateFormat} as date,
          SUM(amount) as total_amount
        FROM fund_daily_records
        WHERE account_id IN (${accountPlaceholders})
          ${dateCondition}
        GROUP BY ${groupBy}
        ORDER BY date ASC
      `).all(...accountIds);
    }

    // 获取每个账户的最新 daily_change
    const accountsWithChange = accounts.map(acc => {
      const latestRecord = db.prepare(`
        SELECT daily_change FROM fund_daily_records
        WHERE account_id = ?
        ORDER BY record_date DESC
        LIMIT 1
      `).get(acc.id);

      return {
        id: acc.id,
        name: acc.name,
        current_amount: Math.round(acc.current_amount * 100) / 100,
        daily_change: Math.round((latestRecord?.daily_change || 0) * 100) / 100,
        dict_category_id: acc.dict_category_id
      };
    });

    // 构建 children 结构
    let children = [];
    if (childCategories.length > 0) {
      // 有子分类，按子分类组织
      children = childCategories.map(child => ({
        id: child.id,
        name: child.name,
        accounts: accountsWithChange.filter(acc => acc.dict_category_id === child.id)
      }));
    } else {
      // 没有子分类，直接返回该分类下的账户
      children = [{
        id: category.id,
        name: category.name,
        accounts: accountsWithChange.filter(acc => acc.dict_category_id === category.id)
      }];
    }

    const totalAmount = accounts.reduce((sum, acc) => sum + acc.current_amount, 0);

    // 格式化 trend 数据
    let formattedTrend = trend.map(t => ({
      date: t.date,
      total_amount: Math.round(t.total_amount * 100) / 100
    }));

    // 只在按天聚合时补充今日快照
    if (daysNum !== null && daysNum < 90) {
      // 使用本地时间计算今日日期字符串
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;

      const todayIdx = formattedTrend.findIndex(t => t.date === todayStr);
      if (todayIdx >= 0) {
        formattedTrend[todayIdx].total_amount = Math.round(totalAmount * 100) / 100;
      } else {
        formattedTrend.push({
          date: todayStr,
          total_amount: Math.round(totalAmount * 100) / 100,
        });
      }

      // 确保按日期升序排列
      formattedTrend.sort((a, b) => a.date.localeCompare(b.date));
    }

    res.json({
      id: category.id,
      name: category.name,
      total_amount: Math.round(totalAmount * 100) / 100,
      trend: formattedTrend,
      children
    });
  } catch (error) {
    console.error('获取分类详情失败:', error);
    res.status(500).json({ error: '获取分类详情失败' });
  }
});

/**
 * GET /category/:id/returns
 * 用途：理财类收益率（多维度）
 * 计算该分类下所有账户的汇总收益率
 * 返回维度：
 * {
 *   "daily": { "change": 50.2, "rate": 0.07 },
 *   "weekly": { "change": 320.5, "rate": 0.45 },
 *   "monthly": { "change": 1200.0, "rate": 1.68 },
 *   "total": { "change": 5600.0, "rate": 8.5 },
 *   "annualized": 12.3
 * }
 * 
 * 算法：
 * - 当日收益率 = daily_change / (amount - daily_change) * 100
 * - 近7/30日收益 = SUM(对应天数内的 daily_change)
 * - 近N日收益率 = 近N日收益 / N天前持仓金额 * 100
 * - 累计收益 = SUM(所有 daily_change)
 * - 累计收益率 = 累计收益 / 首次录入金额 * 100
 * - 年化收益率 = ((1 + 累计收益率/100)^(365/持仓天数) - 1) * 100
 */
router.get('/category/:id/returns', (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;

    // 获取分类信息
    const category = db.prepare(`
      SELECT id, name FROM dict_categories WHERE id = ?
    `).get(id);

    if (!category) {
      return res.status(404).json({ error: '分类不存在' });
    }

    // 获取该分类及其子分类下的所有账户
    const childIds = db.prepare(`
      SELECT id FROM dict_categories WHERE parent_id = ?
    `).all(id).map(c => c.id);
    
    const allCategoryIds = [parseInt(id), ...childIds];
    const placeholders = allCategoryIds.map(() => '?').join(',');

    const accounts = db.prepare(`
      SELECT id FROM fund_accounts
      WHERE user_id = ? AND dict_category_id IN (${placeholders})
    `).all(userId, ...allCategoryIds);

    if (accounts.length === 0) {
      return res.json({
        daily: { change: 0, rate: 0 },
        weekly: { change: 0, rate: 0 },
        monthly: { change: 0, rate: 0 },
        total: { change: 0, rate: 0 },
        annualized: 0
      });
    }

    const accountIds = accounts.map(a => a.id);
    const accountPlaceholders = accountIds.map(() => '?').join(',');

    // 获取今日数据
    const todayData = db.prepare(`
      SELECT 
        SUM(amount) as total_amount,
        SUM(daily_change) as total_change
      FROM fund_daily_records
      WHERE account_id IN (${accountPlaceholders})
        AND record_date = date('now')
    `).get(...accountIds);

    // 获取7天前数据
    const weekAgoData = db.prepare(`
      SELECT SUM(amount) as total_amount
      FROM fund_daily_records
      WHERE account_id IN (${accountPlaceholders})
        AND record_date = date('now', '-7 days')
    `).get(...accountIds);

    // 获取30天前数据
    const monthAgoData = db.prepare(`
      SELECT SUM(amount) as total_amount
      FROM fund_daily_records
      WHERE account_id IN (${accountPlaceholders})
        AND record_date = date('now', '-30 days')
    `).get(...accountIds);

    // 获取首次记录数据
    const firstRecord = db.prepare(`
      SELECT 
        MIN(record_date) as first_date,
        SUM(amount) as first_amount
      FROM fund_daily_records
      WHERE account_id IN (${accountPlaceholders})
        AND record_date = (
          SELECT MIN(record_date) FROM fund_daily_records
          WHERE account_id IN (${accountPlaceholders})
        )
    `).get(...accountIds, ...accountIds);

    // 获取累计收益（所有 daily_change 的总和）
    const totalChangeResult = db.prepare(`
      SELECT SUM(daily_change) as total_change
      FROM fund_daily_records
      WHERE account_id IN (${accountPlaceholders})
    `).get(...accountIds);

    // 计算各项指标
    const todayAmount = todayData?.total_amount || 0;
    const todayChange = todayData?.total_change || 0;
    const weekAgoAmount = weekAgoData?.total_amount || 0;
    const monthAgoAmount = monthAgoData?.total_amount || 0;
    const firstAmount = firstRecord?.first_amount || 0;
    const totalChange = totalChangeResult?.total_change || 0;

    // 当日收益率
    const dailyRate = todayAmount > 0 && (todayAmount - todayChange) > 0
      ? (todayChange / (todayAmount - todayChange)) * 100
      : 0;

    // 近7日收益和收益率
    const weeklyChange = weekAgoAmount > 0 ? todayAmount - weekAgoAmount : 0;
    const weeklyRate = weekAgoAmount > 0 ? (weeklyChange / weekAgoAmount) * 100 : 0;

    // 近30日收益和收益率
    const monthlyChange = monthAgoAmount > 0 ? todayAmount - monthAgoAmount : 0;
    const monthlyRate = monthAgoAmount > 0 ? (monthlyChange / monthAgoAmount) * 100 : 0;

    // 累计收益率
    const totalRate = firstAmount > 0 ? (totalChange / firstAmount) * 100 : 0;

    // 年化收益率
    let annualized = 0;
    if (firstRecord?.first_date && firstAmount > 0) {
      const firstDate = new Date(firstRecord.first_date);
      const now = new Date();
      const daysHeld = Math.max(1, Math.floor((now - firstDate) / (1000 * 60 * 60 * 24)));
      
      if (daysHeld >= 1) {
        const totalReturn = totalRate / 100;
        annualized = (Math.pow(1 + totalReturn, 365 / daysHeld) - 1) * 100;
      }
    }

    res.json({
      daily: {
        change: Math.round(todayChange * 100) / 100,
        rate: Math.round(dailyRate * 100) / 100
      },
      weekly: {
        change: Math.round(weeklyChange * 100) / 100,
        rate: Math.round(weeklyRate * 100) / 100
      },
      monthly: {
        change: Math.round(monthlyChange * 100) / 100,
        rate: Math.round(monthlyRate * 100) / 100
      },
      total: {
        change: Math.round(totalChange * 100) / 100,
        rate: Math.round(totalRate * 100) / 100
      },
      annualized: Math.round(annualized * 100) / 100
    });
  } catch (error) {
    console.error('获取收益率失败:', error);
    res.status(500).json({ error: '获取收益率失败' });
  }
});

/**
 * GET /category/:id/earnings-trend
 * 用途：理财分类收益趋势（每日收益金额 + 累计收益）
 * 查询参数：?days=30|90|365|all
 * 聚合该分类下所有账户的 daily_change，按日期分组
 * 返回：[{ date, daily_change, cumulative_change }]
 */
router.get('/category/:id/earnings-trend', (req, res) => {
  try {
    const { id } = req.params;
    const { days = 30 } = req.query;
    const userId = req.userId;
    const daysNum = days === 'all' ? null : (parseInt(days) || 30);

    // 获取分类信息
    const category = db.prepare(`
      SELECT id, name FROM dict_categories WHERE id = ?
    `).get(id);

    if (!category) {
      return res.status(404).json({ error: '分类不存在' });
    }

    // 获取该分类及子分类下的所有账户
    const childIds = db.prepare(`
      SELECT id FROM dict_categories WHERE parent_id = ?
    `).all(id).map(c => c.id);

    const allCategoryIds = [parseInt(id), ...childIds];
    const placeholders = allCategoryIds.map(() => '?').join(',');

    const accounts = db.prepare(`
      SELECT id FROM fund_accounts
      WHERE user_id = ? AND dict_category_id IN (${placeholders})
    `).all(userId, ...allCategoryIds);

    if (accounts.length === 0) {
      return res.json([]);
    }

    const accountIds = accounts.map(a => a.id);
    const accountPlaceholders = accountIds.map(() => '?').join(',');

    // 构建日期过滤
    const dateCondition = daysNum === null
      ? ''
      : `AND record_date >= date('now', '-${daysNum} days')`;

    // 查询每日收益汇总
    const records = db.prepare(`
      SELECT
        record_date as date,
        SUM(daily_change) as daily_change
      FROM fund_daily_records
      WHERE account_id IN (${accountPlaceholders})
        ${dateCondition}
      GROUP BY record_date
      ORDER BY record_date ASC
    `).all(...accountIds);

    // 计算累计收益
    let cumulative = 0;
    const trend = records.map(r => {
      cumulative += r.daily_change;
      return {
        date: r.date,
        daily_change: Math.round(r.daily_change * 100) / 100,
        cumulative_change: Math.round(cumulative * 100) / 100,
      };
    });

    // 根据时间范围聚合（与总趋势逻辑一致）
    let formattedTrend;
    if (daysNum === null || daysNum >= 365) {
      // 按月聚合
      const monthMap = new Map();
      for (const item of trend) {
        const monthKey = item.date.substring(0, 7);
        const existing = monthMap.get(monthKey);
        if (existing) {
          existing.daily_change = Math.round((existing.daily_change + item.daily_change) * 100) / 100;
          existing.cumulative_change = item.cumulative_change; // 取月末的累计值
        } else {
          monthMap.set(monthKey, { ...item, date: monthKey });
        }
      }
      formattedTrend = Array.from(monthMap.values()).sort((a, b) => a.date.localeCompare(b.date));
    } else if (daysNum >= 90) {
      // 按周聚合
      const weekMap = new Map();
      for (const item of trend) {
        const weekKey = _getWeekKey(item.date);
        const existing = weekMap.get(weekKey);
        if (existing) {
          existing.daily_change = Math.round((existing.daily_change + item.daily_change) * 100) / 100;
          existing.cumulative_change = item.cumulative_change; // 取周末的累计值
        } else {
          weekMap.set(weekKey, { ...item, date: weekKey });
        }
      }
      formattedTrend = Array.from(weekMap.values()).sort((a, b) => a.date.localeCompare(b.date));
    } else {
      formattedTrend = trend;
    }

    res.json(formattedTrend);
  } catch (error) {
    console.error('获取收益趋势失败:', error);
    res.status(500).json({ error: '获取收益趋势失败' });
  }
});

/**
 * GET /subcategory/:subId/detail
 * 用途：子分类详情
 * 验证子分类存在且是二级分类，返回该子分类的账户列表、总金额和趋势数据
 * 返回：{ id, name, parent_id, parent_name, total_amount, accounts: [...], trend: [...] }
 */
router.get('/subcategory/:subId/detail', (req, res) => {
  try {
    const { subId } = req.params;
    const userId = req.userId;

    // 验证子分类存在且是二级分类（parent_id 不为空）
    const subCategory = db.prepare(`
      SELECT dc.id, dc.name, dc.parent_id, p.name as parent_name
      FROM dict_categories dc
      JOIN dict_categories p ON dc.parent_id = p.id
      WHERE dc.id = ? AND dc.parent_id IS NOT NULL
    `).get(subId);

    if (!subCategory) {
      return res.status(404).json({ error: '子分类不存在或不是二级分类' });
    }

    // 查询该子分类下所有账户及其最新每日记录的 daily_change
    const accounts = db.prepare(`
      SELECT 
        fa.id, fa.name, fa.current_amount,
        COALESCE(
          (SELECT daily_change FROM fund_daily_records 
           WHERE account_id = fa.id ORDER BY record_date DESC LIMIT 1), 
          0
        ) as daily_change
      FROM fund_accounts fa
      WHERE fa.dict_category_id = ? AND fa.user_id = ?
      ORDER BY fa.created_at ASC
    `).all(subCategory.id, userId);

    // 计算该子分类的总金额
    const totalAmount = accounts.reduce((sum, acc) => sum + acc.current_amount, 0);

    // 查询趋势数据，支持 days 参数（默认30天）
    const { days = 30 } = req.query;
    const daysNum = days === 'all' ? null : (parseInt(days) || 30);

    // 根据时间范围决定聚合粒度
    let groupBy, dateFormat;
    if (daysNum === null || daysNum >= 365) {
      groupBy = "strftime('%Y-%m', fdr.record_date)";
      dateFormat = "strftime('%Y-%m', fdr.record_date)";
    } else if (daysNum >= 90) {
      groupBy = "strftime('%Y-%W', fdr.record_date)";
      dateFormat = "MIN(fdr.record_date)";
    } else {
      groupBy = 'fdr.record_date';
      dateFormat = 'fdr.record_date';
    }

    const dateCondition = daysNum === null
      ? ''
      : `AND fdr.record_date >= date('now', '-${daysNum} days')`;

    let trend = db.prepare(`
      SELECT 
        ${dateFormat} as date,
        SUM(fdr.amount) as total_amount
      FROM fund_daily_records fdr
      JOIN fund_accounts fa ON fdr.account_id = fa.id
      WHERE fa.dict_category_id = ? AND fa.user_id = ?
        ${dateCondition}
      GROUP BY ${groupBy}
      ORDER BY date ASC
    `).all(subCategory.id, userId);

    // 格式化 trend 数据
    let formattedTrend = trend.map(t => ({
      date: t.date,
      total_amount: Math.round(t.total_amount * 100) / 100
    }));

    // 只在按天聚合时补充今日快照
    if (daysNum !== null && daysNum < 90) {
      // 使用本地时间计算今日日期字符串
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;

      const todayIdx = formattedTrend.findIndex(t => t.date === todayStr);
      if (todayIdx >= 0) {
        formattedTrend[todayIdx].total_amount = Math.round(totalAmount * 100) / 100;
      } else {
        formattedTrend.push({
          date: todayStr,
          total_amount: Math.round(totalAmount * 100) / 100,
        });
      }

      // 确保按日期升序排列
      formattedTrend.sort((a, b) => a.date.localeCompare(b.date));
    }

    res.json({
      id: subCategory.id,
      name: subCategory.name,
      parent_id: subCategory.parent_id,
      parent_name: subCategory.parent_name,
      total_amount: Math.round(totalAmount * 100) / 100,
      accounts: accounts.map(acc => ({
        id: acc.id,
        name: acc.name,
        current_amount: Math.round(acc.current_amount * 100) / 100,
        daily_change: Math.round(acc.daily_change * 100) / 100
      })),
      trend: formattedTrend
    });
  } catch (error) {
    console.error('获取子分类详情失败:', error);
    res.status(500).json({ error: '获取子分类详情失败' });
  }
});

/**
 * GET /reminders/today
 * 用途：获取今日待录入提醒
 * 查询 dict_categories 中"理财"(id=2) 下所有子分类关联的账户
 * 检查这些账户今日是否已有 fund_daily_records 记录
 * 返回：{ pending_count: N, accounts: [{ id, name }] }
 */
router.get('/reminders/today', (req, res) => {
  try {
    const userId = req.userId;

    // 获取理财分类(id=2)下的所有子分类
    const childCategories = db.prepare(`
      SELECT id FROM dict_categories WHERE parent_id = 2
    `).all();

    const categoryIds = [2, ...childCategories.map(c => c.id)];
    const placeholders = categoryIds.map(() => '?').join(',');

    // 获取这些分类下的所有账户
    const accounts = db.prepare(`
      SELECT id, name FROM fund_accounts
      WHERE user_id = ? AND dict_category_id IN (${placeholders})
    `).all(userId, ...categoryIds);

    if (accounts.length === 0) {
      return res.json({ pending_count: 0, accounts: [] });
    }

    // 检查哪些账户今日已有记录
    const accountIds = accounts.map(a => a.id);
    const accountPlaceholders = accountIds.map(() => '?').join(',');

    const todayRecords = db.prepare(`
      SELECT account_id FROM fund_daily_records
      WHERE account_id IN (${accountPlaceholders})
        AND record_date = date('now')
    `).all(...accountIds);

    const recordedAccountIds = new Set(todayRecords.map(r => r.account_id));

    // 筛选出未录入的账户
    const pendingAccounts = accounts
      .filter(acc => !recordedAccountIds.has(acc.id))
      .map(acc => ({ id: acc.id, name: acc.name }));

    res.json({
      pending_count: pendingAccounts.length,
      accounts: pendingAccounts
    });
  } catch (error) {
    console.error('获取今日提醒失败:', error);
    res.status(500).json({ error: '获取今日提醒失败' });
  }
});

/**
 * 辅助函数：获取日期所在周的周一日期（ISO 周起始）
 * 用于按周聚合时作为分组键
 */
function _getWeekKey(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(y, m - 1, d + diff);
  const ry = monday.getFullYear();
  const rm = String(monday.getMonth() + 1).padStart(2, '0');
  const rd = String(monday.getDate()).padStart(2, '0');
  return `${ry}-${rm}-${rd}`;
}

export default router;
