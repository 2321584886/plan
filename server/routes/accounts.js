/**
 * 资金账户管理路由
 * 职责：管理用户的资金账户，包括账户的增删改查以及资金变动记录
 * 
 * 账户关联到字典分类，每个账户必须属于一个分类
 * 账户金额由每日记录自动同步更新
 */

import { Router } from 'express';
import db from '../db/index.js';

const router = Router();

/**
 * GET /
 * 用途：获取账户列表
 * 查询参数：?category_id=X 用于过滤特定分类下的账户
 * 返回格式：[{ id, name, dict_category_id, category_name, current_amount, created_at }]
 */
router.get('/', (req, res) => {
  try {
    const { category_id } = req.query;
    const userId = req.userId;

    let query = `
      SELECT 
        fa.id,
        fa.name,
        fa.dict_category_id,
        dc.name as category_name,
        fa.current_amount,
        fa.created_at
      FROM fund_accounts fa
      LEFT JOIN dict_categories dc ON fa.dict_category_id = dc.id
      WHERE fa.user_id = ?
    `;
    const params = [userId];

    if (category_id) {
      query += ' AND fa.dict_category_id = ?';
      params.push(category_id);
    }

    query += ' ORDER BY fa.created_at DESC';

    const accounts = db.prepare(query).all(...params);
    res.json(accounts);
  } catch (error) {
    console.error('获取账户列表失败:', error);
    res.status(500).json({ error: '获取账户列表失败' });
  }
});

/**
 * POST /
 * 用途：新增资金账户
 * 请求体：{ name, dict_category_id }
 * - 验证 dict_category_id 存在
 * 返回：新建的账户对象
 */
router.post('/', (req, res) => {
  try {
    const { name, dict_category_id } = req.body;
    const userId = req.userId;

    if (!name || name.trim() === '') {
      return res.status(400).json({ error: '账户名称不能为空' });
    }

    if (!dict_category_id) {
      return res.status(400).json({ error: '请选择账户分类' });
    }

    // 验证分类是否存在
    const category = db.prepare('SELECT id FROM dict_categories WHERE id = ?').get(dict_category_id);
    if (!category) {
      return res.status(400).json({ error: '所选分类不存在' });
    }

    const result = db.prepare(`
      INSERT INTO fund_accounts (user_id, name, dict_category_id, current_amount)
      VALUES (?, ?, ?, 0)
    `).run(userId, name.trim(), dict_category_id);

    const newAccount = db.prepare(`
      SELECT 
        fa.id,
        fa.name,
        fa.dict_category_id,
        dc.name as category_name,
        fa.current_amount,
        fa.created_at
      FROM fund_accounts fa
      LEFT JOIN dict_categories dc ON fa.dict_category_id = dc.id
      WHERE fa.id = ?
    `).get(result.lastInsertRowid);

    res.status(201).json(newAccount);
  } catch (error) {
    console.error('创建账户失败:', error);
    res.status(500).json({ error: '创建账户失败' });
  }
});

