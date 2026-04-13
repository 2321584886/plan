import { Router } from 'express';
import db from '../db/index.js';

const router = Router();

const GOLD_CATEGORY_ID = 4;
const BANK_NAME = '浙商银行';
const PRODUCT_NAME = '浙商黄金';
const DEFAULT_PRICE = 1057.02;
const OUNCE_TO_GRAM = 31.1034768;
const DEFAULT_SAMPLE_MS = 3 * 60 * 1000;
const XAU_JSON_URL = 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/xau.json';
const USD_JSON_URL = 'https://latest.currency-api.pages.dev/v1/currencies/usd.json';
const OPEN_ER_API_URL = 'https://open.er-api.com/v6/latest/USD';
const EXTERNAL_GOLD_URL = process.env.PAPER_GOLD_API_URL || XAU_JSON_URL;

let samplerTimer = null;

const toNumber = (value, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const round2 = (value) => Math.round(toNumber(value) * 100) / 100;
const round4 = (value) => Math.round(toNumber(value) * 10000) / 10000;

const normalizeNumText = (text) => String(text || '').replace(/,/g, '').trim();

const extractByPatterns = (text, patterns) => {
  for (const p of patterns) {
    const m = text.match(p);
    if (m?.[1]) {
      return toNumber(normalizeNumText(m[1]), null);
    }
  }
  return null;
};

const fetchJsonWithTimeout = async (url, timeoutMs = 8000) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`外部行情接口异常: ${response.status}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
};

const fetchExternalGoldQuote = async () => {
  const candidateUrls = [EXTERNAL_GOLD_URL, XAU_JSON_URL, USD_JSON_URL, OPEN_ER_API_URL]
    .filter((url, index, arr) => arr.indexOf(url) === index);

  let lastError = new Error('外部行情数据不可用');

  for (const url of candidateUrls) {
    try {
      const payload = await fetchJsonWithTimeout(url);

      // 模式0：currency-api 的 XAU 基础汇率结构（xau.cny）。
      const xauToCny = toNumber(payload?.xau?.cny, null);
      if (xauToCny && xauToCny > 0) {
        return {
          quote_time: new Date().toISOString().slice(0, 19).replace('T', ' '),
          realtime_price: round2(xauToCny / OUNCE_TO_GRAM),
          source: url,
        };
      }

      // 模式1：currency-api 的 USD 基础结构（usd.cny 与 usd.xau）。
      const usdToCnyByCurrencyApi = toNumber(payload?.usd?.cny, null);
      const usdToXauByCurrencyApi = toNumber(payload?.usd?.xau, null);
      if (usdToCnyByCurrencyApi && usdToXauByCurrencyApi && usdToXauByCurrencyApi > 0) {
        const cnyPerOunce = usdToCnyByCurrencyApi / usdToXauByCurrencyApi;
        if (cnyPerOunce > 0) {
          return {
            quote_time: new Date().toISOString().slice(0, 19).replace('T', ' '),
            realtime_price: round2(cnyPerOunce / OUNCE_TO_GRAM),
            source: url,
          };
        }
      }

      // 模式A：base=XAU，rates.CNY 表示“每盎司黄金对应人民币”。
      if (String(payload?.base || '').toUpperCase() === 'XAU') {
        const cnyPerOunce = toNumber(payload?.rates?.CNY, null);
        if (cnyPerOunce && cnyPerOunce > 0) {
          return {
            quote_time: new Date().toISOString().slice(0, 19).replace('T', ' '),
            realtime_price: round2(cnyPerOunce / OUNCE_TO_GRAM),
            source: url,
          };
        }
      }

      // 模式B：base=USD，使用 USD->CNY 与 USD->XAU 反推 CNY/XAU。
      const usdToCny = toNumber(payload?.rates?.CNY, null);
      const usdToXau = toNumber(payload?.rates?.XAU, null);
      if (usdToCny && usdToXau && usdToXau > 0) {
        const cnyPerOunce = usdToCny / usdToXau;
        if (cnyPerOunce > 0) {
          return {
            quote_time: new Date().toISOString().slice(0, 19).replace('T', ' '),
            realtime_price: round2(cnyPerOunce / OUNCE_TO_GRAM),
            source: url,
          };
        }
      }

      lastError = new Error('外部行情结构不可识别');
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
};

const getGoldAccount = (userId) => {
  let account = db.prepare(`
    SELECT id, name, current_amount
    FROM fund_accounts
    WHERE user_id = ? AND dict_category_id = ?
    ORDER BY id ASC
    LIMIT 1
  `).get(userId, GOLD_CATEGORY_ID);

  if (!account) {
    const result = db.prepare(`
      INSERT INTO fund_accounts (user_id, name, dict_category_id, current_amount)
      VALUES (?, ?, ?, 0)
    `).run(userId, `${BANK_NAME}${PRODUCT_NAME}`, GOLD_CATEGORY_ID);

    account = db.prepare(`
      SELECT id, name, current_amount
      FROM fund_accounts
      WHERE id = ?
    `).get(result.lastInsertRowid);
  }

  return account;
};

const buildSummary = (userId) => {
  const account = getGoldAccount(userId);

  const latestQuote = db.prepare(`
    SELECT quote_time, realtime_price, price_change, change_rate
    FROM paper_gold_market_snapshots
    WHERE user_id = ? AND account_id = ?
    ORDER BY id DESC
    LIMIT 1
  `).get(userId, account.id);

  const positions = db.prepare(`
    SELECT id, order_type, trade_time, grams, buy_price, buy_value, estimated_sell_fee, notes
    FROM paper_gold_positions
    WHERE user_id = ? AND account_id = ?
    ORDER BY datetime(trade_time) DESC, id DESC
  `).all(userId, account.id);

  const closedRecords = db.prepare(`
    SELECT id, closed_time, grams, buy_price, sell_price, sell_fee, pnl, notes
    FROM paper_gold_closed_records
    WHERE user_id = ? AND account_id = ?
    ORDER BY datetime(closed_time) DESC, id DESC
  `).all(userId, account.id);

  const positionGrams = positions.reduce((sum, p) => sum + toNumber(p.grams), 0);
  const currentPrice = toNumber(
    latestQuote?.realtime_price,
    positionGrams > 0 ? account.current_amount / positionGrams : DEFAULT_PRICE,
  );
  const holdingValue = round2(account.current_amount || positionGrams * currentPrice);
  const holdingGrams = round4(positionGrams > 0 ? positionGrams : (holdingValue > 0 && currentPrice > 0 ? holdingValue / currentPrice : 0));

  const totalCost = positions.reduce((sum, p) => {
    const buyValue = toNumber(p.buy_value);
    const fee = toNumber(p.estimated_sell_fee);
    return sum + buyValue + fee;
  }, 0);

  const hasPositionDetail = positions.length > 0;
  const costAvg = hasPositionDetail && holdingGrams > 0 ? round2(totalCost / holdingGrams) : 0;
  const holdingPnl = hasPositionDetail ? round2(holdingValue - totalCost) : 0;
  const closedPnl = round2(closedRecords.reduce((sum, r) => sum + toNumber(r.pnl), 0));
  const totalPnl = round2((hasPositionDetail ? holdingPnl : 0) + closedPnl);

  const enhancedPositions = positions.map((p) => {
    const grams = toNumber(p.grams);
    const marketValue = round2(grams * currentPrice);
    const costValue = round2(toNumber(p.buy_value) + toNumber(p.estimated_sell_fee));
    const pnl = round2(marketValue - costValue);

    return {
      ...p,
      grams: round4(p.grams),
      buy_price: round2(p.buy_price),
      buy_value: round2(p.buy_value),
      estimated_sell_fee: round2(p.estimated_sell_fee),
      market_value: marketValue,
      pnl,
    };
  });

  return {
    bank_name: BANK_NAME,
    product_name: PRODUCT_NAME,
    account_id: account.id,
    quote: {
      quote_time: latestQuote?.quote_time || null,
      realtime_price: round2(currentPrice),
      price_change: round2(latestQuote?.price_change || 0),
      change_rate: round2(latestQuote?.change_rate || 0),
    },
    summary: {
      holding_grams: holdingGrams,
      holding_value: holdingValue,
      cost_avg: costAvg,
      holding_pnl: holdingPnl,
      total_pnl: totalPnl,
      closed_pnl: closedPnl,
    },
    positions: enhancedPositions,
    closed_records: closedRecords.map((r) => ({
      ...r,
      grams: round4(r.grams),
      buy_price: round2(r.buy_price),
      sell_price: round2(r.sell_price),
      sell_fee: round2(r.sell_fee),
      pnl: round2(r.pnl),
    })),
  };
};

const buildPriceTrend = (userId, hours = 24) => {
  const safeHours = Math.max(1, Math.min(168, parseInt(hours, 10) || 24));
  const account = getGoldAccount(userId);

  const snapshots = db.prepare(`
    SELECT quote_time, realtime_price
    FROM paper_gold_market_snapshots
    WHERE user_id = ?
      AND account_id = ?
      AND datetime(quote_time) >= datetime('now', '-' || ? || ' hours')
      AND datetime(quote_time) <= datetime('now', '+5 minutes')
    ORDER BY datetime(quote_time) ASC, id ASC
    LIMIT 720
  `).all(userId, account.id, safeHours);

  if (snapshots.length === 0) {
    const summary = buildSummary(userId);
    const nowText = summary.quote?.quote_time || new Date().toISOString().slice(0, 19).replace('T', ' ');
    return [{
      quote_time: nowText,
      label: nowText.slice(11, 16),
      realtime_price: round2(summary.quote?.realtime_price || DEFAULT_PRICE),
    }];
  }

  return snapshots.map((item) => ({
    quote_time: item.quote_time,
    label: String(item.quote_time || '').slice(11, 16),
    realtime_price: round2(item.realtime_price),
  }));
};

const persistExternalQuoteForUser = (userId, quote, source = 'external-auto') => {
  const account = getGoldAccount(userId);
  const latestQuote = db.prepare(`
    SELECT quote_time, realtime_price
    FROM paper_gold_market_snapshots
    WHERE user_id = ? AND account_id = ?
    ORDER BY id DESC
    LIMIT 1
  `).get(userId, account.id);

  const holdingResult = db.prepare(`
    SELECT COALESCE(SUM(grams), 0) as grams
    FROM paper_gold_positions
    WHERE user_id = ? AND account_id = ?
  `).get(userId, account.id);

  const previousPrice = toNumber(latestQuote?.realtime_price, quote.realtime_price);
  const hasPrevious = !!latestQuote;
  let holdingGrams = toNumber(holdingResult?.grams, 0);

  // 无分笔持仓明细时，按“上一时刻总价值 / 上一时刻价格”估算克重。
  if (holdingGrams <= 0 && toNumber(account.current_amount) > 0 && previousPrice > 0) {
    holdingGrams = toNumber(account.current_amount) / previousPrice;
  }

  const priceChange = hasPrevious ? round2(quote.realtime_price - previousPrice) : 0;
  const changeRate = hasPrevious && previousPrice > 0
    ? round2((priceChange / previousPrice) * 100)
    : 0;

  const nextAmount = round2(holdingGrams > 0 ? holdingGrams * quote.realtime_price : toNumber(account.current_amount));
  const dailyChange = round2(holdingGrams * priceChange);

  db.prepare(`
    INSERT INTO paper_gold_market_snapshots
    (user_id, account_id, quote_time, realtime_price, price_change, change_rate, source, raw_text)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    userId,
    account.id,
    quote.quote_time,
    quote.realtime_price,
    priceChange,
    changeRate,
    source,
    `external=${quote.source}`,
  );

  db.prepare('UPDATE fund_accounts SET current_amount = ? WHERE id = ?').run(nextAmount, account.id);

  const today = new Date().toISOString().slice(0, 10);
  db.prepare(`
    INSERT OR REPLACE INTO fund_daily_records (account_id, record_date, amount, daily_change, notes)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    account.id,
    today,
    nextAmount,
    dailyChange,
    'paper-gold-auto-sample',
  );

  return {
    user_id: userId,
    account_id: account.id,
    realtime_price: quote.realtime_price,
    amount: nextAmount,
    holding_grams: round4(holdingGrams),
  };
};

export const refreshPaperGoldQuoteForUser = async (userId, source = 'external-manual') => {
  const quote = await fetchExternalGoldQuote();
  persistExternalQuoteForUser(userId, quote, source);
  return buildSummary(userId);
};

export const samplePaperGoldQuotesForAllUsers = async () => {
  const quote = await fetchExternalGoldQuote();
  const users = db.prepare('SELECT id FROM users ORDER BY id ASC').all();

  const writes = db.transaction((userRows) => {
    for (const user of userRows) {
      persistExternalQuoteForUser(user.id, quote, 'external-auto');
    }
  });

  writes(users);
  return {
    sampled_users: users.length,
    quote_time: quote.quote_time,
    realtime_price: quote.realtime_price,
  };
};

export const startPaperGoldAutoSampler = () => {
  if (process.env.PAPER_GOLD_AUTO_SAMPLE === 'false') {
    console.log('[paper-gold] auto sampler disabled by PAPER_GOLD_AUTO_SAMPLE=false');
    return null;
  }

  if (samplerTimer) {
    return samplerTimer;
  }

  const intervalMs = Math.max(
    60 * 1000,
    parseInt(process.env.PAPER_GOLD_SAMPLE_MS || '', 10) || DEFAULT_SAMPLE_MS,
  );

  const run = async () => {
    try {
      const sampled = await samplePaperGoldQuotesForAllUsers();
      if (sampled?.sampled_users > 0) {
        console.log(`[paper-gold] sampled ${sampled.sampled_users} users @ ${sampled.quote_time}, price=${sampled.realtime_price}`);
      }
    } catch (error) {
      console.error('[paper-gold] auto sampling failed:', error.message || error);
    }
  };

  run();
  samplerTimer = setInterval(run, intervalMs);
  console.log(`[paper-gold] auto sampler started, interval=${intervalMs / 1000}s`);
  return samplerTimer;
};

const syncSnapshot = (userId, payload) => {
  const account = getGoldAccount(userId);

  const quote = payload?.quote || {};
  const summary = payload?.summary || {};
  const positions = Array.isArray(payload?.positions) ? payload.positions : [];
  const closedRecords = Array.isArray(payload?.closed_records)
    ? payload.closed_records
    : Array.isArray(payload?.closedRecords)
      ? payload.closedRecords
      : [];
  const replaceAll = payload?.replace_all !== false;

  const quoteTime = quote.quote_time || quote.quoteTime || new Date().toISOString().slice(0, 19).replace('T', ' ');
  const realtimePrice = toNumber(quote.realtime_price ?? quote.realtimePrice, DEFAULT_PRICE);
  const priceChange = toNumber(quote.price_change ?? quote.priceChange, 0);
  const changeRate = toNumber(quote.change_rate ?? quote.changeRate, 0);

  const doSync = db.transaction(() => {
    db.prepare(`
      INSERT INTO paper_gold_market_snapshots
      (user_id, account_id, quote_time, realtime_price, price_change, change_rate, source, raw_text)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      account.id,
      quoteTime,
      realtimePrice,
      priceChange,
      changeRate,
      payload?.source || 'snapshot',
      payload?.raw_text || payload?.rawText || null,
    );

    if (replaceAll) {
      db.prepare('DELETE FROM paper_gold_positions WHERE user_id = ? AND account_id = ?').run(userId, account.id);
      db.prepare('DELETE FROM paper_gold_closed_records WHERE user_id = ? AND account_id = ?').run(userId, account.id);
    }

    for (const p of positions) {
      const grams = toNumber(p.grams);
      const buyPrice = toNumber(p.buy_price ?? p.buyPrice);
      if (grams <= 0 || buyPrice <= 0) continue;

      const buyValue = toNumber(p.buy_value ?? p.buyValue, grams * buyPrice);
      const fee = toNumber(p.estimated_sell_fee ?? p.estimatedSellFee, 0);
      db.prepare(`
        INSERT INTO paper_gold_positions
        (user_id, account_id, order_type, trade_time, grams, buy_price, buy_value, estimated_sell_fee, source, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        userId,
        account.id,
        p.order_type || p.orderType || '实时买入',
        p.trade_time || p.tradeTime || quoteTime,
        grams,
        buyPrice,
        buyValue,
        fee,
        payload?.source || 'snapshot',
        p.notes || null,
      );
    }

    for (const r of closedRecords) {
      const grams = toNumber(r.grams);
      const buyPrice = toNumber(r.buy_price ?? r.buyPrice);
      const sellPrice = toNumber(r.sell_price ?? r.sellPrice);
      if (grams <= 0 || buyPrice < 0 || sellPrice < 0) continue;

      const sellFee = toNumber(r.sell_fee ?? r.sellFee, 0);
      const pnl = toNumber(r.pnl, grams * (sellPrice - buyPrice) - sellFee);
      db.prepare(`
        INSERT INTO paper_gold_closed_records
        (user_id, account_id, closed_time, grams, buy_price, sell_price, sell_fee, pnl, source, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        userId,
        account.id,
        r.closed_time || r.closedTime || quoteTime,
        grams,
        buyPrice,
        sellPrice,
        sellFee,
        pnl,
        payload?.source || 'snapshot',
        r.notes || null,
      );
    }

    const persistedPositions = db.prepare(`
      SELECT grams
      FROM paper_gold_positions
      WHERE user_id = ? AND account_id = ?
    `).all(userId, account.id);

    const holdingGrams = persistedPositions.reduce((sum, item) => sum + toNumber(item.grams), 0);
    const holdingValue = toNumber(
      summary.holding_value ?? summary.holdingValue,
      holdingGrams * realtimePrice,
    );

    db.prepare('UPDATE fund_accounts SET current_amount = ? WHERE id = ?').run(round2(holdingValue), account.id);

    const today = new Date().toISOString().slice(0, 10);
    const dailyChange = toNumber(summary.daily_change ?? summary.dailyChange, holdingGrams * priceChange);
    db.prepare(`
      INSERT OR REPLACE INTO fund_daily_records (account_id, record_date, amount, daily_change, notes)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      account.id,
      today,
      round2(holdingValue),
      round2(dailyChange),
      'paper-gold-snapshot',
    );
  });

  doSync();
  return buildSummary(userId);
};

const parseOcrText = (text) => {
  const plain = String(text || '').replace(/\r/g, '\n');
  const compact = plain.replace(/\s+/g, ' ');

  const holdingGrams = extractByPatterns(plain, [
    /浙商持仓克重\s*([0-9]+(?:\.[0-9]+)?)/,
    /持仓克重\s*([0-9]+(?:\.[0-9]+)?)/,
    /克重\s*([0-9]+(?:\.[0-9]+)?)/,
  ]);

  const holdingValue = extractByPatterns(plain, [
    /总价值\s*([0-9,]+(?:\.[0-9]+)?)/,
    /价值≈?\s*([0-9,]+(?:\.[0-9]+)?)/,
  ]);

  const costAvg = extractByPatterns(plain, [
    /成本均价[^0-9]*([0-9]+(?:\.[0-9]+)?)/,
  ]);

  const holdingPnl = extractByPatterns(plain, [
    /持仓收益[^+\-0-9]*([+\-]?[0-9,]+(?:\.[0-9]+)?)/,
  ]);

  const totalPnl = extractByPatterns(plain, [
    /累计收益[^+\-0-9]*([+\-]?[0-9,]+(?:\.[0-9]+)?)/,
  ]);

  const realtimePrice = extractByPatterns(plain, [
    /实时金价[^0-9]*([0-9]+(?:\.[0-9]+)?)/,
    /浙商黄金[^0-9]*([0-9]+(?:\.[0-9]+)?)/,
  ]);

  const changeBlock = compact.match(/(?:实时金价|浙商黄金|金价)[^\n]*?([+\-][0-9]+(?:\.[0-9]+)?)\s*([+\-][0-9]+(?:\.[0-9]+)?%)/);
  const priceChange = changeBlock?.[1] ? toNumber(changeBlock[1]) : null;
  const changeRate = changeBlock?.[2] ? toNumber(changeBlock[2].replace('%', '')) : null;

  // OCR 文本无中文关键字时，按数字顺序兜底：克重、总价值、实时金价、涨跌额、涨跌幅
  const orderedNums = compact.match(/[+\-]?[0-9]+(?:\.[0-9]+)?%?/g) || [];
  const fallbackGrams = orderedNums.find((n) => /^\d+\.\d{3,}$/.test(n));
  const fallbackValue = orderedNums.find((n) => /^\d{4,}(?:\.\d+)?$/.test(n));
  const fallbackPrice = orderedNums.find((n) => /^\d{3,4}\.\d{2}$/.test(n));
  const fallbackChange = orderedNums.find((n) => /^[+\-]\d+(?:\.\d+)?$/.test(n));
  const fallbackRate = orderedNums.find((n) => /^[+\-]\d+(?:\.\d+)?%$/.test(n));

  return {
    quote: {
      realtime_price: realtimePrice ?? (fallbackPrice ? toNumber(fallbackPrice) : null),
      price_change: priceChange ?? (fallbackChange ? toNumber(fallbackChange) : null),
      change_rate: changeRate ?? (fallbackRate ? toNumber(fallbackRate.replace('%', '')) : null),
      quote_time: new Date().toISOString().slice(0, 19).replace('T', ' '),
    },
    summary: {
      holding_grams: holdingGrams ?? (fallbackGrams ? toNumber(fallbackGrams) : null),
      holding_value: holdingValue ?? (fallbackValue ? toNumber(fallbackValue) : null),
      cost_avg: costAvg,
      holding_pnl: holdingPnl,
      total_pnl: totalPnl,
    },
    positions: [],
    closed_records: [],
    raw_text: plain,
  };
};

router.get('/summary', (req, res) => {
  try {
    const result = buildSummary(req.userId);
    res.json(result);
  } catch (error) {
    console.error('获取纸黄金概览失败:', error);
    res.status(500).json({ error: '获取纸黄金概览失败' });
  }
});

router.post('/refresh-quote', async (req, res) => {
  try {
    const summary = await refreshPaperGoldQuoteForUser(req.userId, 'external-manual');
    res.json(summary);
  } catch (error) {
    console.error('手动刷新纸黄金外部行情失败:', error);
    res.status(500).json({ error: '手动刷新纸黄金外部行情失败' });
  }
});

router.get('/price-trend', (req, res) => {
  try {
    const { hours = 24 } = req.query;
    const trend = buildPriceTrend(req.userId, hours);
    res.json(trend);
  } catch (error) {
    console.error('获取纸黄金实时价格趋势失败:', error);
    res.status(500).json({ error: '获取纸黄金实时价格趋势失败' });
  }
});

router.post('/parse-ocr', (req, res) => {
  try {
    const parsed = parseOcrText(req.body?.text);
    res.json(parsed);
  } catch (error) {
    console.error('解析截图文本失败:', error);
    res.status(500).json({ error: '解析截图文本失败' });
  }
});

router.post('/snapshot', (req, res) => {
  try {
    const summary = syncSnapshot(req.userId, req.body || {});
    res.json(summary);
  } catch (error) {
    console.error('同步纸黄金截图数据失败:', error);
    res.status(500).json({ error: '同步纸黄金截图数据失败' });
  }
});

router.post('/trade', (req, res) => {
  try {
    const userId = req.userId;
    const account = getGoldAccount(userId);
    const {
      type,
      grams,
      price,
      fee = 0,
      trade_time,
      order_type,
      notes,
    } = req.body || {};

    const tradeType = String(type || '').trim();
    const tradeGrams = toNumber(grams);
    const tradePrice = toNumber(price);
    const tradeFee = toNumber(fee);
    const tradeTime = trade_time || new Date().toISOString().slice(0, 19).replace('T', ' ');

    if (!['buy', 'sell'].includes(tradeType)) {
      return res.status(400).json({ error: '交易类型必须为 buy 或 sell' });
    }

    if (tradeGrams <= 0 || tradePrice <= 0) {
      return res.status(400).json({ error: '克重和价格必须为正数' });
    }

    const tx = db.transaction(() => {
      if (tradeType === 'buy') {
        const buyValue = round2(tradeGrams * tradePrice);
        db.prepare(`
          INSERT INTO paper_gold_positions
          (user_id, account_id, order_type, trade_time, grams, buy_price, buy_value, estimated_sell_fee, source, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?)
        `).run(
          userId,
          account.id,
          order_type || '实时买入',
          tradeTime,
          tradeGrams,
          tradePrice,
          buyValue,
          tradeFee,
          notes || null,
        );
      } else {
        let remaining = tradeGrams;
        const lots = db.prepare(`
          SELECT id, trade_time, grams, buy_price
          FROM paper_gold_positions
          WHERE user_id = ? AND account_id = ?
          ORDER BY datetime(trade_time) ASC, id ASC
        `).all(userId, account.id);

        const available = lots.reduce((sum, lot) => sum + toNumber(lot.grams), 0);
        if (available + 0.000001 < tradeGrams) {
          throw new Error(`持仓不足，可卖克重 ${round4(available)}`);
        }

        for (const lot of lots) {
          if (remaining <= 0) break;
          const lotGrams = toNumber(lot.grams);
          const used = Math.min(remaining, lotGrams);
          const left = round4(lotGrams - used);

          const allocFee = round2((used / tradeGrams) * tradeFee);
          const pnl = round2(used * (tradePrice - toNumber(lot.buy_price)) - allocFee);

          db.prepare(`
            INSERT INTO paper_gold_closed_records
            (user_id, account_id, closed_time, grams, buy_price, sell_price, sell_fee, pnl, source, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?)
          `).run(
            userId,
            account.id,
            tradeTime,
            used,
            lot.buy_price,
            tradePrice,
            allocFee,
            pnl,
            notes || '手动卖出',
          );

          if (left <= 0) {
            db.prepare('DELETE FROM paper_gold_positions WHERE id = ?').run(lot.id);
          } else {
            db.prepare('UPDATE paper_gold_positions SET grams = ?, buy_value = ? WHERE id = ?')
              .run(left, round2(left * toNumber(lot.buy_price)), lot.id);
          }

          remaining = round4(remaining - used);
        }
      }

      const holding = db.prepare(`
        SELECT COALESCE(SUM(grams), 0) as grams
        FROM paper_gold_positions
        WHERE user_id = ? AND account_id = ?
      `).get(userId, account.id);

      const latestQuote = db.prepare(`
        SELECT realtime_price
        FROM paper_gold_market_snapshots
        WHERE user_id = ? AND account_id = ?
        ORDER BY id DESC
        LIMIT 1
      `).get(userId, account.id);

      const valuationPrice = toNumber(latestQuote?.realtime_price, tradePrice);
      const amount = round2(toNumber(holding.grams) * valuationPrice);
      db.prepare('UPDATE fund_accounts SET current_amount = ? WHERE id = ?').run(amount, account.id);

      const today = new Date().toISOString().slice(0, 10);
      db.prepare(`
        INSERT OR REPLACE INTO fund_daily_records (account_id, record_date, amount, daily_change, notes)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        account.id,
        today,
        amount,
        0,
        'paper-gold-trade',
      );
    });

    tx();
    res.json(buildSummary(userId));
  } catch (error) {
    console.error('录入纸黄金交易失败:', error);
    res.status(400).json({ error: error.message || '录入纸黄金交易失败' });
  }
});

export default router;
