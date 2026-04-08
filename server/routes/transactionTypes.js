/**
 * 交易分类管理路由
 * 职责：管理交易分类字典（收入/支出），提供分类查询和CRUD操作
 * 
 * 分类规则：
 * - type 为 'income' 表示收入分类
 * - type 为 'expense' 表示支出分类
 */

import { Router } from 'express';
import db from '../db/index.js';

const router = Router();

/**
 * GET /
 * 用途：获取所有交易分类
 * 查询参数：?type=income 或 ?type=expense 过滤，不传则返回全部
 * 返回格式：[{ id, name, type, sort_order, created_at }]
 * 按 type 分组、sort_order 排序
 */
router.get('/', (req, res) => {
  try {
    const { type } = req.query;

    let sql = `
      SELECT id, name, type, sort_order, created_at
      FROM dict_transaction_types
    `;
    const params = [];

    // 按 type 过滤
    if (type) {
      if (type !== 'income' && type !== 'expense') {
        return res.status(400).json({ error: 'type 参数必须为 income 或 expense' });
      }
      sql += ' WHERE type = ?';
      params.push(type);
    }

    // 按 type 分组、sort_order 排序
    sql += ' ORDER BY type ASC, sort_order ASC, id ASC';

    const categories = db.prepare(sql).all(...params);
    res.json(categories);
  } catch (error) {
    console.error('获取交易分类失败:', error);
    res.status(500).json({ error: '获取交易分类失败' });
  }
});

/**
 * POST /
 * 用途：新增交易分类
 * 请求体：{ name, type, sort_order? }
 * - name 不能为空
 * - type 必须为 'income' 或 'expense'
 * 返回：新建的分类对象
 */
router.post('/', (req, res) => {
  try {
    const { name, type, sort_order = 0 } = req.body;

    // 验证 name
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: '分类名称不能为空' });
    }

    // 验证 type
    if (type !== 'income' && type !== 'expense') {
      return res.status(400).json({ error: 'type 必须为 income 或 expense' });
    }

    const result = db.prepare(`
      INSERT INTO dict_transaction_types (name, type, sort_order)
      VALUES (?, ?, ?)
    `).run(name.trim(), type, sort_order);

    const newCategory = db.prepare(`
      SELECT id, name, type, sort_order, created_at
      FROM dict_transaction_types
      WHERE id = ?
    `).get(result.lastInsertRowid);

    res.status(201).json(newCategory);
  } catch (error) {
    console.error('创建交易分类失败:', error);
    res.status(500).json({ error: '创建交易分类失败' });
  }
});

/**
 * PUT /:id
 * 用途：修改交易分类
 * 请求体：{ name?, sort_order? }
 * 注意：不允许修改 type（防止数据混乱）
 */
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { name, sort_order } = req.body;

    // 检查分类是否存在
    const category = db.prepare('SELECT id FROM dict_transaction_types WHERE id = ?').get(id);
    if (!category) {
      return res.status(404).json({ error: '分类不存在' });
    }

    // 构建更新字段
    const updates = [];
    const params = [];

    if (name !== undefined) {
      if (name.trim() === '') {
        return res.status(400).json({ error: '分类名称不能为空' });
      }
      updates.push('name = ?');
      params.push(name.trim());
    }

    if (sort_order !== undefined) {
      updates.push('sort_order = ?');
      params.push(sort_order);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: '没有要更新的字段' });
    }

    params.push(id);
    db.prepare(`UPDATE dict_transaction_types SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    const updatedCategory = db.prepare(`
      SELECT id, name, type, sort_order, created_at
      FROM dict_transaction_types
      WHERE id = ?
    `).get(id);

    res.json(updatedCategory);
  } catch (error) {
    console.error('更新交易分类失败:', error);
    res.status(500).json({ error: '更新交易分类失败' });
  }
});

/**
 * DELETE /:id
 * 用途：删除交易分类
 * - 需检查是否有 fund_transactions 通过 transaction_type_id 引用该分类
 * - 有引用则返回 409 错误
 */
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;

    // 检查分类是否存在
    const category = db.prepare('SELECT id FROM dict_transaction_types WHERE id = ?').get(id);
    if (!category) {
      return res.status(404).json({ error: '分类不存在' });
    }

    // 检查是否有交易记录引用该分类
    const refCount = db.prepare(`
      SELECT COUNT(*) as count FROM fund_transactions WHERE transaction_type_id = ?
    `).get(id);
    if (refCount.count > 0) {
      return res.status(409).json({ error: '该分类已被交易记录引用，无法删除' });
    }

    db.prepare('DELETE FROM dict_transaction_types WHERE id = ?').run(id);
    res.json({ message: '删除成功' });
  } catch (error) {
    console.error('删除交易分类失败:', error);
    res.status(500).json({ error: '删除交易分类失败' });
  }
});

export default router;