/**
 * PUT /:id
 * 用途：修改资金账户
 * 请求体：{ name?, dict_category_id?, current_amount? }
 */
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { name, dict_category_id, current_amount } = req.body;
    const userId = req.userId;

    // 检查账户是否存在且属于当前用户
    const account = db.prepare('SELECT id FROM fund_accounts WHERE id = ? AND user_id = ?').get(id, userId);
    if (!account) {
      return res.status(404).json({ error: '账户不存在' });
    }

    // 如果修改分类，验证新分类存在
    if (dict_category_id !== undefined) {
      const category = db.prepare('SELECT id FROM dict_categories WHERE id = ?').get(dict_category_id);
      if (!category) {
        return res.status(400).json({ error: '所选分类不存在' });
      }
    }

    // 构建更新字段
    const updates = [];
    const params = [];

    if (name !== undefined) {
      if (name.trim() === '') {
        return res.status(400).json({ error: '账户名称不能为空' });
      }
      updates.push('name = ?');
      params.push(name.trim());
    }

    if (dict_category_id !== undefined) {
      updates.push('dict_category_id = ?');
      params.push(dict_category_id);
    }

    if (current_amount !== undefined) {
      updates.push('current_amount = ?');
      params.push(current_amount);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: '没有要更新的字段' });
    }

    params.push(id);
    db.prepare(`UPDATE fund_accounts SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    const updatedAccount = db.prepare(`
      SELECT 
        fa.id,
        fa.name,
        fa.dict_category_id,
        dc.name as category_name,
        fa.current_amount,
        fa.created_at
      FROM fund_accounts fa
      LEFT JOIN dict_categories dc ON fa.dict_category_id = dc.id
      WHERE fa.id = ?
    `).get(id);

    res.json(updatedAccount);
  } catch (error) {
    console.error('更新账户失败:', error);
    res.status(500).json({ error: '更新账户失败' });
  }
});

/**
 * DELETE /:id
 * 用途：删除资金账户
 * - 会级联删除关联的每日记录和交易记录（由外键约束处理）
 */
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;

    // 检查账户是否存在且属于当前用户
    const account = db.prepare('SELECT id FROM fund_accounts WHERE id = ? AND user_id = ?').get(id, userId);
    if (!account) {
      return res.status(404).json({ error: '账户不存在' });
    }

    db.prepare('DELETE FROM fund_accounts WHERE id = ?').run(id);
    res.json({ message: '删除成功' });
  } catch (error) {
    console.error('删除账户失败:', error);
    res.status(500).json({ error: '删除账户失败' });
  }
});

/**
 * GET /transactions/recent
 * 用途：全局交易查询，查询指定天数内所有账户的交易记录
 * 查询参数：?days=30
 * 返回：{ transactions: [...], summary: { total_deposit, total_withdraw, net_change, count } }
 * 注意：此路由必须放在 /:id/transactions 之前，避免 Express 把 'transactions' 当作 :id 参数
 */
router.get('/transactions/recent', (req, res) => {
  try {
    const { days = 30 } = req.query;
    const userId = req.userId;
    const daysNum = parseInt(days) || 30;

    // 查询指定天数内所有账户的交易记录，带账户名和分类名
    const transactions = db.prepare(`
      SELECT 
        t.id,
        t.account_id,
        a.name as account_name,
        dc.name as category_name,
        t.transaction_date,
        t.type,
        t.amount,
        t.notes,
        t.transaction_type_id,
        dtt.name as transaction_type_name,
        t.created_at
      FROM fund_transactions t
      JOIN fund_accounts a ON t.account_id = a.id
      JOIN dict_categories dc ON a.dict_category_id = dc.id
      LEFT JOIN dict_transaction_types dtt ON t.transaction_type_id = dtt.id
      WHERE a.user_id = ?
        AND t.transaction_date >= date('now', '-' || ? || ' days')
      ORDER BY t.transaction_date DESC, t.created_at DESC
    `).all(userId, daysNum);

    // 计算汇总信息
    const totalDeposit = transactions
      .filter(t => t.type === 'deposit')
      .reduce((sum, t) => sum + t.amount, 0);
    const totalWithdraw = transactions
      .filter(t => t.type === 'withdraw')
      .reduce((sum, t) => sum + t.amount, 0);

    res.json({
      transactions,
      summary: {
        total_deposit: Math.round(totalDeposit * 100) / 100,
        total_withdraw: Math.round(totalWithdraw * 100) / 100,
        net_change: Math.round((totalDeposit - totalWithdraw) * 100) / 100,
        count: transactions.length
      }
    });
  } catch (error) {
    console.error('获取全局交易记录失败:', error);
    res.status(500).json({ error: '获取全局交易记录失败' });
  }
});

/**
 * POST /:id/transactions
 * 用途：记录资金变动，同时更新账户余额
 * 请求体：{ transaction_date, type, amount, notes? }
 * - type: 'deposit'=入金, 'withdraw'=出金, 'transfer'=转账
 * - 入金：current_amount += amount
 * - 出金：current_amount -= amount（余额不足返回400）
 * - 使用数据库事务保证数据一致性
 */
router.post('/:id/transactions', (req, res) => {
  try {
    const { id: accountId } = req.params;
    const { transaction_date, type, amount, notes, transaction_type_id } = req.body;
    const userId = req.userId;

    // 检查账户是否存在且属于当前用户
    const account = db.prepare('SELECT id, current_amount FROM fund_accounts WHERE id = ? AND user_id = ?').get(accountId, userId);
    if (!account) {
      return res.status(404).json({ error: '账户不存在' });
    }

    if (!transaction_date) {
      return res.status(400).json({ error: '交易日期不能为空' });
    }

    if (!type || !['deposit', 'withdraw', 'transfer'].includes(type)) {
      return res.status(400).json({ error: '交易类型无效' });
    }

    if (amount === undefined || isNaN(amount) || Number(amount) <= 0) {
      return res.status(400).json({ error: '交易金额无效，必须为正数' });
    }

    const numAmount = Number(amount);

    // 出金前检查余额是否充足
    if (type === 'withdraw' && account.current_amount < numAmount) {
      return res.status(400).json({ error: '余额不足，当前余额：' + account.current_amount });
    }

    // 使用数据库事务保证数据一致性
    const transact = db.transaction(() => {
      // 1. 插入交易记录
      const result = db.prepare(`
        INSERT INTO fund_transactions (account_id, transaction_date, type, amount, notes, transaction_type_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(accountId, transaction_date, type, numAmount, notes || null, transaction_type_id || null);

      // 2. 根据交易类型更新账户余额
      if (type === 'deposit') {
        db.prepare('UPDATE fund_accounts SET current_amount = current_amount + ? WHERE id = ?').run(numAmount, accountId);
      } else if (type === 'withdraw') {
        db.prepare('UPDATE fund_accounts SET current_amount = current_amount - ? WHERE id = ?').run(numAmount, accountId);
      }

      return result;
    });

    const result = transact();

    // 3. 同步创建/更新当日持仓记录（fund_daily_records），确保收益日历有数据
    const currentBalance = db.prepare('SELECT current_amount FROM fund_accounts WHERE id = ?').get(accountId).current_amount;

    // 检查当日是否已有持仓记录
    const existingRecord = db.prepare(`
      SELECT id FROM fund_daily_records WHERE account_id = ? AND record_date = ?
    `).get(accountId, transaction_date);

    if (existingRecord) {
      // 已有记录（用户可能已通过每日录入创建），仅更新金额，保留用户填写的 daily_change
      db.prepare('UPDATE fund_daily_records SET amount = ? WHERE id = ?').run(currentBalance, existingRecord.id);
    } else {
      // 无记录，创建新的，并计算 daily_change（纯收益 = 余额变化 - 净入金）
      const lastRecord = db.prepare(`
        SELECT amount FROM fund_daily_records
        WHERE account_id = ? AND record_date < ?
        ORDER BY record_date DESC LIMIT 1
      `).get(accountId, transaction_date);

      let dailyChange = 0;
      if (lastRecord) {
        // 当日净入金（入金 - 出金）
        const todayNetDeposits = db.prepare(`
          SELECT
            COALESCE(SUM(CASE WHEN type = 'deposit' THEN amount ELSE 0 END), 0) -
            COALESCE(SUM(CASE WHEN type = 'withdraw' THEN amount ELSE 0 END), 0) as net_deposits
          FROM fund_transactions
          WHERE account_id = ? AND transaction_date = ?
        `).get(accountId, transaction_date);

        dailyChange = Math.round((currentBalance - lastRecord.amount - todayNetDeposits.net_deposits) * 100) / 100;
      }

      db.prepare(`
        INSERT INTO fund_daily_records (account_id, record_date, amount, daily_change)
        VALUES (?, ?, ?, ?)
      `).run(accountId, transaction_date, currentBalance, dailyChange);
    }

    // 查询新创建的交易记录返回
    const newTransaction = db.prepare(`
      SELECT t.id, t.account_id, t.transaction_date, t.type, t.amount, t.notes, t.transaction_type_id,
        dtt.name as transaction_type_name, t.created_at
      FROM fund_transactions t
      LEFT JOIN dict_transaction_types dtt ON t.transaction_type_id = dtt.id
      WHERE t.id = ?
    `).get(result.lastInsertRowid);

    // 查询更新后的账户余额
    const updatedAccount = db.prepare('SELECT current_amount FROM fund_accounts WHERE id = ?').get(accountId);

    res.status(201).json({
      ...newTransaction,
      updated_balance: updatedAccount.current_amount
    });
  } catch (error) {
    console.error('创建交易记录失败:', error);
    res.status(500).json({ error: '创建交易记录失败' });
  }
});

