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

const defaultAccounts = [
  { dictCategoryId: 1, name: '余额宝' },
  { dictCategoryId: 3, name: '基金账户' },
  { dictCategoryId: 4, name: '纸黄金账户' },
  { dictCategoryId: 5, name: '股票账户' },
  { dictCategoryId: 6, name: '公积金账户' },
  { dictCategoryId: 7, name: '活期+账户' },
  { dictCategoryId: 8, name: '活期+plus账户' },
];

export function ensureDefaultAccountsForUser(userId) {
  const checkStmt = db.prepare('SELECT COUNT(*) as cnt FROM fund_accounts WHERE user_id = ? AND dict_category_id = ?');
  const insertStmt = db.prepare('INSERT INTO fund_accounts (user_id, name, dict_category_id, current_amount) VALUES (?, ?, ?, 0)');

  for (const acc of defaultAccounts) {
    const { cnt } = checkStmt.get(userId, acc.dictCategoryId);
    if (cnt === 0) {
      insertStmt.run(userId, acc.name, acc.dictCategoryId);
    }
  }
}

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

// 补充检查：确保测试用户存在
const ensureTestUsers = db.transaction(() => {
  db.prepare("INSERT OR IGNORE INTO users (id, username) VALUES (2, 'test_user_a')").run();
  db.prepare("INSERT OR IGNORE INTO users (id, username) VALUES (3, 'test_user_b')").run();
});
ensureTestUsers();

// 补充检查：确保每个分类至少有一个默认账户（应对旧数据库缺少账户的情况）
const ensureDefaultAccounts = db.transaction(() => {
  const users = db.prepare('SELECT id FROM users').all();
  for (const user of users) {
    ensureDefaultAccountsForUser(user.id);
  }
});
ensureDefaultAccounts();

// 补充检查：为测试用户补齐示例数据，便于验证用户切换
const ensureTestUserSeedData = db.transaction(() => {
  const users = [
    {
      id: 2,
      balances: {
        '余额宝': 5200.5,
        '基金账户': 86000,
        '纸黄金账户': 12000,
        '股票账户': 23000,
        '公积金账户': 18000,
        '活期+账户': 9800,
        '活期+plus账户': 4400,
      },
    },
    {
      id: 3,
      balances: {
        '余额宝': 980,
        '基金账户': 15000,
        '纸黄金账户': 0,
        '股票账户': 8600,
        '公积金账户': 6000,
        '活期+账户': 2200,
        '活期+plus账户': 3100,
      },
    },
  ];

  const todayStmt = db.prepare(`
    INSERT OR IGNORE INTO fund_daily_records (account_id, record_date, amount, daily_change, notes)
    VALUES (?, date('now'), ?, ?, ?)
  `);
  const updateAmountStmt = db.prepare('UPDATE fund_accounts SET current_amount = ? WHERE id = ?');
  const existsSeedTxStmt = db.prepare(`
    SELECT id FROM fund_transactions
    WHERE account_id = ? AND transaction_date = date('now') AND notes = 'seed'
    LIMIT 1
  `);
  const insertTxStmt = db.prepare(`
    INSERT INTO fund_transactions (account_id, transaction_date, type, amount, notes)
    VALUES (?, date('now'), ?, ?, ?)
  `);

  for (const u of users) {
    const accounts = db.prepare('SELECT id, name FROM fund_accounts WHERE user_id = ?').all(u.id);
    for (const acc of accounts) {
      const amount = u.balances[acc.name] ?? 0;
      updateAmountStmt.run(amount, acc.id);
      todayStmt.run(acc.id, amount, Math.round(amount * 0.004 * 100) / 100, 'seed');
      if (amount > 0) {
        const exists = existsSeedTxStmt.get(acc.id);
        if (!exists) {
          insertTxStmt.run(acc.id, 'deposit', Math.round(amount * 0.12 * 100) / 100, 'seed');
        }
      }
    }
  }
});
ensureTestUserSeedData();

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

