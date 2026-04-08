/**
 * 理财总览页面 - FinanceOverview
 *
 * 展示用户理财资产的全局概览，包括总金额、收益率、资产分布饼图、
 * 资金趋势折线图、收益趋势图、综合收益日历，以及各子分类的快捷入口卡片。
 *
 * @module FinanceOverview
 *
 * 数据来源：
 * - GET /api/funds/category/2/detail  —— 理财分类详情（子分类 + 账户）
 * - GET /api/funds/category/2/returns —— 理财收益率（日/周/月/累计/年化）
 * - GET /api/funds/category/2/earnings-trend —— 收益趋势
 */
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Row, Col, Card, Modal, Table, message } from 'antd';
import { FolderOutlined } from '@ant-design/icons';
import {
  PieChart, Pie, Cell, Tooltip as ReTooltip,
  ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid as BarGrid,
  Tooltip as BarTooltip, Legend as BarLegend,
} from 'recharts';

import PageContainer from '../components/PageContainer';
import StatCard from '../components/StatCard';
import ChartCard from '../components/ChartCard';
import TrendChart from '../components/TrendChart';
import TrendValue from '../components/TrendValue';
import FinanceEarningsCalendar from '../components/FinanceEarningsCalendar';
import { colors, spacing, typography, borderRadius, shadows } from '../theme';

/* ========== 工具函数 ========== */

/**
 * 金额格式化 —— 带千分位分隔符，保留两位小数
 */