/**
 * GET /:id/transactions
 * 用途：获取账户的资金变动历史（支持分页）
 * 查询参数：?page=1&pageSize=20
 * 返回格式：{ transactions: [...], total, page, pageSize }
 */
router.get('/:id/transactions', (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, pageSize = 20 } = req.query;
    const userId = req.userId;

    // 检查账户是否存在且属于当前用户
    const account = db.prepare('SELECT id FROM fund_accounts WHERE id = ? AND user_id = ?').get(id, userId);
    if (!account) {
      return res.status(404).json({ error: '账户不存在' });
    }

    const pageNum = Math.max(1, parseInt(page) || 1);
    const pageSizeNum = Math.max(1, Math.min(100, parseInt(pageSize) || 20));
    const offset = (pageNum - 1) * pageSizeNum;

    // 查询总记录数
    const countResult = db.prepare(`
      SELECT COUNT(*) as total FROM fund_transactions WHERE account_id = ?
    `).get(id);

    // 查询分页数据
    const transactions = db.prepare(`
      SELECT t.id, t.account_id, t.transaction_date, t.type, t.amount, t.notes, t.transaction_type_id,
        dtt.name as transaction_type_name, t.created_at
      FROM fund_transactions t
      LEFT JOIN dict_transaction_types dtt ON t.transaction_type_id = dtt.id
      WHERE t.account_id = ?
      ORDER BY t.transaction_date DESC, t.created_at DESC
      LIMIT ? OFFSET ?
    `).all(id, pageSizeNum, offset);

    res.json({
      transactions,
      total: countResult.total,
      page: pageNum,
      pageSize: pageSizeNum
    });
  } catch (error) {
    console.error('获取交易记录失败:', error);
    res.status(500).json({ error: '获取交易记录失败' });
  }
});

export default router;
