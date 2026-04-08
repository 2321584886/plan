/**
 * 仪表盘页面 - Dashboard
 *
 * 系统首页，展示资产总览、分类统计、资金占比饼图和趋势折线图。
 * 使用 PageContainer 统一布局，StatCard 展示分类数据，ChartCard 包裹图表。
 * 所有颜色、间距、字体均引用主题常量，禁止硬编码。
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Row, Col, Alert, Button, Space, Card, List, Empty } from 'antd';
import {
  FolderOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  CalendarOutlined,
  SyncOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip as PieTooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

import PageContainer from '../components/PageContainer';
import StatCard from '../components/StatCard';
import ChartCard from '../components/ChartCard';
import TrendChart from '../components/TrendChart';
import {
  colors,
  spacing,
  typography,
  borderRadius,
  shadows,
  transitions,
} from '../theme';

/**
 * 金额格式化工具函数
 * 将数值转换为带千分位和人民币符号的字符串
 * @param {number} value - 原始金额数值
 * @returns {string} 格式化后的金额字符串，如 "¥1,250,000"
 */
const formatAmount = (value) => {
  return `¥${Number(value || 0).toLocaleString()}`;
};

/**
 * 格式化金额数值（不带前缀，用于 StatCard 的 value）
 * @param {number} value - 原始金额数值
 * @returns {string} 带千分位的数字字符串，如 "1,250,000"
 */
const formatValue = (value) => {
  return Number(value || 0).toLocaleString();
};

/**
 * 获取当前日期的格式化字符串
 * @returns {string} 格式为 YYYY-MM-DD 的日期字符串
 */
const getTodayStr = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/**
 * 仪表盘主组件
 * 负责加载并展示：任务提醒、总资产、分类资产统计、饼图、趋势图
 */