const formatMoney = (amount) => {
  if (amount === null || amount === undefined) return '--';
  return Number(amount).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

/**
 * 判断收益率数据是否全部为零
 */
const isAllReturnsZero = (returns) => {
  if (!returns) return true;
  const { daily, weekly, monthly, total, annualized } = returns;
  return (
    daily?.change === 0 && daily?.rate === 0 &&
    weekly?.change === 0 && weekly?.rate === 0 &&
    monthly?.change === 0 && monthly?.rate === 0 &&
    total?.change === 0 && total?.rate === 0 &&
    annualized === 0
  );
};

/**
 * 五维度收益率卡片配置
 */
const buildReturnCards = (returns) => {
  if (!returns) return [];
  return [
    { label: '当日收益', change: returns.daily?.change, rate: returns.daily?.rate },
    { label: '7日收益', change: returns.weekly?.change, rate: returns.weekly?.rate },
    { label: '30日收益', change: returns.monthly?.change, rate: returns.monthly?.rate },
    { label: '累计收益', change: returns.total?.change, rate: returns.total?.rate },
    { label: '年化收益率', change: null, rate: returns.annualized },
  ];
};

/* ========== 主组件 ========== */

const FinanceOverview = () => {
  const navigate = useNavigate();

  const [detail, setDetail] = useState(null);
  const [returns, setReturns] = useState(null);
  const [trendData, setTrendData] = useState([]);
  const [trendDays, setTrendDays] = useState('30');
  const [earningsTrendData, setEarningsTrendData] = useState([]);
  const [earningsDays, setEarningsDays] = useState('30');
  const [loading, setLoading] = useState(true);
  const [dateDetailVisible, setDateDetailVisible] = useState(false);
  const [selectedDate, setSelectedDate] = useState('');
  const [dateDetailData, setDateDetailData] = useState([]);
  const [dateDetailLoading, setDateDetailLoading] = useState(false);

  /* ---------- 数据获取 ---------- */

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [detailRes, returnsRes] = await Promise.all([
          fetch('/api/funds/category/2/detail'),
          fetch('/api/funds/category/2/returns'),
        ]);

        if (!detailRes.ok) throw new Error('获取理财详情失败');
        if (!returnsRes.ok) throw new Error('获取收益率数据失败');

        const detailData = await detailRes.json();
        const returnsData = await returnsRes.json();

        setDetail(detailData);
        setReturns(returnsData);
      } catch (err) {
        console.error('[FinanceOverview] 数据加载失败:', err);
        message.error(err.message || '数据加载失败，请稍后重试');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  /** 资金趋势数据 */
  useEffect(() => {
    fetch(`/api/funds/category/2/detail?days=${trendDays}`)
      .then(res => res.json())
      .then(data => {
        const trend = (data.trend || []).map(item => ({
          date: item.date,
          amount: item.total_amount,
        }));
        setTrendData(trend);
      })
      .catch(console.error);
  }, [trendDays]);

  /** 收益趋势数据 */
  useEffect(() => {
    fetch(`/api/funds/category/2/earnings-trend?days=${earningsDays}`)
      .then(res => (res.ok ? res.json() : []))
      .then(data => setEarningsTrendData(data))
      .catch(console.error);
  }, [earningsDays]);

  /**
   * 日历日期点击处理 — 获取该日期各账户明细
   */
  const handleDateSelect = async (dateStr) => {
    setSelectedDate(dateStr);
    setDateDetailVisible(true);

    if (!detail?.children) {
      setDateDetailData([]);
      return;
    }

    setDateDetailLoading(true);
    try {
      const allDetails = [];

      for (const child of detail.children) {
        for (const acc of (child.accounts || [])) {
          let lastAmount = acc.current_amount;
          let lastChange = acc.daily_change;

          try {
            const year = parseInt(dateStr.substring(0, 4));
            const month = parseInt(dateStr.substring(5, 7));
            const dateRes = await fetch(
              `/api/daily-records/calendar?account_id=${acc.id}&year=${year}&month=${month}`
            );
            if (dateRes.ok) {
              const dateData = await dateRes.json();
              const dayRecord = (dateData.days || []).find(d => d.date === dateStr);
              if (dayRecord) {
                lastAmount = dayRecord.amount;
                lastChange = dayRecord.daily_change;
              } else {
                // 该日无记录，标记为无数据
                lastAmount = null;
                lastChange = null;
              }
            }
          } catch (e) { /* ignore */ }

          allDetails.push({
            key: `${acc.id}-${dateStr}`,
            subCategory: child.name,
            account: acc.name,
            amount: lastAmount,
            daily_change: lastChange,
            rate: (lastAmount !== null && lastAmount > 0 && lastChange !== null)
              ? ((lastChange / (lastAmount - lastChange)) * 100)
              : null,
          });
        }
      }

      setDateDetailData(allDetails);
    } catch (err) {
      console.error('获取日期明细失败:', err);
      setDateDetailData([]);
    } finally {
      setDateDetailLoading(false);
    }
  };

  /* ---------- 派生数据 ---------- */

  const pieData = useMemo(() => {
    if (!detail?.children) return [];
    return detail.children.map((child) => {
      const totalAmount = (child.accounts || []).reduce(
        (sum, acc) => sum + (acc.current_amount || 0),
        0,
      );
      return { name: child.name, value: totalAmount };
    });
  }, [detail]);

  const returnCards = useMemo(() => buildReturnCards(returns), [returns]);
  const showReturns = !isAllReturnsZero(returns);

  /* ---------- 饼图自定义 ---------- */

  const renderPieLabel = ({ name, percent }) => {
    return `${name} ${(percent * 100).toFixed(1)}%`;
  };

  const PieTooltipContent = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const { name, value } = payload[0];
    return (
      <div
        style={{
          background: colors.bg.card,
          padding: `${spacing.sm}px ${spacing.md}px`,
          borderRadius: borderRadius.sm,
          boxShadow: shadows.dropdown,
          ...typography.caption,
        }}
      >
        <div style={{ color: colors.text.secondary, marginBottom: spacing.xs }}>{name}</div>
        <div style={{ color: colors.text.primary, fontWeight: 600 }}>¥{formatMoney(value)}</div>
      </div>
    );
  };

  /* ---------- 收益趋势图格式化 ---------- */

  const earningsYFormatter = (value) => {
    if (Math.abs(value) >= 10000) return `${(value / 10000).toFixed(1)}万`;
    return value.toFixed(0);
  };

  const earningsTooltipFormatter = (value, name) => {
    const label = name === 'daily_change' ? '每日收益' : '累计收益';
    return [`¥${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, label];
  };

  /* ---------- 日期明细表格 ---------- */

  const dateDetailColumns = [
    {
      title: '子分类',
      dataIndex: 'subCategory',
      key: 'subCategory',
      width: 100,
    },
    {
      title: '账户',
      dataIndex: 'account',
      key: 'account',
      width: 120,
    },
    {
      title: '持仓金额',
      dataIndex: 'amount',
      key: 'amount',
      width: 120,
      render: (val) => val !== null ? `¥${formatMoney(val)}` : '--',
    },
    {
      title: '当日涨跌',
      dataIndex: 'daily_change',
      key: 'daily_change',
      width: 120,
      render: (val) => val !== null ? <TrendValue value={val} prefix="¥" precision={2} /> : '--',
    },
    {
      title: '收益率',
      dataIndex: 'rate',
      key: 'rate',
      width: 100,
      render: (val) => val !== null ? <TrendValue value={val} suffix="%" precision={2} /> : '--',
    },
  ];

  /* ========== 渲染 ========== */

  return (
    <PageContainer title="理财总览" loading={loading}>

      {/* ===== 1. 顶部渐变 Banner ===== */}
      <div
        style={{
          background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryDark} 100%)`,
          borderRadius: borderRadius.lg,
          padding: spacing.xl,
          marginBottom: spacing.xl,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: spacing.lg,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* 左侧：理财总金额 */}
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div
            style={{
              ...typography.caption,
              color: 'rgba(255,255,255,0.75)',
              marginBottom: spacing.sm,
            }}
          >
            理财总资产
          </div>
          <div
            style={{
              ...typography.bigNumber,
              fontSize: 36,
              color: colors.text.inverse,
            }}
          >
            <span style={{ fontSize: 20, fontWeight: 500, marginRight: spacing.xs }}>¥</span>
            {formatMoney(detail?.total_amount)}
          </div>
        </div>

        {/* 右侧：收益指标 */}
        <div style={{ display: 'flex', gap: spacing.lg, alignItems: 'center', position: 'relative', zIndex: 1 }}>
          {/* 当日收益 */}
          {returns?.daily && (
            <div
              style={{
                background: 'rgba(255,255,255,0.18)',
                borderRadius: borderRadius.md,
                padding: `${spacing.sm}px ${spacing.lg}px`,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: spacing.xs,
              }}
            >
              <span style={{ ...typography.caption, color: 'rgba(255,255,255,0.75)' }}>
                当日收益
              </span>
              <TrendValue
                value={returns.daily.change}
                prefix="¥"
                precision={2}
                fontSize={16}
                style={{ color: colors.text.inverse }}
              />
              <TrendValue
                value={returns.daily.rate}
                suffix="%"
                precision={2}
                fontSize={12}
                style={{ color: 'rgba(255,255,255,0.8)' }}
              />
            </div>
          )}
          {/* 累计收益 */}
          {returns?.total && (
            <div
              style={{
                background: 'rgba(255,255,255,0.18)',
                borderRadius: borderRadius.md,
                padding: `${spacing.sm}px ${spacing.lg}px`,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: spacing.xs,
              }}
            >
              <span style={{ ...typography.caption, color: 'rgba(255,255,255,0.75)' }}>
                累计收益
              </span>
              <TrendValue
                value={returns.total.change}
                prefix="¥"
                precision={2}
                fontSize={18}
                style={{ color: colors.text.inverse }}
              />
            </div>
          )}
        </div>
      </div>

      {/* ===== 2. 收益率面板 ===== */}
      {showReturns && (
        <Card
          bordered={false}
          style={{ borderRadius: borderRadius.md, marginBottom: spacing.xl }}
          styles={{ body: { padding: spacing.xl } }}
        >
          <div
            style={{
              ...typography.cardTitle,
              color: colors.text.primary,
              marginBottom: spacing.lg,
            }}
          >
            收益率概览
          </div>

          <Row gutter={[spacing.md, spacing.md]}>
            {returnCards.map((card, idx) => {
              const rateVal = card.rate || 0;
              const isPositive = rateVal > 0;
              const isNegative = rateVal < 0;
              const bgColor = isPositive
                ? colors.successLight
                : isNegative
                  ? colors.dangerLight
                  : colors.bg.page;

              return (
                <Col key={idx} xs={12} sm={12} md={8} lg={4} xl={4}>
                  <div
                    style={{
                      background: bgColor,
                      borderRadius: borderRadius.md,
                      padding: spacing.lg,
                      textAlign: 'center',
                      height: '100%',
                    }}
                  >
                    <div
                      style={{
                        ...typography.caption,
                        color: colors.text.secondary,
                        marginBottom: spacing.sm,
                      }}
                    >
                      {card.label}
                    </div>

                    {card.change !== null && (
                      <div style={{ marginBottom: spacing.xs }}>
                        <TrendValue value={card.change} prefix="¥" precision={2} />
                      </div>
                    )}

                    <div>
                      <TrendValue
                        value={card.rate}
                        suffix="%"
                        precision={2}
                        fontSize={card.change === null ? 20 : undefined}
                      />
                    </div>
                  </div>
                </Col>
              );
            })}
          </Row>
        </Card>
      )}

      {/* ===== 3. 资金趋势图（全宽） ===== */}
      <div style={{ marginBottom: spacing.xl }}>
        <ChartCard title="理财资金趋势" height={280}>
          <TrendChart
            data={trendData}
            dataKey="amount"
            height={250}
            showTimeRangeSelector={true}
            currentTimeRange={trendDays}
            onTimeRangeChange={(days) => setTrendDays(days)}
            showBrush={trendData.length > 30}
            gradientId="finance-trend"
            tooltipLabel="理财资金"
          />
        </ChartCard>
      </div>

      {/* ===== 4. 收益趋势图（全宽） ===== */}
      <div style={{ marginBottom: spacing.xl }}>
        <ChartCard title="收益趋势" height={300}>
          {earningsTrendData.length > 0 ? (
            <div>
              {/* 时间维度切换器 */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: spacing.md }}>
                {['7', '30', '90', '365', 'all'].map(d => (
                  <span
                    key={d}
                    onClick={() => setEarningsDays(d)}
                    style={{
                      padding: `${spacing.xs}px ${spacing.sm}px`,
                      cursor: 'pointer',
                      fontSize: typography.caption.fontSize,
                      color: earningsDays === d ? colors.primary : colors.text.secondary,
                      fontWeight: earningsDays === d ? 500 : 400,
                      borderBottom: earningsDays === d ? `2px solid ${colors.primary}` : '2px solid transparent',
                      marginLeft: spacing.sm,
                    }}
                  >
                    {d === 'all' ? '全部' : d === '365' ? '1年' : `${d}天`}
                  </span>
                ))}
              </div>

              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={earningsTrendData}>
                  <BarGrid strokeDasharray="3 3" stroke={colors.border.split} vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    tick={{ ...typography.caption, fill: colors.text.secondary }}
                    tickFormatter={(v) => {
                      if (!v) return '';
                      const parts = v.split('-');
                      if (parts.length === 3) return `${parseInt(parts[1])}/${parseInt(parts[2])}`;
                      return v;
                    }}
                  />
                  <YAxis
                    yAxisId="bar"
                    axisLine={false}
                    tickLine={false}
                    tick={{ ...typography.caption, fill: colors.text.secondary }}
                    tickFormatter={earningsYFormatter}
                  />
                  <YAxis
                    yAxisId="line"
                    orientation="right"
                    axisLine={false}
                    tickLine={false}
                    tick={{ ...typography.caption, fill: colors.text.secondary }}
                    tickFormatter={earningsYFormatter}
                  />
                  <BarTooltip
                    contentStyle={{
                      borderRadius: borderRadius.md,
                      border: `1px solid ${colors.border.base}`,
                      boxShadow: shadows.dropdown,
                    }}
                    formatter={earningsTooltipFormatter}
                  />
                  <BarLegend />
                  <Bar
                    yAxisId="bar"
                    dataKey="daily_change"
                    fill={colors.chart[0]}
                    name="每日收益"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
              <span style={{ ...typography.caption, color: colors.text.disabled }}>暂无收益数据</span>
            </div>
          )}
        </ChartCard>
      </div>

      {/* ===== 5. 综合收益日历 ===== */}
      <Card
        bordered={false}
        style={{ borderRadius: borderRadius.md, marginBottom: spacing.xl }}
        styles={{ body: { padding: spacing.lg } }}
      >
        <FinanceEarningsCalendar
          categoryId={2}
          onDateSelect={handleDateSelect}
        />
      </Card>

      {/* ===== 6. 资产占比饼图 + 子分类入口卡片 ===== */}
      <Row gutter={[spacing.xl, spacing.xl]}>
        {/* 左列：资产占比饼图 */}
        <Col xs={24} md={10}>
          <ChartCard title="资产占比分布" height={300}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  dataKey="value"
                  label={renderPieLabel}
                  labelLine={{ stroke: colors.text.disabled }}
                >
                  {pieData.map((_, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={colors.chart[index % colors.chart.length]}
                    />
                  ))}
                </Pie>
                <ReTooltip content={<PieTooltipContent />} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
        </Col>

        {/* 右列：子分类入口卡片 */}
        <Col xs={24} md={14}>
          {detail?.children?.length > 0 && (
            <div>
              <div
                style={{
                  ...typography.sectionTitle,
                  color: colors.text.primary,
                  marginBottom: spacing.lg,
                }}
              >
                子分类详情
              </div>

              <Row gutter={[spacing.lg, spacing.lg]}>
                {detail.children.map((child, index) => {
                  const childTotal = (child.accounts || []).reduce(
                    (sum, acc) => sum + (acc.current_amount || 0),
                    0,
                  );

                  return (
                    <Col key={child.id} xs={12} sm={12} md={8}>
                      <StatCard
                        title={child.name}
                        value={formatMoney(childTotal)}
                        prefix="¥"
                        icon={<FolderOutlined />}
                        color={colors.chart[index % colors.chart.length]}
                        onClick={() => navigate(`/finance/${child.id}`)}
                      />
                    </Col>
                  );
                })}
              </Row>
            </div>
          )}
        </Col>
      </Row>

      {/* ===== 日期明细弹窗 ===== */}
      <Modal
        title={`${selectedDate} 收益明细`}
        open={dateDetailVisible}
        onCancel={() => setDateDetailVisible(false)}
        footer={null}
        width={700}
        styles={{ content: { borderRadius: borderRadius.lg } }}
      >
        <Table
          dataSource={dateDetailData}
          columns={dateDetailColumns}
          pagination={false}
          size="small"
          loading={dateDetailLoading}
          style={{ marginTop: spacing.md }}
        />
      </Modal>
    </PageContainer>
  );
};

export default FinanceOverview;
