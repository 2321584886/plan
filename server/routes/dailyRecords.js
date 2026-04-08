/**
 * 每日持仓记录管理路由
 * 职责：管理每个资金账户的每日持仓记录，用于生成趋势图和计算收益率
 * 
 * 核心功能：
 * - 批量录入每日持仓数据
 * - 查询分类趋势数据
 * - 获取最近一次录入数据
 */

import { Router } from 'express';
import db from '../db/index.js';

const router = Router();

/**
 * POST /
 * 用途：批量录入每日持仓
 * 请求体：{ records: [{ account_id, record_date, amount, daily_change?, notes? }] }
 * - 使用 INSERT OR REPLACE（基于 UNIQUE 约束 account_id + record_date）
 * - 同时更新 fund_accounts.current_amount 为最新金额
 * 返回：{ saved: N }
 */
router.post('/', (req, res) => {
  try {
    const { records } = req.body;
    const userId = req.userId;

    if (!Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ error: '请提供有效的记录数组' });
    }

    const insertStmt = db.prepare(`
      INSERT OR REPLACE INTO fund_daily_records 
      (account_id, record_date, amount, daily_change, notes)
      VALUES (?, ?, ?, ?, ?)
    `);

    const updateAccountStmt = db.prepare(`
      UPDATE fund_accounts SET current_amount = ? WHERE id = ?
    `);

    let savedCount = 0;

    // 使用事务确保数据一致性
    const insertTransaction = db.transaction((recordList) => {
      for (const record of recordList) {
        const { account_id, record_date, amount, daily_change = 0, notes } = record;

        // 验证账户存在且属于当前用户
        const account = db.prepare('SELECT id FROM fund_accounts WHERE id = ? AND user_id = ?').get(account_id, userId);
        if (!account) {
          throw new Error(`账户不存在或无权限: ${account_id}`);
        }

        // 插入或更新记录
        insertStmt.run(account_id, record_date, amount, daily_change, notes || null);
        savedCount++;

        // 更新账户当前金额
        updateAccountStmt.run(amount, account_id);
      }
    });

    insertTransaction(records);

    res.json({ saved: savedCount });
  } catch (error) {
    console.error('批量录入记录失败:', error);
    res.status(500).json({ error: error.message || '批量录入记录失败' });
  }
});

/**
 * GET /trend
 * 用途：按分类查趋势数据
 * 查询参数：?category_id=X&days=30
 * - category_id 是 dict_categories 的一级分类 ID
 * - 需要聚合该分类下所有账户（包括子分类账户）的每日金额
 * 返回格式：[{ date, total_amount, daily_change }]
 */
router.get('/trend', (req, res) => {
  try {
    const { category_id, days = 30 } = req.query;
    const userId = req.userId;
    const daysNum = parseInt(days) || 30;

    if (!category_id) {
      return res.status(400).json({ error: '请提供分类ID' });
    }

    // 获取该一级分类下的所有账户ID（包括子分类下的账户）
    // 首先获取所有子分类ID
    const childCategories = db.prepare(`
      SELECT id FROM dict_categories WHERE parent_id = ?
    `).all(category_id);

    const categoryIds = [parseInt(category_id), ...childCategories.map(c => c.id)];
    const placeholders = categoryIds.map(() => '?').join(',');

    // 获取这些分类下的所有账户
    const accounts = db.prepare(`
      SELECT id FROM fund_accounts 
      WHERE user_id = ? AND dict_category_id IN (${placeholders})
    `).all(userId, ...categoryIds);

    if (accounts.length === 0) {
      return res.json([]);
    }

    const accountIds = accounts.map(a => a.id);
    const accountPlaceholders = accountIds.map(() => '?').join(',');

    // 查询这些账户在指定天数内的每日汇总数据
    const trends = db.prepare(`
      SELECT 
        record_date as date,
        SUM(amount) as total_amount,
        SUM(daily_change) as daily_change
      FROM fund_daily_records
      WHERE account_id IN (${accountPlaceholders})
        AND record_date >= date('now', '-${daysNum} days')
      GROUP BY record_date
      ORDER BY record_date ASC
    `).all(...accountIds);

    // 格式化金额，保留两位小数
    const formattedTrends = trends.map(t => ({
      date: t.date,
      total_amount: Math.round(t.total_amount * 100) / 100,
      daily_change: Math.round(t.daily_change * 100) / 100
    }));

    res.json(formattedTrends);
  } catch (error) {
    console.error('获取趋势数据失败:', error);
    res.status(500).json({ error: '获取趋势数据失败' });
  }
});

/**
 * GET /latest
 * 用途：获取最近一次录入数据
 * - 查询每个账户最近一条记录
 * 返回格式：[{ account_id, account_name, record_date, amount, daily_change }]
 */
router.get('/latest', (req, res) => {
  try {
    const userId = req.userId;

    // 获取用户所有账户的最新记录
    const latestRecords = db.prepare(`
      SELECT 
        fdr.account_id,
        fa.name as account_name,
        fdr.record_date,
        fdr.amount,
        fdr.daily_change
      FROM fund_daily_records fdr
      INNER JOIN fund_accounts fa ON fdr.account_id = fa.id
      WHERE fa.user_id = ?
        AND fdr.record_date = (
          SELECT MAX(record_date) 
          FROM fund_daily_records 
          WHERE account_id = fdr.account_id
        )
      ORDER BY fa.name ASC
    `).all(userId);

    // 格式化金额
    const formattedRecords = latestRecords.map(r => ({
      account_id: r.account_id,
      account_name: r.account_name,
      record_date: r.record_date,
      amount: Math.round(r.amount * 100) / 100,
      daily_change: Math.round(r.daily_change * 100) / 100
    }));

    res.json(formattedRecords);
  } catch (error) {
    console.error('获取最新记录失败:', error);
    res.status(500).json({ error: '获取最新记录失败' });
  }
});

