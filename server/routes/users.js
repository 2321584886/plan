import { Router } from 'express';
import db, { ensureDefaultAccountsForUser } from '../db/index.js';

const router = Router();

// 获取用户列表，用于前端用户切换
router.get('/', (_req, res) => {
  try {
    const users = db.prepare(`
      SELECT
        u.id,
        u.username,
        u.created_at,
        COUNT(fa.id) as account_count,
        COALESCE(SUM(fa.current_amount), 0) as total_amount
      FROM users u
      LEFT JOIN fund_accounts fa ON fa.user_id = u.id
      GROUP BY u.id, u.username, u.created_at
      ORDER BY u.id ASC
    `).all();

    res.json(users.map((u) => ({
      ...u,
      total_amount: Math.round((u.total_amount || 0) * 100) / 100,
    })));
  } catch (error) {
    console.error('获取用户列表失败:', error);
    res.status(500).json({ error: '获取用户列表失败' });
  }
});

// 新增用户（默认初始化账户）
router.post('/', (req, res) => {
  try {
    const { username } = req.body;

    if (!username || !String(username).trim()) {
      return res.status(400).json({ error: '用户名不能为空' });
    }

    const normalized = String(username).trim();

    const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(normalized);
    if (exists) {
      return res.status(409).json({ error: '用户名已存在' });
    }

    const result = db.prepare('INSERT INTO users (username) VALUES (?)').run(normalized);
    const userId = Number(result.lastInsertRowid);

    ensureDefaultAccountsForUser(userId);

    const user = db.prepare(`
      SELECT id, username, created_at
      FROM users
      WHERE id = ?
    `).get(userId);

    res.status(201).json(user);
  } catch (error) {
    console.error('创建用户失败:', error);
    res.status(500).json({ error: '创建用户失败' });
  }
});

export default router;
