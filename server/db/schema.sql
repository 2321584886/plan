-- 启用外键约束
PRAGMA foreign_keys = ON;

-- =============================================
-- 用户表 (Hardcoded user for now)
-- =============================================
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,   -- 用户唯一标识
    username TEXT NOT NULL UNIQUE,          -- 用户名
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP  -- 创建时间
);

-- 初始化默认用户
INSERT OR IGNORE INTO users (id, username) VALUES (1, 'admin_user');

-- =============================================
-- 字典分类表：定义资金分类体系（一级/二级）
-- 一级分类如：活钱、理财、公积金
-- 二级分类如：理财下的基金、纸黄金、股票
-- =============================================
CREATE TABLE IF NOT EXISTS dict_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,   -- 分类唯一标识
    name TEXT NOT NULL,                     -- 分类名称，如"活钱"、"基金"
    parent_id INTEGER,                      -- 父分类ID，NULL表示一级分类，非NULL表示二级分类
    sort_order INTEGER DEFAULT 0,           -- 排序权重，数字越小越靠前
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, -- 创建时间
    FOREIGN KEY (parent_id) REFERENCES dict_categories(id) ON DELETE CASCADE
);

-- =============================================
-- 资金账户表：每个具体的资金存放位置
-- 例如：余额宝、沪深300基金、纸黄金账户等
-- 每个账户关联一个字典分类（叶子节点）
-- =============================================
CREATE TABLE IF NOT EXISTS fund_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,   -- 账户唯一标识
    user_id INTEGER NOT NULL,               -- 所属用户ID
    name TEXT NOT NULL,                     -- 账户名称，如"余额宝"、"沪深300基金"
    dict_category_id INTEGER NOT NULL,      -- 关联的字典分类ID（应关联到最细粒度的分类）
    current_amount REAL DEFAULT 0,          -- 当前持仓金额（冗余字段，由最近一次每日记录同步）
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, -- 创建时间
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (dict_category_id) REFERENCES dict_categories(id)
);

-- =============================================
-- 每日记录表：记录每个账户每天的持仓情况
-- 用于生成趋势图和计算收益率
-- 理财类账户需要记录每日涨跌金额
-- =============================================
CREATE TABLE IF NOT EXISTS fund_daily_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,   -- 记录唯一标识
    account_id INTEGER NOT NULL,            -- 关联的资金账户ID
    record_date DATE NOT NULL,              -- 记录日期，格式 YYYY-MM-DD
    amount REAL NOT NULL DEFAULT 0,         -- 当日持仓总金额
    daily_change REAL DEFAULT 0,            -- 当日涨跌金额（正数=盈利，负数=亏损，仅理财类使用）
    notes TEXT,                             -- 备注信息
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, -- 创建时间
    FOREIGN KEY (account_id) REFERENCES fund_accounts(id) ON DELETE CASCADE,
    UNIQUE(account_id, record_date)         -- 同一账户同一天只能有一条记录
);

-- =============================================
-- 资金变动记录表：记录入金、出金、转账等操作
-- 与每日持仓记录分开，便于追踪资金流向
-- =============================================
CREATE TABLE IF NOT EXISTS fund_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,   -- 变动唯一标识
    account_id INTEGER NOT NULL,            -- 关联的资金账户ID
    transaction_date DATE NOT NULL,         -- 变动日期，格式 YYYY-MM-DD
    type TEXT NOT NULL,                     -- 变动类型：'deposit'=入金, 'withdraw'=出金, 'transfer'=转账
    amount REAL NOT NULL,                   -- 变动金额（正数=转入，负数=转出）
    notes TEXT,                             -- 备注说明，如"工资入账"、"定投扣款"
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, -- 创建时间
    FOREIGN KEY (account_id) REFERENCES fund_accounts(id) ON DELETE CASCADE
);

-- =============================================
-- 初始化字典分类数据
-- =============================================

-- 一级分类：活钱（零钱、活期存款等流动性强的资金）
INSERT OR IGNORE INTO dict_categories (id, name, parent_id, sort_order) VALUES (1, '活钱', NULL, 1);
-- 一级分类：理财（各类投资理财产品）
INSERT OR IGNORE INTO dict_categories (id, name, parent_id, sort_order) VALUES (2, '理财', NULL, 2);
-- 一级分类：公积金（住房公积金等政策性资金）
INSERT OR IGNORE INTO dict_categories (id, name, parent_id, sort_order) VALUES (6, '公积金', NULL, 3);

