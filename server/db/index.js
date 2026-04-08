import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbFile = path.join(__dirname, 'database.sqlite');
const schemaFile = path.join(__dirname, 'schema.sql');

// Initialize the SQLite database
const db = new Database(dbFile);

// 读取并执行 schema，确保表结构和初始数据存在
const schema = fs.readFileSync(schemaFile, 'utf8');
db.exec(schema);

// 补充检查：确保理财子分类数据完整（应对手动删除数据库后重建的场景）
const ensureCategories = db.transaction(() => {
  const existing = db.prepare('SELECT id FROM dict_categories WHERE id IN (7, 8)').all();
  const existingIds = existing.map(r => r.id);

  if (!existingIds.includes(7)) {
    db.prepare("INSERT INTO dict_categories (id, name, parent_id, sort_order) VALUES (7, '活期+', 2, 4)").run();
  }
  if (!existingIds.includes(8)) {
    db.prepare("INSERT INTO dict_categories (id, name, parent_id, sort_order) VALUES (8, '活期+plus', 2, 5)").run();
  }
});
ensureCategories();

// 补充检查：确保每个分类至少有一个默认账户（应对旧数据库缺少账户的情况）
const ensureDefaultAccounts = db.transaction(() => {
  // 默认账户配置：分类ID -> 账户名称
  const defaultAccounts = [
    { dictCategoryId: 1, name: '余额宝' },
    { dictCategoryId: 3, name: '基金账户' },
    { dictCategoryId: 4, name: '纸黄金账户' },
    { dictCategoryId: 5, name: '股票账户' },
    { dictCategoryId: 6, name: '公积金账户' },
    { dictCategoryId: 7, name: '活期+账户' },
    { dictCategoryId: 8, name: '活期+plus账户' },
  ];

  const checkStmt = db.prepare('SELECT COUNT(*) as cnt FROM fund_accounts WHERE dict_category_id = ?');
  const insertStmt = db.prepare('INSERT INTO fund_accounts (user_id, name, dict_category_id, current_amount) VALUES (1, ?, ?, 0)');

  for (const acc of defaultAccounts) {
    const { cnt } = checkStmt.get(acc.dictCategoryId);
    if (cnt === 0) {
      insertStmt.run(acc.name, acc.dictCategoryId);
    }
  }
});
ensureDefaultAccounts();

// 补充检查：确保交易分类种子数据完整（应对旧数据库缺少交易分类的情况）
const ensureTransactionTypes = db.transaction(() => {
  const defaultTypes = [
    { id: 1, name: '工资', type: 'income', sort_order: 1 },
    { id: 2, name: '奖金', type: 'income', sort_order: 2 },
    { id: 3, name: '理财收益', type: 'income', sort_order: 3 },
    { id: 4, name: '转入', type: 'income', sort_order: 4 },
    { id: 5, name: '其他收入', type: 'income', sort_order: 5 },
    { id: 6, name: '日常消费', type: 'expense', sort_order: 1 },
    { id: 7, name: '转出', type: 'expense', sort_order: 2 },
    { id: 8, name: '其他支出', type: 'expense', sort_order: 3 },
  ];
  // 检查每个默认类型是否存在，不存在则插入
  const checkStmt = db.prepare('SELECT COUNT(*) as cnt FROM dict_transaction_types WHERE id = ?');
  const insertStmt = db.prepare('INSERT INTO dict_transaction_types (id, name, type, sort_order) VALUES (?, ?, ?, ?)');
  for (const t of defaultTypes) {
    const { cnt } = checkStmt.get(t.id);
    if (cnt === 0) {
      insertStmt.run(t.id, t.name, t.type, t.sort_order);
    }
  }
});
ensureTransactionTypes();

// 检查 fund_transactions 表是否已有 transaction_type_id 列，没有则动态添加
const columns = db.prepare("PRAGMA table_info(fund_transactions)").all();
const hasTypeId = columns.some(col => col.name === 'transaction_type_id');
if (!hasTypeId) {
  db.exec('ALTER TABLE fund_transactions ADD COLUMN transaction_type_id INTEGER REFERENCES dict_transaction_types(id)');
}

export default db;