export default function Dashboard() {
  const navigate = useNavigate();

  /** 资产汇总数据，包含 total_amount 和 categories 数组 */
  const [summary, setSummary] = useState({ total_amount: 0, categories: [] });
  /** 总资产趋势数据 */
  const [trendData, setTrendData] = useState([]);
  /** 趋势图时间维度 */
  const [trendDays, setTrendDays] = useState('30');
  /** 今日录入提醒数据 */
  const [reminder, setReminder] = useState({ pending_count: 0, accounts: [] });
  /** 最近交易动态数据，包含交易列表和汇总信息 */
  const [recentTransactions, setRecentTransactions] = useState({ transactions: [], summary: {} });
  /** 页面加载状态 */
  const [loading, setLoading] = useState(true);

  /**
   * 初始化加载所有仪表盘数据
   * 并行请求汇总、趋势、提醒三个接口
   */
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        /* 并行请求所有数据，提升加载速度 */
        const [summaryRes, reminderRes, transactionsRes] = await Promise.all([
          fetch('/api/funds/summary'),
          fetch('/api/funds/reminders/today'),
          fetch('/api/accounts/transactions/recent?days=7'),
        ]);

        if (summaryRes.ok) {
          const summaryData = await summaryRes.json();
          setSummary(summaryData);
        }

        if (reminderRes.ok) {
          const reminderData = await reminderRes.json();
          setReminder(reminderData);
        }

        /* 解析最近交易动态数据 */
        if (transactionsRes.ok) {
          const transactionsData = await transactionsRes.json();
          setRecentTransactions(transactionsData);
        }
      } catch (error) {
        console.error('加载仪表盘数据失败:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  /** 独立请求趋势数据 — 随 trendDays 变化重新获取 */
  useEffect(() => {
    fetch(`/api/funds/total-trend?days=${trendDays}`)
      .then(res => res.ok ? res.json() : [])
      .then(data => setTrendData(data))
      .catch(console.error);
  }, [trendDays]);

  /** 跳转到每日录入页面 */
  const handleGoToEntry = () => {
    navigate('/daily-entry');
  };

  /**
   * 跳转到某个分类的详情页
   * @param {number} categoryId - 分类 ID
   */
  const handleCategoryClick = (categoryId) => {
    navigate(`/category/${categoryId}`);
  };

  const netChange = Number(recentTransactions.summary?.net_change || 0);

  return (
    <PageContainer title="仪表盘" loading={loading}>
      {/* ====== 1. 顶部任务提醒横幅 ====== */}
      {reminder.pending_count > 0 && (
        <Alert
          type="warning"
          showIcon
          message={
            <Space>
              <span>今日还有 {reminder.pending_count} 个理财账户未更新数据</span>
              <Button type="primary" size="small" onClick={handleGoToEntry}>
                去录入
              </Button>
            </Space>
          }
          style={{
            marginBottom: spacing.xl,
            borderRadius: borderRadius.md,
            borderColor: colors.warning,
            backgroundColor: colors.warningLight,
          }}
        />
      )}

      {/* ====== 1b. 快速摘要条 ====== */}
      <Row gutter={[spacing.lg, spacing.lg]} style={{ marginBottom: spacing.xl }}>
        <Col xs={24} sm={8}>
          <div
            style={{
              background: 'linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)',
              border: `1px solid ${colors.border.base}`,
              borderRadius: borderRadius.md,
              boxShadow: shadows.sm,
              padding: `${spacing.md}px ${spacing.lg}px`,
              minHeight: 94,
            }}
          >
            <div style={{ ...typography.caption, color: colors.text.secondary, marginBottom: spacing.xs }}>
              <CalendarOutlined style={{ marginRight: spacing.xs }} /> 今日待录入
            </div>
            <div style={{ ...typography.bigNumber, color: colors.text.primary, fontSize: 28 }}>
              {reminder.pending_count}
            </div>
          </div>
        </Col>
        <Col xs={24} sm={8}>
          <div
            style={{
              background: 'linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)',
              border: `1px solid ${colors.border.base}`,
              borderRadius: borderRadius.md,
              boxShadow: shadows.sm,
              padding: `${spacing.md}px ${spacing.lg}px`,
              minHeight: 94,
            }}
          >
            <div style={{ ...typography.caption, color: colors.text.secondary, marginBottom: spacing.xs }}>
              <SyncOutlined style={{ marginRight: spacing.xs }} /> 近7天交易笔数
            </div>
            <div style={{ ...typography.bigNumber, color: colors.text.primary, fontSize: 28 }}>
              {recentTransactions.transactions.length}
            </div>
          </div>
        </Col>
        <Col xs={24} sm={8}>
          <div
            style={{
              background: 'linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)',
              border: `1px solid ${colors.border.base}`,
              borderRadius: borderRadius.md,
              boxShadow: shadows.sm,
              padding: `${spacing.md}px ${spacing.lg}px`,
              minHeight: 94,
            }}
          >
            <div style={{ ...typography.caption, color: colors.text.secondary, marginBottom: spacing.xs }}>
              <ThunderboltOutlined style={{ marginRight: spacing.xs }} /> 近7天净变化
            </div>
            <div
              style={{
                ...typography.bigNumber,
                color: netChange >= 0 ? colors.success : colors.danger,
                fontSize: 28,
              }}
            >
              {netChange >= 0 ? '+' : ''}{formatAmount(netChange)}
            </div>
          </div>
        </Col>
      </Row>

      {/* ====== 2. 资产统计卡片区域 ====== */}
      <Row gutter={[spacing.lg, spacing.lg]} style={{ marginBottom: spacing.xl }}>
        {/* --- 2a. 总资产大卡片（渐变背景） --- */}
        <Col xs={24} lg={10}>
          <div
            style={{
              background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryDark} 100%)`,
              borderRadius: borderRadius.lg,
              padding: spacing.xl,
              boxShadow: shadows.card,
              transition: transitions.smooth,
              minHeight: 176,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* 光晕效果 */}
            <div
              style={{
                position: 'absolute',
                top: -30,
                right: -30,
                width: 120,
                height: 120,
                borderRadius: '50%',
                background: 'rgba(255, 255, 255, 0.08)',
                pointerEvents: 'none',
              }}
            />
            {/* 标题行 */}
            <div
              style={{
                ...typography.caption,
                color: colors.text.inverse,
                opacity: 0.85,
                marginBottom: spacing.sm,
              }}
            >
              总资产
            </div>

            {/* 大号金额 */}
            <div
              style={{
                ...typography.bigNumber,
                fontSize: 36,
                color: colors.text.inverse,
                marginBottom: spacing.md,
              }}
            >
              <span style={{ fontSize: 20, fontWeight: 500, marginRight: spacing.xs }}>
                ¥
              </span>
              {formatValue(summary.total_amount)}
            </div>

            {/* 今日变动 - 仅在 total_change_today 非零时显示 */}
            {summary.total_change_today !== undefined && summary.total_change_today !== 0 && (
              <div
                style={{
                  ...typography.body,
                  color: colors.text.inverse,
                  opacity: 0.95,
                  marginBottom: spacing.sm,
                }}
              >
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: spacing.xs,
                    padding: '2px 8px',
                    borderRadius: 999,
                    marginRight: spacing.xs,
                    background: 'rgba(255, 255, 255, 0.14)',
                    border: '1px solid rgba(255, 255, 255, 0.25)',
                  }}
                >
                  今日变动
                </span>
                <span
                  style={{
                    fontWeight: 600,
                    color: summary.total_change_today > 0 ? '#4ade80' : '#fca5a5',
                  }}
                >
                  {summary.total_change_today > 0 ? '+' : '-'}¥{Math.abs(summary.total_change_today).toLocaleString()}
                </span>
              </div>
            )}

            {/* 日期信息 */}
            <div
              style={{
                ...typography.caption,
                color: colors.text.inverse,
                opacity: 0.65,
              }}
            >
              截至 {getTodayStr()}
            </div>
          </div>
        </Col>

        {/* --- 2b. 各分类资产卡片（StatCard） --- */}
        <Col xs={24} lg={14}>
          <Row gutter={[spacing.md, spacing.md]}>
            {summary.categories?.map((category, index) => (
              <Col key={category.id} xs={24} sm={12} xl={8}>
                <StatCard
                  title={category.name}
                  value={formatValue(category.amount)}
                  prefix="¥"
                  icon={<FolderOutlined />}
                  color={colors.chart[index % colors.chart.length]}
                  onClick={() => handleCategoryClick(category.id)}
                  style={{ minHeight: 176 }}
                />
              </Col>
            ))}
          </Row>
        </Col>
      </Row>

      {/* ====== 3. 图表区域 - 两列布局 ====== */}
      <Row gutter={[spacing.lg, spacing.lg]}>
        {/* --- 3a. 资金分类饼图 --- */}
        <Col xs={24} lg={12}>
          <ChartCard title="资金分类占比" subtitle="各类资产占比分布" height={350}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                {/* 环形饼图，innerRadius 形成空心效果 */}
                <Pie
                  data={summary.categories || []}
                  dataKey="amount"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={120}
                  innerRadius={60}
                  paddingAngle={2}
                  label={(entry) =>
                    `${entry.name}: ${((entry.amount / (summary.total_amount || 1)) * 100).toFixed(1)}%`
                  }
                >
                  {/* 按主题配色数组为每个扇区着色 */}
                  {(summary.categories || []).map((_entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={colors.chart[index % colors.chart.length]}
                    />
                  ))}
                </Pie>

                {/* 饼图悬浮提示 */}
                <PieTooltip
                  formatter={(value, name) => [formatAmount(value), name]}
                  contentStyle={{
                    borderRadius: borderRadius.sm,
                    border: `1px solid ${colors.border.base}`,
                    boxShadow: shadows.dropdown,
                  }}
                />

                {/* 底部图例 */}
                <Legend verticalAlign="bottom" height={36} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
        </Col>

        {/* --- 3b. 总资产趋势图（增强版 TrendChart） --- */}
        <Col xs={24} lg={12}>
          <ChartCard title="总资产趋势" height={350}>
            <TrendChart
              data={trendData}
              height={320}
              showTimeRangeSelector={true}
              currentTimeRange={trendDays}
              onTimeRangeChange={(days) => setTrendDays(days)}
              tooltipLabel="总资产"
              showBrush={trendData.length > 30}
              gradientId="dashboard-trend"
            />
          </ChartCard>
        </Col>
      </Row>

      {/* ====== 4. 最近交易动态区域 ====== */}
      <Card
        title="最近交易动态"
        extra={
          <span style={{ ...typography.caption, color: colors.text.secondary }}>
            近7天
          </span>
        }
        style={{
          marginTop: spacing.lg,
          borderRadius: borderRadius.md,
          boxShadow: shadows.card,
        }}
        styles={{ body: { padding: 0 } }}
      >
        {/* --- 4a. 交易汇总统计行 --- */}
        {recentTransactions.summary && (
          <div style={{ padding: `${spacing.lg}px ${spacing.xl}px`, borderBottom: `1px solid ${colors.border.base}` }}>
            <Row gutter={spacing.lg}>
              {/* 入金总额 */}
              <Col span={8} style={{ textAlign: 'center' }}>
                <div style={{ ...typography.caption, color: colors.text.secondary, marginBottom: spacing.xs }}>
                  入金总额
                </div>
                <div style={{ ...typography.number, fontSize: 18, color: colors.success }}>
                  ¥{Number(recentTransactions.summary.total_deposit || 0).toLocaleString()}
                </div>
              </Col>
              {/* 出金总额 */}
              <Col span={8} style={{ textAlign: 'center' }}>
                <div style={{ ...typography.caption, color: colors.text.secondary, marginBottom: spacing.xs }}>
                  出金总额
                </div>
                <div style={{ ...typography.number, fontSize: 18, color: colors.danger }}>
                  ¥{Number(recentTransactions.summary.total_withdraw || 0).toLocaleString()}
                </div>
              </Col>
              {/* 净变化 */}
              <Col span={8} style={{ textAlign: 'center' }}>
                <div style={{ ...typography.caption, color: colors.text.secondary, marginBottom: spacing.xs }}>
                  净变化
                </div>
                <div
                  style={{
                    ...typography.number,
                    fontSize: 18,
                    color: (recentTransactions.summary.net_change || 0) >= 0
                      ? colors.success
                      : colors.danger,
                  }}
                >
                  {(recentTransactions.summary.net_change || 0) >= 0 ? '+' : ''}
                  ¥{Number(recentTransactions.summary.net_change || 0).toLocaleString()}
                </div>
              </Col>
            </Row>
          </div>
        )}

        {/* --- 4b. 交易记录列表 --- */}
        {recentTransactions.transactions.length > 0 ? (
          <List
            dataSource={recentTransactions.transactions.slice(0, 10)}
            renderItem={(item) => {
              /** 判断交易类型：入金 or 出金 */
              const isDeposit = item.type === 'deposit';
              /** 交易类型对应的颜色 */
              const typeColor = isDeposit ? colors.success : colors.danger;

              return (
                <List.Item
                  style={{
                    padding: `${spacing.md}px ${spacing.xl}px`,
                    transition: transitions.micro,
                    cursor: 'default',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = colors.bg.hover;
                    e.currentTarget.style.borderRadius = `${borderRadius.md}px`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.borderRadius = '0';
                  }}
                >
                  {/* 左侧：类型图标 + 信息 */}
                  <List.Item.Meta
                    avatar={
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: borderRadius.round,
                          backgroundColor: isDeposit ? colors.successLight : colors.dangerLight,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 16,
                          color: typeColor,
                        }}
                      >
                        {isDeposit ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
                      </div>
                    }
                    title={
                      <span style={{ ...typography.body, color: colors.text.primary }}>
                        {item.account_name} · {item.category_name}
                      </span>
                    }
                    description={
                      <span style={{ ...typography.caption, color: colors.text.secondary }}>
                        {item.transaction_date}{item.notes ? ` · ${item.notes}` : ''}
                      </span>
                    }
                  />

                  {/* 右侧：交易金额 */}
                  <div
                    style={{
                      ...typography.number,
                      fontSize: 16,
                      color: typeColor,
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {isDeposit ? '+' : '-'}¥{Number(item.amount || 0).toLocaleString()}
                  </div>
                </List.Item>
              );
            }}
          />
        ) : (
          /* 空状态提示 */
          <div style={{ padding: spacing.xl }}>
            <Empty description="暂无交易记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          </div>
        )}
      </Card>
    </PageContainer>
  );
}
