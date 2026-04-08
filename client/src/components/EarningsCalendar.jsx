/**
 * 收益日历组件 — 支付宝风格
 *
 * 基于 Ant Design Calendar 二次封装，展示每日收益金额和月度汇总数据。
 * 适用于活期+、活期+plus 等需要逐日追踪收益的子分类。
 *
 * @module EarningsCalendar
 *
 * @param {Object} props
 * @param {number} props.accountId - 账户 ID
 * @param {string} props.accountName - 账户名称
 *
 * 数据来源：GET /api/daily-records/calendar?account_id=X&year=YYYY&month=M
 */
import { useState, useEffect } from 'react';
import { Calendar, Spin, Row, Col } from 'antd';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { colors, spacing, typography, borderRadius } from '../theme';
import TrendValue from './TrendValue';

export default function EarningsCalendar({ accountId, accountName }) {
  /** 当前展示的月份 */
  const [currentMonth, setCurrentMonth] = useState(dayjs());
  /** 日历数据（来自后端） */
  const [calendarData, setCalendarData] = useState(null);
  /** 加载状态 */
  const [loading, setLoading] = useState(false);

  /**
   * 月份变化时获取日历数据
   */
  useEffect(() => {
    if (!accountId) return;
    const year = currentMonth.year();
    const month = currentMonth.month() + 1;
    setLoading(true);
    fetch(`/api/daily-records/calendar?account_id=${accountId}&year=${year}&month=${month}`)
      .then(res => (res.ok ? res.json() : null))
      .then(data => setCalendarData(data))
      .catch(err => console.error('获取日历数据失败:', err))
      .finally(() => setLoading(false));
  }, [accountId, currentMonth]);

  /* 日期 → 数据映射 */
  const dayMap = new Map();
  if (calendarData?.days) {
    calendarData.days.forEach(d => dayMap.set(d.date, d));
  }

  /**
   * 日历单元格渲染 — 在有数据的日期格中显示收益金额
   * Ant Design v6 Calendar mini 模式下，日期数字由 ant-picker-calendar-date-value 自动渲染，
   * cellRender 内容渲染在 ant-picker-calendar-date-content 中。
   * 因此只需返回收益金额，不需要重复渲染日期。
   * 正收益绿色、负收益红色、零灰色
   */
  const cellRender = (current, info) => {
    if (info.type !== 'date') return info.originNode;

    const dateStr = current.format('YYYY-MM-DD');
    const data = dayMap.get(dateStr);
    const isCurrentMonth = current.month() === currentMonth.month();

    /* 无数据或非当月日期 — 不渲染额外内容，Calendar 自动显示日期数字 */
    if (!data || !isCurrentMonth) {
      return null;
    }

    /* 根据收益正负确定颜色 */
    const changeColor =
      data.daily_change > 0
        ? colors.success
        : data.daily_change < 0
          ? colors.danger
          : colors.text.disabled;

    return (
      <div
        style={{
          fontSize: 10,
          fontWeight: 500,
          color: changeColor,
          lineHeight: 1.2,
          textAlign: 'center',
        }}
      >
        {data.daily_change > 0 ? '+' : ''}
        {data.daily_change.toFixed(2)}
      </div>
    );
  };

  /**
   * 自定义日历头部 — 月份切换导航
   */
  const headerRender = ({ value }) => (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: `${spacing.sm}px ${spacing.md}px`,
        marginBottom: spacing.sm,
      }}
    >
      <LeftOutlined
        onClick={() => setCurrentMonth(prev => prev.subtract(1, 'month'))}
        style={{ cursor: 'pointer', color: colors.primary, fontSize: 14 }}
      />
      <span style={{ ...typography.cardTitle, color: colors.text.primary }}>
        {accountName} · {value.format('YYYY年M月')}
      </span>
      <RightOutlined
        onClick={() => setCurrentMonth(prev => prev.add(1, 'month'))}
        style={{ cursor: 'pointer', color: colors.primary, fontSize: 14 }}
      />
    </div>
  );

  const summary = calendarData?.summary;

  return (
    <Spin spinning={loading}>
      {/* 日历主体 */}
      <Calendar
        fullscreen={false}
        value={currentMonth}
        headerRender={headerRender}
        cellRender={cellRender}
        onPanelChange={date => setCurrentMonth(date)}
      />

      {/* 月度汇总区域 */}
      {summary && (
        <div
          style={{
            background: colors.bg.page,
            borderRadius: borderRadius.md,
            padding: spacing.lg,
            marginTop: spacing.md,
          }}
        >
          <Row gutter={[spacing.sm, spacing.sm]}>
            {[
              { label: '本月收益', value: summary.total_earnings, prefix: '¥', precision: 2 },
              { label: '日均收益率', value: summary.avg_daily_rate, suffix: '%', precision: 3 },
              { label: '累计收益率', value: summary.cumulative_rate, suffix: '%', precision: 2 },
              { label: '年化收益率', value: summary.annualized_rate, suffix: '%', precision: 2 },
            ].map((item, idx) => (
              <Col span={6} key={idx} style={{ textAlign: 'center' }}>
                <div
                  style={{
                    ...typography.caption,
                    color: colors.text.secondary,
                    marginBottom: spacing.xs,
                  }}
                >
                  {item.label}
                </div>
                <TrendValue
                  value={item.value}
                  prefix={item.prefix}
                  suffix={item.suffix}
                  precision={item.precision}
                />
              </Col>
            ))}
          </Row>
        </div>
      )}
    </Spin>
  );
}
