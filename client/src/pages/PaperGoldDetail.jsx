import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Drawer,
  Form,
  Image,
  Input,
  InputNumber,
  message,
  Modal,
  Progress,
  Row,
  Segmented,
  Space,
  Statistic,
  Table,
  Tag,
} from 'antd';
import {
  AudioOutlined,
  CloudUploadOutlined,
  DeleteOutlined,
  FileImageOutlined,
  GoldOutlined,
  RiseOutlined,
  SyncOutlined,
  TransactionOutlined,
} from '@ant-design/icons';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import PageContainer from '../components/PageContainer';
import { borderRadius, colors, shadows, spacing, typography } from '../theme';
import './paperGold.css';

const POSITIONS_TOOLTIP = '数组字段示例：[{"order_type":"实时买入","trade_time":"2026-03-23 13:59:21","grams":1.1471,"buy_price":958.96,"buy_value":1213.02,"estimated_sell_fee":4.85}]';
const CLOSED_TOOLTIP = '数组字段示例：[{"closed_time":"2026-04-08 15:30:00","grams":4.1343,"buy_price":1209.39,"sell_price":1061.88,"sell_fee":17.56,"pnl":-627.41}]';
const AUTO_REFRESH_MS = 3 * 60 * 1000;
const AUTO_REFRESH_MINUTES = AUTO_REFRESH_MS / (60 * 1000);

