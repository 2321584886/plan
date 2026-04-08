/**
 * 字典分类管理路由
 * 职责：管理资金分类体系（一级/二级分类），提供分类树查询和CRUD操作
 * 
 * 分类规则：
 * - 一级分类：parent_id 为 NULL（如：活钱、理财、公积金）
 * - 二级分类：parent_id 指向一级分类（如：理财->基金、纸黄金、股票）
 * - 最多支持两级分类
 */

import { Router } from 'express';
import db from '../db/index.js';

const router = Router();

/**
 * GET /tree
 * 用途：获取完整字典分类树
 * 返回格式：[{ id, name, parent_id, sort_order, children: [...] }]
 * 一级分类包含 children 数组
 */
router.get('/tree', (req, res) => {
  try {
    // 获取所有分类
    const categories = db.prepare(`
      SELECT id, name, parent_id, sort_order, created_at
      FROM dict_categories
      ORDER BY sort_order ASC, id ASC
    `).all();

    // 构建树结构
    const categoryMap = new Map();
    const rootCategories = [];

    // 初始化 map
    categories.forEach(cat => {
      categoryMap.set(cat.id, { ...cat, children: [] });
    });

    // 构建层级关系
    categories.forEach(cat => {
      const node = categoryMap.get(cat.id);
      if (cat.parent_id === null) {
        // 一级分类
        rootCategories.push(node);
      } else {
        // 二级分类，挂到父节点下
        const parent = categoryMap.get(cat.parent_id);
        if (parent) {
          parent.children.push(node);
        }
      }
    });

    res.json(rootCategories);
  } catch (error) {
    console.error('获取分类树失败:', error);
    res.status(500).json({ error: '获取分类树失败' });
  }
});

/**
 * POST /
 * 用途：新增字典分类
 * 请求体：{ name, parent_id?, sort_order? }
 * - parent_id 为空则创建一级分类
 * - 如果 parent_id 不为空，需检查父分类存在且为一级分类（parent_id 为 NULL）
 * 返回：新建的分类对象
 */
router.post('/', (req, res) => {
  try {
    const { name, parent_id, sort_order = 0 } = req.body;

    if (!name || name.trim() === '') {
      return res.status(400).json({ error: '分类名称不能为空' });
    }

    // 检查 parent_id
    if (parent_id !== undefined && parent_id !== null) {
      const parent = db.prepare('SELECT id, parent_id FROM dict_categories WHERE id = ?').get(parent_id);
      if (!parent) {
        return res.status(400).json({ error: '父分类不存在' });
      }
      if (parent.parent_id !== null) {
        return res.status(400).json({ error: '只能在一级分类下创建二级分类' });
      }
    }

    const result = db.prepare(`
      INSERT INTO dict_categories (name, parent_id, sort_order)
      VALUES (?, ?, ?)
    `).run(name.trim(), parent_id || null, sort_order);

    const newCategory = db.prepare(`
      SELECT id, name, parent_id, sort_order, created_at
      FROM dict_categories
      WHERE id = ?
    `).get(result.lastInsertRowid);

    res.status(201).json(newCategory);
  } catch (error) {
    console.error('创建分类失败:', error);
    res.status(500).json({ error: '创建分类失败' });
  }
});

/**
 * PUT /:id
 * 用途：修改字典分类
 * 请求体：{ name?, sort_order? }
 * 注意：不允许修改 parent_id（防止层级混乱）
 */
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { name, sort_order } = req.body;

    // 检查分类是否存在
    const category = db.prepare('SELECT id FROM dict_categories WHERE id = ?').get(id);
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
    db.prepare(`UPDATE dict_categories SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    const updatedCategory = db.prepare(`
      SELECT id, name, parent_id, sort_order, created_at
      FROM dict_categories
      WHERE id = ?
    `).get(id);

    res.json(updatedCategory);
  } catch (error) {
    console.error('更新分类失败:', error);
    res.status(500).json({ error: '更新分类失败' });
  }
});

/**
 * DELETE /:id
 * 用途：删除字典分类
 * - 需检查是否有 fund_accounts 引用该分类，如有则返回 409 错误
 * - 一级分类删除时需检查是否有子分类
 */
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;

    // 检查分类是否存在
    const category = db.prepare('SELECT id, parent_id FROM dict_categories WHERE id = ?').get(id);
    if (!category) {
      return res.status(404).json({ error: '分类不存在' });
    }

    // 检查是否有账户引用该分类
    const accountCount = db.prepare(`
      SELECT COUNT(*) as count FROM fund_accounts WHERE dict_category_id = ?
    `).get(id);
    if (accountCount.count > 0) {
      return res.status(409).json({ 
        error: '该分类下存在资金账户，无法删除',
        account_count: accountCount.count
      });
    }

    // 如果是一级分类，检查是否有子分类
    if (category.parent_id === null) {
      const childCount = db.prepare(`
        SELECT COUNT(*) as count FROM dict_categories WHERE parent_id = ?
      `).get(id);
      if (childCount.count > 0) {
        return res.status(409).json({ 
          error: '该分类下存在子分类，请先删除子分类',
          child_count: childCount.count
        });
      }
    }

    db.prepare('DELETE FROM dict_categories WHERE id = ?').run(id);
    res.json({ message: '删除成功' });
  } catch (error) {
    console.error('删除分类失败:', error);
    res.status(500).json({ error: '删除分类失败' });
  }
});

export default router;