-- 二级分类：理财 -> 基金（公募基金、ETF等）
INSERT OR IGNORE INTO dict_categories (id, name, parent_id, sort_order) VALUES (3, '基金', 2, 1);
-- 二级分类：理财 -> 纸黄金（银行纸黄金等贵金属投资）
INSERT OR IGNORE INTO dict_categories (id, name, parent_id, sort_order) VALUES (4, '纸黄金', 2, 2);
-- 二级分类：理财 -> 股票（A股、港股等权益类投资）
INSERT OR IGNORE INTO dict_categories (id, name, parent_id, sort_order) VALUES (5, '股票', 2, 3);
-- 二级分类：理财 -> 活期+（银行活期理财产品）
INSERT OR IGNORE INTO dict_categories (id, name, parent_id, sort_order) VALUES (7, '活期+', 2, 4);
-- 二级分类：理财 -> 活期+plus（增强型活期理财产品）
INSERT OR IGNORE INTO dict_categories (id, name, parent_id, sort_order) VALUES (8, '活期+plus', 2, 5);

-- =============================================
-- 初始化示例资金账户
-- =============================================

-- 示例账户：余额宝（关联到"活钱"分类），初始金额 31964.98
INSERT OR IGNORE INTO fund_accounts (id, user_id, name, dict_category_id, current_amount) VALUES (1, 1, '余额宝', 1, 31964.98);
-- 默认账户：基金账户（关联到"基金"分类）
INSERT OR IGNORE INTO fund_accounts (id, user_id, name, dict_category_id, current_amount) VALUES (2, 1, '基金账户', 3, 0);
-- 默认账户：纸黄金账户（关联到"纸黄金"分类）
INSERT OR IGNORE INTO fund_accounts (id, user_id, name, dict_category_id, current_amount) VALUES (3, 1, '纸黄金账户', 4, 0);
-- 默认账户：股票账户（关联到"股票"分类）
INSERT OR IGNORE INTO fund_accounts (id, user_id, name, dict_category_id, current_amount) VALUES (4, 1, '股票账户', 5, 0);
-- 默认账户：公积金账户（关联到"公积金"分类）
INSERT OR IGNORE INTO fund_accounts (id, user_id, name, dict_category_id, current_amount) VALUES (5, 1, '公积金账户', 6, 0);
-- 默认账户：活期+账户（关联到"活期+"分类）
INSERT OR IGNORE INTO fund_accounts (id, user_id, name, dict_category_id, current_amount) VALUES (6, 1, '活期+账户', 7, 0);
-- 默认账户：活期+plus账户（关联到"活期+plus"分类）
INSERT OR IGNORE INTO fund_accounts (id, user_id, name, dict_category_id, current_amount) VALUES (7, 1, '活期+plus账户', 8, 0);

-- =============================================
-- 初始化每日记录
-- =============================================

-- 余额宝初始持仓记录
INSERT OR IGNORE INTO fund_daily_records (account_id, record_date, amount, daily_change) VALUES (1, date('now'), 31964.98, 0);

-- =============================================
-- 交易分类字典表：定义收入/支出的分类
-- 用于标记每笔交易的具体类型
-- =============================================
CREATE TABLE IF NOT EXISTS dict_transaction_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,           -- 分类名称（如"工资"、"购物支出"）
    type TEXT NOT NULL,           -- 类型标识：'income'=收入类, 'expense'=支出类
    sort_order INTEGER DEFAULT 0, -- 排序权重
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- 初始化交易分类种子数据
-- =============================================

-- 收入类
INSERT OR IGNORE INTO dict_transaction_types (id, name, type, sort_order) VALUES (1, '工资', 'income', 1);
INSERT OR IGNORE INTO dict_transaction_types (id, name, type, sort_order) VALUES (2, '奖金', 'income', 2);
INSERT OR IGNORE INTO dict_transaction_types (id, name, type, sort_order) VALUES (3, '理财收益', 'income', 3);
INSERT OR IGNORE INTO dict_transaction_types (id, name, type, sort_order) VALUES (4, '转入', 'income', 4);
INSERT OR IGNORE INTO dict_transaction_types (id, name, type, sort_order) VALUES (5, '其他收入', 'income', 5);

-- 支出类
INSERT OR IGNORE INTO dict_transaction_types (id, name, type, sort_order) VALUES (6, '日常消费', 'expense', 1);
INSERT OR IGNORE INTO dict_transaction_types (id, name, type, sort_order) VALUES (7, '转出', 'expense', 2);
INSERT OR IGNORE INTO dict_transaction_types (id, name, type, sort_order) VALUES (8, '其他支出', 'expense', 3);