/**
 * GET /calendar
 * 用途：按月查询账户每日收益数据（日历视图）
 * 查询参数：?account_id=X&year=2026&month=4 或 ?category_id=2&year=2026&month=4
 * - account_id: 单个账户的收益日历
 * - category_id: 分类下所有账户的聚合收益日历（与 account_id 互斥）
 * 返回格式：{ account_id?, category_id?, account_name?, year, month, days: [...], summary: {...} }
 */
router.get('/calendar', (req, res) => {
  try {
    const userId = req.userId;
    const accountId = req.query.account_id ? parseInt(req.query.account_id) : null;
    const categoryId = req.query.category_id ? parseInt(req.query.category_id) : null;
    const year = parseInt(req.query.year);
    const month = parseInt(req.query.month);

    // 验证参数合法性
    if ((!accountId && !categoryId) || !year || !month || month < 1 || month > 12) {
      return res.status(400).json({ error: '请提供有效的 account_id 或 category_id，以及 year 和 month 参数' });
    }

    if (accountId && categoryId) {
      return res.status(400).json({ error: 'account_id 和 category_id 不能同时提供' });
    }

    // 计算月份的起止日期
    const monthStr = String(month).padStart(2, '0');
    const startDate = `${year}-${monthStr}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${monthStr}-${String(lastDay).padStart(2, '0')}`;

    let targetAccountIds = [];
    let responseMeta = {};

    if (accountId) {
      // 单账户模式 — 验证账户存在且属于当前用户
      const account = db.prepare(`
        SELECT fa.id, fa.name, fa.current_amount, fa.dict_category_id
        FROM fund_accounts fa
        WHERE fa.id = ? AND fa.user_id = ?
      `).get(accountId, userId);

      if (!account) {
        return res.status(404).json({ error: '账户不存在或无权限' });
      }

      targetAccountIds = [accountId];
      responseMeta = { account_id: accountId, account_name: account.name };
    } else {
      // 分类模式 — 获取该分类及子分类下所有账户
      const childIds = db.prepare(`
        SELECT id FROM dict_categories WHERE parent_id = ?
      `).all(categoryId).map(c => c.id);

      const allCategoryIds = [categoryId, ...childIds];
      const placeholders = allCategoryIds.map(() => '?').join(',');

      const accounts = db.prepare(`
        SELECT id FROM fund_accounts
        WHERE user_id = ? AND dict_category_id IN (${placeholders})
      `).all(userId, ...allCategoryIds);

      targetAccountIds = accounts.map(a => a.id);
      responseMeta = { category_id: categoryId };
    }

    if (targetAccountIds.length === 0) {
      return res.json({
        ...responseMeta,
        year, month,
        days: [],
        summary: { total_earnings: 0, avg_daily_rate: 0, cumulative_rate: 0, annualized_rate: 0, total_days: 0 }
      });
    }

    const accountPlaceholders = targetAccountIds.map(() => '?').join(',');

    // 查询该月所有每日记录（聚合所有目标账户）
    const records = db.prepare(`
      SELECT
        record_date as date,
        SUM(amount) as amount,
        SUM(daily_change) as daily_change
      FROM fund_daily_records
      WHERE account_id IN (${accountPlaceholders})
        AND record_date >= ?
        AND record_date <= ?
      GROUP BY record_date
      ORDER BY record_date ASC
    `).all(...targetAccountIds, startDate, endDate);

    // 计算每日收益率并格式化数据
    const days = records.map(r => {
      const base = r.amount - r.daily_change;
      const dailyRate = base !== 0
        ? Math.round((r.daily_change / base) * 100 * 1000000) / 1000000
        : 0;
      return {
        date: r.date,
        amount: Math.round(r.amount * 100) / 100,
        daily_change: Math.round(r.daily_change * 100) / 100,
        daily_rate: Math.round(dailyRate * 1000) / 1000
      };
    });

    // 计算月度汇总
    const totalDays = days.length;
    const totalEarnings = days.reduce((sum, d) => sum + d.daily_change, 0);
    const avgDailyRate = totalDays > 0
      ? days.reduce((sum, d) => sum + d.daily_rate, 0) / totalDays
      : 0;

    // 月初持仓 = 第一条记录的 (amount - daily_change)
    const openingBalance = totalDays > 0
      ? records[0].amount - records[0].daily_change
      : 0;

    // 累计收益率
    const cumulativeRate = openingBalance !== 0
      ? (totalEarnings / openingBalance) * 100
      : 0;

    // 年化收益率
    let annualizedRate = 0;
    if (totalDays > 0 && cumulativeRate !== 0) {
      annualizedRate = (Math.pow(1 + cumulativeRate / 100, 365 / totalDays) - 1) * 100;
    }

    const summary = {
      total_earnings: Math.round(totalEarnings * 100) / 100,
      avg_daily_rate: Math.round(avgDailyRate * 1000) / 1000,
      cumulative_rate: Math.round(cumulativeRate * 100) / 100,
      annualized_rate: Math.round(annualizedRate * 100) / 100,
      total_days: totalDays
    };

    res.json({
      ...responseMeta,
      year,
      month,
      days,
      summary
    });
  } catch (error) {
    console.error('获取收益日历数据失败:', error);
    res.status(500).json({ error: '获取收益日历数据失败' });
  }
});

export default router;