const formatMoney = (value) => Number(value || 0).toLocaleString('zh-CN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const formatGrams = (value) => Number(value || 0).toFixed(4);
const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;

const pnlColor = (value) => {
  const num = Number(value || 0);
  if (num > 0) return colors.danger;
  if (num < 0) return colors.success;
  return colors.text.secondary;
};

export default function PaperGoldDetail() {
  const [loading, setLoading] = useState(true);
  const [summaryData, setSummaryData] = useState(null);
  const [trendHours, setTrendHours] = useState('6');
  const [priceTrend, setPriceTrend] = useState([]);
  const [refreshingQuote, setRefreshingQuote] = useState(false);

  const [syncVisible, setSyncVisible] = useState(false);
  const [syncSubmitting, setSyncSubmitting] = useState(false);
  const [ocrText, setOcrText] = useState('');
  const [imageParsing, setImageParsing] = useState(false);
  const [imageParseProgress, setImageParseProgress] = useState(0);
  const [pastedImageFile, setPastedImageFile] = useState(null);
  const [pastedImageUrl, setPastedImageUrl] = useState('');

  const [tradeVisible, setTradeVisible] = useState(false);
  const [tradeSubmitting, setTradeSubmitting] = useState(false);

  const [syncForm] = Form.useForm();
  const [tradeForm] = Form.useForm();
  const imageInputRef = useRef(null);

  const fetchSummary = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    try {
      const now = Date.now();
      const [summaryRes, trendRes] = await Promise.all([
        fetch(`/api/funds/paper-gold/summary?t=${now}`, { cache: 'no-store' }),
        fetch(`/api/funds/paper-gold/price-trend?hours=${trendHours}&t=${now}`, { cache: 'no-store' }),
      ]);

      if (!summaryRes.ok) throw new Error('纸黄金概览加载失败');
      const summary = await summaryRes.json();
      setSummaryData(summary);

      if (trendRes.ok) {
        const trend = await trendRes.json();
        setPriceTrend(Array.isArray(trend) ? trend : []);
      } else {
        setPriceTrend([]);
      }
    } catch (error) {
      console.error(error);
      if (showSpinner) {
        message.error(error.message || '数据加载失败');
      }
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, [trendHours]);

  useEffect(() => {
    fetchSummary(true);
    const timer = setInterval(() => {
      fetchSummary(false);
    }, AUTO_REFRESH_MS);

    return () => clearInterval(timer);
  }, [fetchSummary]);

  useEffect(() => () => {
    if (pastedImageUrl) URL.revokeObjectURL(pastedImageUrl);
  }, [pastedImageUrl]);

  const summary = summaryData?.summary || {};

  const quoteLabel = useMemo(() => {
    const q = summaryData?.quote;
    if (!q?.quote_time) return `行情未同步 · 每${AUTO_REFRESH_MINUTES}分钟自动刷新`;
    return `行情 ${q.quote_time} · 每${AUTO_REFRESH_MINUTES}分钟自动刷新`;
  }, [summaryData]);

  const realtimeProfit = useMemo(() => {
    const grams = Number(summary.holding_grams || 0);
    const deltaPrice = Number(summaryData?.quote?.price_change || 0);
    return round2(grams * deltaPrice);
  }, [summary.holding_grams, summaryData?.quote?.price_change]);

  const realtimeProfitRate = useMemo(() => {
    const holdingValue = Number(summary.holding_value || 0);
    if (holdingValue <= 0) return 0;
    return round2((realtimeProfit / holdingValue) * 100);
  }, [realtimeProfit, summary.holding_value]);

  const trendStats = useMemo(() => {
    if (!priceTrend.length) {
      return {
        open: 0,
        close: 0,
        high: 0,
        low: 0,
        change: 0,
        changeRate: 0,
      };
    }

    const first = priceTrend[0];
    const last = priceTrend[priceTrend.length - 1];
    let high = first.realtime_price;
    let low = first.realtime_price;

    for (const item of priceTrend) {
      const p = Number(item.realtime_price || 0);
      if (p > high) high = p;
      if (p < low) low = p;
    }

    const open = Number(first.realtime_price || 0);
    const close = Number(last.realtime_price || 0);
    const change = round2(close - open);
    const changeRate = open > 0 ? round2((change / open) * 100) : 0;

    return { open, close, high, low, change, changeRate };
  }, [priceTrend]);

  const trendUp = trendStats.change >= 0;

  const trendYDomain = useMemo(() => {
    if (!priceTrend.length) return ['auto', 'auto'];

    const prices = priceTrend.map((item) => Number(item.realtime_price || 0));
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const pad = Math.max(0.3, (maxPrice - minPrice) * 0.2);

    return [round2(minPrice - pad), round2(maxPrice + pad)];
  }, [priceTrend]);

  const handleManualRefreshQuote = async () => {
    setRefreshingQuote(true);
    try {
      const res = await fetch('/api/funds/paper-gold/refresh-quote', {
        method: 'POST',
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || '刷新行情失败');
      }

      await fetchSummary(false);
      message.success('已拉取外部金价并刷新页面');
    } catch (error) {
      console.error(error);
      message.error(error.message || '刷新行情失败');
    } finally {
      setRefreshingQuote(false);
    }
  };

  const positionColumns = [
    {
      title: '买入类型/时间',
      dataIndex: 'order_type',
      key: 'order_type',
      width: 180,
      render: (_, row) => (
        <div>
          <div style={{ fontWeight: 600 }}>{row.order_type}</div>
          <div style={{ color: colors.text.secondary }}>{row.trade_time}</div>
        </div>
      ),
    },
    {
      title: '克重/价值',
      key: 'weight',
      width: 170,
      render: (_, row) => (
        <div>
          <div>{formatGrams(row.grams)}g</div>
          <div style={{ color: colors.text.secondary }}>¥{formatMoney(row.buy_value)}</div>
        </div>
      ),
    },
    {
      title: '买入价/预估卖出费',
      key: 'cost',
      width: 190,
      render: (_, row) => (
        <div>
          <div>¥{formatMoney(row.buy_price)}/克</div>
          <div style={{ color: colors.text.secondary }}>¥{formatMoney(row.estimated_sell_fee)}</div>
        </div>
      ),
    },
    {
      title: '持仓收益',
      dataIndex: 'pnl',
      key: 'pnl',
      width: 130,
      render: (value) => (
        <span style={{ color: pnlColor(value), fontWeight: 700 }}>
          {Number(value || 0) >= 0 ? '+' : ''}{formatMoney(value)}
        </span>
      ),
    },
  ];

  const closedColumns = [
    {
      title: '克重/时间',
      key: 'weight',
      width: 170,
      render: (_, row) => (
        <div>
          <div>{formatGrams(row.grams)}g</div>
          <div style={{ color: colors.text.secondary }}>{String(row.closed_time || '').slice(0, 10)}</div>
        </div>
      ),
    },
    {
      title: '买入价/卖出均价',
      key: 'price',
      width: 180,
      render: (_, row) => (
        <div>
          <div>{formatMoney(row.buy_price)}</div>
          <div style={{ color: colors.text.secondary }}>{formatMoney(row.sell_price)}</div>
        </div>
      ),
    },
    {
      title: '卖出手续费',
      dataIndex: 'sell_fee',
      key: 'sell_fee',
      width: 130,
      render: (value) => formatMoney(value),
    },
    {
      title: '累计收益',
      dataIndex: 'pnl',
      key: 'pnl',
      width: 130,
      render: (value) => (
        <span style={{ color: pnlColor(value), fontWeight: 700 }}>
          {Number(value || 0) >= 0 ? '+' : ''}{formatMoney(value)}
        </span>
      ),
    },
  ];

  const fillSyncFormByText = async (text) => {
    const res = await fetch('/api/funds/paper-gold/parse-ocr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });

    if (!res.ok) throw new Error('OCR 解析失败');
    const parsed = await res.json();

    syncForm.setFieldsValue({
      quote_time: parsed.quote?.quote_time,
      realtime_price: parsed.quote?.realtime_price,
      price_change: parsed.quote?.price_change,
      change_rate: parsed.quote?.change_rate,
      holding_grams: parsed.summary?.holding_grams,
      holding_value: parsed.summary?.holding_value,
      cost_avg: parsed.summary?.cost_avg,
      holding_pnl: parsed.summary?.holding_pnl,
      total_pnl: parsed.summary?.total_pnl,
    });

    return parsed;
  };

  const handleParseOCR = async () => {
    if (!ocrText.trim()) {
      message.warning('请先粘贴截图 OCR 文本');
      return;
    }

    try {
      await fillSyncFormByText(ocrText);
      message.success('解析完成，请检查后提交同步');
    } catch (error) {
      console.error(error);
      message.error(error.message || 'OCR 解析失败');
    }
  };

  const replacePastedImage = (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      message.warning('请粘贴图片类型的截图');
      return;
    }

    if (pastedImageUrl) URL.revokeObjectURL(pastedImageUrl);
    const imageUrl = URL.createObjectURL(file);
    setPastedImageFile(file);
    setPastedImageUrl(imageUrl);
  };

  const handlePasteImage = (event) => {
    const items = Array.from(event.clipboardData?.items || []);
    const imageItem = items.find((item) => item.type.startsWith('image/'));
    if (!imageItem) return;

    event.preventDefault();
    const file = imageItem.getAsFile();
    replacePastedImage(file);
    message.success('截图已粘贴，可点击“识别粘贴图片”');
  };

  const handleChooseImage = () => {
    imageInputRef.current?.click();
  };

  const handleImageInputChange = (event) => {
    const file = event.target.files?.[0];
    replacePastedImage(file);
    if (event.target) event.target.value = '';
  };

  const handleClearImage = () => {
    if (pastedImageUrl) URL.revokeObjectURL(pastedImageUrl);
    setPastedImageUrl('');
    setPastedImageFile(null);
  };

  const handleParsePastedImage = async () => {
    if (!pastedImageFile) {
      message.warning('请先 Ctrl+V 粘贴截图图片');
      return;
    }

    setImageParsing(true);
    setImageParseProgress(0);

    try {
      const tesseractModule = await import('tesseract.js');
      const recognize = tesseractModule.recognize || tesseractModule.default?.recognize;
      if (!recognize) throw new Error('OCR 引擎加载失败');

      const result = await recognize(pastedImageFile, 'chi_sim+eng', {
        logger: (event) => {
          if (event?.status === 'recognizing text' && typeof event.progress === 'number') {
            setImageParseProgress(Math.round(event.progress * 100));
          }
        },
      });

      const parsedText = String(result?.data?.text || '').trim();
      if (!parsedText) throw new Error('图片未识别出文本，请确认截图清晰度');

      setOcrText(parsedText);
      await fillSyncFormByText(parsedText);
      message.success('图片识别并解析完成，可直接提交同步');
    } catch (error) {
      console.error(error);
      message.error(error.message || '图片识别失败，请稍后重试');
    } finally {
      setImageParsing(false);
      setImageParseProgress(0);
    }
  };

  const handleSyncSubmit = async (values) => {
    setSyncSubmitting(true);
    try {
      const payload = {
        source: 'snapshot',
        raw_text: ocrText || null,
        quote: {
          quote_time: values.quote_time,
          realtime_price: values.realtime_price,
          price_change: values.price_change,
          change_rate: values.change_rate,
        },
        summary: {
          holding_grams: values.holding_grams,
          holding_value: values.holding_value,
          cost_avg: values.cost_avg,
          holding_pnl: values.holding_pnl,
          total_pnl: values.total_pnl,
        },
        positions: [],
        closed_records: [],
      };

      const positionsText = values.positions_json?.trim();
      const closedText = values.closed_json?.trim();
      if (positionsText) payload.positions = JSON.parse(positionsText);
      if (closedText) payload.closed_records = JSON.parse(closedText);

      const res = await fetch('/api/funds/paper-gold/snapshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || '同步失败');
      }

      message.success('截图数据已同步到纸黄金资金台账');
      setSyncVisible(false);
      await fetchSummary(false);
    } catch (error) {
      console.error(error);
      message.error(error.message || '同步失败，请检查 JSON 格式');
    } finally {
      setSyncSubmitting(false);
    }
  };

  const handleOpenTrade = (type) => {
    tradeForm.resetFields();
    tradeForm.setFieldsValue({ type, trade_time: new Date().toISOString().slice(0, 19).replace('T', ' ') });
    setTradeVisible(true);
  };

  const handleTradeSubmit = async (values) => {
    setTradeSubmitting(true);
    try {
      const res = await fetch('/api/funds/paper-gold/trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || '交易录入失败');
      }

      message.success('买卖记录已更新');
      setTradeVisible(false);
      await fetchSummary(false);
    } catch (error) {
      console.error(error);
      message.error(error.message || '交易录入失败');
    } finally {
      setTradeSubmitting(false);
    }
  };

  const summaryTag = Number(realtimeProfit || 0) >= 0 ? '上涨中' : '回撤中';

  return (
    <PageContainer title="浙商纸黄金" loading={loading}>
      <div className="paper-gold-page page-fade-in">
        <Card className="paper-gold-hero card-fade-in" variant="borderless">
          <div className="paper-gold-hero-top">
            <div>
              <div className="paper-gold-title">京东黄金 · 积存金</div>
              <div className="paper-gold-subtitle">
                <Tag color="gold">{summaryData?.bank_name || '浙商银行'}</Tag>
                <span>{quoteLabel}</span>
              </div>
            </div>
            <Space wrap>
              <Button icon={<SyncOutlined />} loading={refreshingQuote} onClick={handleManualRefreshQuote}>
                立即刷新
              </Button>
              <Button icon={<CloudUploadOutlined />} onClick={() => setSyncVisible(true)}>
                截图同步
              </Button>
              <Button type="primary" icon={<TransactionOutlined />} onClick={() => handleOpenTrade('buy')}>
                录入买入/卖出
              </Button>
            </Space>
          </div>

          <Alert
            type="warning"
            icon={<AudioOutlined />}
            showIcon
            title="关于防范黄金业务市场风险的提示"
            className="paper-gold-risk"
          />

          <Row gutter={[16, 16]}>
            <Col xs={24} md={10}>
              <Card className="paper-gold-hold-card" variant="borderless">
                <div className="paper-gold-hold-title">持仓克重</div>
                <div className="paper-gold-hold-grams">{formatGrams(summary.holding_grams)}g</div>
                <div className="paper-gold-hold-meta">总价值 ¥{formatMoney(summary.holding_value)}</div>
                <div className="paper-gold-kpis">
                  <div>
                    <div className="paper-gold-kpi-label">成本均价(元/克)</div>
                    <div className="paper-gold-kpi-value">{formatMoney(summary.cost_avg)}</div>
                  </div>
                  <div>
                    <div className="paper-gold-kpi-label">持仓收益(元)</div>
                    <div className="paper-gold-kpi-value" style={{ color: pnlColor(summary.holding_pnl) }}>
                      {Number(summary.holding_pnl || 0) >= 0 ? '+' : ''}{formatMoney(summary.holding_pnl)}
                    </div>
                  </div>
                  <div>
                    <div className="paper-gold-kpi-label">累计收益(元)</div>
                    <div className="paper-gold-kpi-value" style={{ color: pnlColor(summary.total_pnl) }}>
                      {Number(summary.total_pnl || 0) >= 0 ? '+' : ''}{formatMoney(summary.total_pnl)}
                    </div>
                  </div>
                </div>
              </Card>
            </Col>

            <Col xs={24} md={14}>
              <Card className="paper-gold-price-card" variant="borderless">
                <Row gutter={16}>
                  <Col xs={24} sm={12}>
                    <Statistic
                      title="浙商实时金价(元/克)"
                      value={summaryData?.quote?.realtime_price || 0}
                      precision={2}
                      styles={{
                        content: {
                          color: colors.danger,
                          fontSize: 38,
                          fontWeight: 700,
                        },
                      }}
                      prefix={<GoldOutlined />}
                    />
                  </Col>
                  <Col xs={24} sm={12}>
                    <div className="paper-gold-quote-side">
                      <div>
                        <div className="paper-gold-kpi-label">每克涨跌</div>
                        <div style={{ color: pnlColor(summaryData?.quote?.price_change), fontWeight: 700, fontSize: 20 }}>
                          {Number(summaryData?.quote?.price_change || 0) >= 0 ? '+' : ''}{formatMoney(summaryData?.quote?.price_change)}
                        </div>
                      </div>
                      <div>
                        <div className="paper-gold-kpi-label">每克涨跌幅</div>
                        <div style={{ color: pnlColor(summaryData?.quote?.change_rate), fontWeight: 700, fontSize: 20 }}>
                          {Number(summaryData?.quote?.change_rate || 0) >= 0 ? '+' : ''}{formatMoney(summaryData?.quote?.change_rate)}%
                        </div>
                      </div>
                      <Tag color={Number(realtimeProfit || 0) >= 0 ? 'error' : 'green'} icon={<RiseOutlined />}>
                        {summaryTag}
                      </Tag>
                    </div>
                  </Col>
                </Row>

                <div className="paper-gold-live-grid">
                  <div className="paper-gold-live-item">
                    <div className="paper-gold-kpi-label">实时收益(元)</div>
                    <div className="paper-gold-live-value" style={{ color: pnlColor(realtimeProfit) }}>
                      {Number(realtimeProfit || 0) >= 0 ? '+' : ''}{formatMoney(realtimeProfit)}
                    </div>
                  </div>
                  <div className="paper-gold-live-item">
                    <div className="paper-gold-kpi-label">实时收益率</div>
                    <div className="paper-gold-live-value" style={{ color: pnlColor(realtimeProfitRate) }}>
                      {Number(realtimeProfitRate || 0) >= 0 ? '+' : ''}{formatMoney(realtimeProfitRate)}%
                    </div>
                  </div>
                </div>

                <div className="paper-gold-price-trend">
                  <div className="paper-gold-price-trend-header">
                    <span>实时价格走势图</span>
                    <Segmented
                      size="small"
                      value={trendHours}
                      onChange={setTrendHours}
                      options={[
                        { label: '1小时', value: '1' },
                        { label: '6小时', value: '6' },
                        { label: '24小时', value: '24' },
                      ]}
                    />
                  </div>

                  <div className="paper-gold-price-trend-stats">
                    <span>开 {formatMoney(trendStats.open)}</span>
                    <span>高 {formatMoney(trendStats.high)}</span>
                    <span>低 {formatMoney(trendStats.low)}</span>
                    <span>收 {formatMoney(trendStats.close)}</span>
                    <span style={{ color: pnlColor(trendStats.change) }}>
                      区间 {trendStats.change >= 0 ? '+' : ''}{formatMoney(trendStats.change)} ({trendStats.changeRate >= 0 ? '+' : ''}{formatMoney(trendStats.changeRate)}%)
                    </span>
                  </div>

                  <ResponsiveContainer width="100%" height={180}>
                    <AreaChart data={priceTrend}>
                      <defs>
                        <linearGradient id="paperGoldPriceTrend" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={trendUp ? '#d74653' : '#1ea56f'} stopOpacity={0.5} />
                          <stop offset="100%" stopColor={trendUp ? '#d74653' : '#1ea56f'} stopOpacity={0.04} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,23,42,0.08)" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} width={58} domain={trendYDomain} />
                      <Tooltip
                        formatter={(value) => [`¥${formatMoney(value)}`, '实时金价']}
                        labelFormatter={(label, payload) => payload?.[0]?.payload?.quote_time || label}
                      />
                      <Area
                        type="monotone"
                        dataKey="realtime_price"
                        stroke={trendUp ? '#d74653' : '#1ea56f'}
                        strokeWidth={2.2}
                        fill="url(#paperGoldPriceTrend)"
                        dot={(dotProps) => {
                          if (dotProps.index === 0 || dotProps.index === priceTrend.length - 1) {
                            return <circle cx={dotProps.cx} cy={dotProps.cy} r={3} fill={trendUp ? '#d74653' : '#1ea56f'} />;
                          }
                          return null;
                        }}
                        activeDot={{ r: 4 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                <div className="paper-gold-live-hint">
                  实时价格、实时收益和走势图按页面每{AUTO_REFRESH_MINUTES}分钟自动刷新，效果与京东金融一致。
                </div>
              </Card>
            </Col>
          </Row>

          <div className="paper-gold-actions">
            <Button className="paper-gold-btn sell" onClick={() => handleOpenTrade('sell')}>卖出</Button>
            <Button className="paper-gold-btn buy" type="primary" onClick={() => handleOpenTrade('buy')}>买入</Button>
          </div>
        </Card>

        <Row gutter={[16, 16]} style={{ marginTop: spacing.lg }}>
          <Col xs={24} lg={12}>
            <Card
              variant="borderless"
              title="持仓明细"
              extra={<Button type="link" icon={<SyncOutlined />} onClick={() => fetchSummary(false)}>刷新</Button>}
              style={{ borderRadius: borderRadius.lg, boxShadow: shadows.card }}
            >
              <Table
                rowKey="id"
                columns={positionColumns}
                dataSource={summaryData?.positions || []}
                pagination={{ pageSize: 6 }}
                scroll={{ x: 620 }}
                size="small"
              />
            </Card>
          </Col>

          <Col xs={24} lg={12}>
            <Card
              variant="borderless"
              title="清仓记录"
              style={{ borderRadius: borderRadius.lg, boxShadow: shadows.card }}
            >
              <Table
                rowKey="id"
                columns={closedColumns}
                dataSource={summaryData?.closed_records || []}
                pagination={{ pageSize: 6 }}
                scroll={{ x: 620 }}
                size="small"
              />
            </Card>
          </Col>
        </Row>
      </div>

      <Drawer
        title="根据京东金融截图同步资金"
        size="large"
        open={syncVisible}
        onClose={() => setSyncVisible(false)}
      >
        <div style={{ marginBottom: spacing.md, ...typography.caption, color: colors.text.secondary }}>
          支持直接粘贴图片：先在此区域按 Ctrl+V 粘贴截图，再点击“识别粘贴图片”自动提取文本并回填字段。
        </div>

        <div className="paper-gold-paste-zone" tabIndex={0} onPaste={handlePasteImage}>
          <div className="paper-gold-paste-title">截图粘贴区（Ctrl+V）</div>
          <div className="paper-gold-paste-subtitle">可直接粘贴京东金融截图，也可手动选择本地图片</div>

          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageInputChange}
            style={{ display: 'none' }}
          />

          <Space wrap style={{ marginTop: spacing.sm }}>
            <Button icon={<FileImageOutlined />} onClick={handleChooseImage}>选择图片</Button>
            <Button type="primary" icon={<AudioOutlined />} onClick={handleParsePastedImage} loading={imageParsing}>
              识别粘贴图片
            </Button>
            <Button icon={<DeleteOutlined />} onClick={handleClearImage} disabled={!pastedImageUrl}>清空图片</Button>
          </Space>

          {imageParsing && (
            <div className="paper-gold-ocr-progress">
              <Progress percent={imageParseProgress} size="small" status="active" />
            </div>
          )}

          {pastedImageUrl && (
            <div className="paper-gold-preview-wrap">
              <Image src={pastedImageUrl} alt="截图预览" className="paper-gold-preview" />
            </div>
          )}
        </div>

        <Input.TextArea
          value={ocrText}
          onChange={(event) => setOcrText(event.target.value)}
          placeholder="OCR 文本会自动写入这里，也可以手动粘贴文本"
          rows={6}
          style={{ marginBottom: spacing.md }}
        />

        <Button onClick={handleParseOCR} icon={<AudioOutlined />} style={{ marginBottom: spacing.lg }}>
          解析 OCR 文本
        </Button>

        <Form layout="vertical" form={syncForm} onFinish={handleSyncSubmit}>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item label="行情时间" name="quote_time">
                <Input placeholder="2026-04-08 15:41:00" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="实时金价(元/克)" name="realtime_price">
                <InputNumber min={0} precision={2} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={12}>
            <Col span={12}>
              <Form.Item label="涨跌额" name="price_change">
                <InputNumber precision={2} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="涨跌幅(%)" name="change_rate">
                <InputNumber precision={2} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={12}>
            <Col span={12}>
              <Form.Item label="持仓克重" name="holding_grams">
                <InputNumber min={0} precision={4} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="总价值(元)" name="holding_value">
                <InputNumber min={0} precision={2} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={12}>
            <Col span={8}>
              <Form.Item label="成本均价" name="cost_avg">
                <InputNumber precision={2} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="持仓收益" name="holding_pnl">
                <InputNumber precision={2} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="累计收益" name="total_pnl">
                <InputNumber precision={2} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            label="持仓明细 JSON（可选，提交后会覆盖当前持仓）"
            name="positions_json"
            tooltip={POSITIONS_TOOLTIP}
          >
            <Input.TextArea rows={5} placeholder="[]" />
          </Form.Item>

          <Form.Item
            label="清仓记录 JSON（可选）"
            name="closed_json"
            tooltip={CLOSED_TOOLTIP}
          >
            <Input.TextArea rows={5} placeholder="[]" />
          </Form.Item>

          <Space>
            <Button onClick={() => setSyncVisible(false)}>取消</Button>
            <Button type="primary" htmlType="submit" loading={syncSubmitting} icon={<CloudUploadOutlined />}>
              同步资金数据
            </Button>
          </Space>
        </Form>
      </Drawer>

      <Modal
        title="录入纸黄金交易"
        open={tradeVisible}
        onCancel={() => setTradeVisible(false)}
        onOk={() => tradeForm.submit()}
        confirmLoading={tradeSubmitting}
        okText="提交"
      >
        <Form form={tradeForm} layout="vertical" onFinish={handleTradeSubmit}>
          <Form.Item name="type" label="交易类型" rules={[{ required: true, message: '请选择交易类型' }]}>
            <Segmented
              options={[
                { label: '买入', value: 'buy' },
                { label: '卖出', value: 'sell' },
              ]}
              block
            />
          </Form.Item>

          <Form.Item name="order_type" label="订单类型">
            <Input placeholder="实时买入 / 限价买入" />
          </Form.Item>

          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="grams" label="克重" rules={[{ required: true, message: '请输入克重' }]}>
                <InputNumber min={0} precision={4} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="price" label="成交价(元/克)" rules={[{ required: true, message: '请输入成交价' }]}>
                <InputNumber min={0} precision={2} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="fee" label="手续费">
                <InputNumber min={0} precision={2} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="trade_time" label="交易时间">
                <Input placeholder="YYYY-MM-DD HH:mm:ss" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </PageContainer>
  );
}