// 补充检查：初始化浙商纸黄金示例数据（仅首次）
const ensurePaperGoldSeed = db.transaction(() => {
  const account = db.prepare(`
    SELECT id
    FROM fund_accounts
    WHERE user_id = 1 AND dict_category_id = 4
    ORDER BY id ASC
    LIMIT 1
  `).get();

  if (!account) return;

  const exists = db.prepare(`
    SELECT id
    FROM paper_gold_positions
    WHERE user_id = 1 AND account_id = ?
    LIMIT 1
  `).get(account.id);

  const seedQuoteTime = new Date().toISOString().slice(0, 19).replace('T', ' ');

  if (!exists) {
    db.prepare(`
      INSERT INTO paper_gold_market_snapshots
      (user_id, account_id, quote_time, realtime_price, price_change, change_rate, source, raw_text)
      VALUES (?, ?, ?, ?, ?, ?, 'seed', 'seed')
    `).run(1, account.id, seedQuoteTime, 1057.02, 26.19, 2.54);

    const positionRows = [
      { order_type: '实时买入', trade_time: '2026-03-23 13:59:21', grams: 1.1471, buy_price: 958.96, buy_value: 1213.02, estimated_sell_fee: 4.85 },
      { order_type: '限价买入', trade_time: '2026-03-23 10:36:37', grams: 1.2254, buy_price: 979.25, buy_value: 1295.82, estimated_sell_fee: 5.18 },
      { order_type: '实时买入', trade_time: '2026-03-23 09:25:51', grams: 1.2130, buy_price: 989.32, buy_value: 1282.71, estimated_sell_fee: 5.13 },
      { order_type: '实时买入', trade_time: '2026-03-19 16:54:19', grams: 1.9025, buy_price: 1051.24, buy_value: 2000.00, estimated_sell_fee: 8.01 },
    ];

    const insertPosition = db.prepare(`
      INSERT INTO paper_gold_positions
      (user_id, account_id, order_type, trade_time, grams, buy_price, buy_value, estimated_sell_fee, source, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'seed', ?)
    `);
    for (const row of positionRows) {
      insertPosition.run(
        1,
        account.id,
        row.order_type,
        row.trade_time,
        row.grams,
        row.buy_price,
        row.buy_value,
        row.estimated_sell_fee,
        'seed',
      );
    }

    const insertClosed = db.prepare(`
      INSERT INTO paper_gold_closed_records
      (user_id, account_id, closed_time, grams, buy_price, sell_price, sell_fee, pnl, source, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'seed', ?)
    `);
    insertClosed.run(1, account.id, '2026-04-08 15:10:00', 4.1343, 1209.39, 1061.88, 17.56, -627.41, '截图示例');
    insertClosed.run(1, account.id, '2026-03-10 11:20:00', 1.7425, 1147.80, 1183.90, 8.25, 54.65, '截图示例');
    insertClosed.run(1, account.id, '2026-03-02 14:30:00', 1.7324, 1154.44, 1198.54, 8.30, 68.10, '截图示例');
  }

  const totalGrams = db.prepare(`
    SELECT COALESCE(SUM(grams), 0) as grams
    FROM paper_gold_positions
    WHERE user_id = 1 AND account_id = ?
  `).get(account.id);

  if ((totalGrams?.grams || 0) < 10) {
    const alreadyAdjusted = db.prepare(`
      SELECT id
      FROM paper_gold_positions
      WHERE user_id = 1 AND account_id = ? AND notes = 'seed-adjust'
      LIMIT 1
    `).get(account.id);

    if (!alreadyAdjusted) {
      db.prepare(`
        INSERT INTO paper_gold_positions
        (user_id, account_id, order_type, trade_time, grams, buy_price, buy_value, estimated_sell_fee, source, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'seed', ?)
      `).run(1, account.id, '实时买入', '2026-03-18 10:20:00', 16.3814, 1109.47, 18169.80, 3.36, 'seed-adjust');
    }
  }

  db.prepare('UPDATE fund_accounts SET current_amount = ? WHERE id = ?').run(23126.23, account.id);
  db.prepare(`
    INSERT OR REPLACE INTO fund_daily_records (account_id, record_date, amount, daily_change, notes)
    VALUES (?, date('now'), ?, ?, ?)
  `).run(account.id, 23126.23, 572.62, 'paper-gold-seed');
});
ensurePaperGoldSeed();

// 检查 fund_transactions 表是否已有 transaction_type_id 列，没有则动态添加
const columns = db.prepare("PRAGMA table_info(fund_transactions)").all();
const hasTypeId = columns.some(col => col.name === 'transaction_type_id');
if (!hasTypeId) {
  db.exec('ALTER TABLE fund_transactions ADD COLUMN transaction_type_id INTEGER REFERENCES dict_transaction_types(id)');
}

export default db;