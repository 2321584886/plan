/**
 * 综合收益日历组件 — 理财总览页专用
 *
 * 基于 Ant Design Calendar 二次封装，聚合理财分类下所有账户的每日收益。
 * 支持日期点击事件，点击某天时通知父组件显示该日明细。
 *
 * @module FinanceEarningsCalendar
 *
 * @param {Object} props
 * @param {number} props.categoryId - 分类 ID（如 2 = 理财）
 * @param {Function} props.onDateSelect - 日期点击回调，参数为日期字符串 'YYYY-MM-DD'
 *
 * 数据来源：GET /api/daily-records/calendar?category_id=X&year=YYYY&month=M
 */
import { useState, useEffect } from 'react';
import { Calendar, Spin, Row, Col } from 'antd';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { colors, spacing, typography, borderRadius } from '../theme';
import TrendValue from './TrendValue';

export default function FinanceEarningsCalendar({ categoryId, onDateSelect }) {
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
    if (!categoryId) return;
    const year = currentMonth.year();
    const month = currentMonth.month() + 1;
    setLoading(true);
    fetch(`/api/daily-records/calendar?category_id=${categoryId}&year=${year}&month=${month}`)
      .then(res => (res.ok ? res.json() : null))
      .then(data => setCalendarData(data))
      .catch(err => console.error('获取综合收益日历数据失败:', err))
      .finally(() => setLoading(false));
  }, [categoryId, currentMonth]);

  /* 日期 -> 数据映射 */
  const dayMap = new Map();
  if (calendarData?.days) {
    calendarData.days.forEach(d => dayMap.set(d.date, d));
  }

  /**
   * 日历单元格渲染 — 显示每日收益金额
   * Ant Design v6 Calendar mini 模式下：
   *   - 日期数字由 .ant-picker-calendar-date-value 自动渲染
   *   - cellRender 内容渲染在 .ant-picker-calendar-date-content 中
   * 点击有数据的日期触发 onDateSelect 回调
   */
  const cellRender = (current, info) => {
    if (info.type !== 'date') return info.originNode;

    const dateStr = current.format('YYYY-MM-DD');
    const data = dayMap.get(dateStr);
    const isCurrentMonth = current.month() === currentMonth.month();

    // 非当月日期不渲染内容
    if (!isCurrentMonth) return null;

    // 有数据的日期 — 显示收益金额
    if (data) {
      const changeColor =
        data.daily_change > 0
          ? colors.success
          : data.daily_change < 0
            ? colors.danger
            : colors.text.disabled;

      return (
        <div
          style={{
            padding: '2px 0',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: changeColor,
              lineHeight: 1.3,
              cursor: 'pointer',
            }}
            onClick={(e) => {
              e.stopPropagation();
              onDateSelect?.(dateStr);
            }}
          >
            {data.daily_change > 0 ? '+' : ''}
            {data.daily_change.toFixed(2)}
          </div>
        </div>
      );
    }

    // 当月但无数据的日期 — 不渲染额外内容
    return null;
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
        borderBottom: `2px solid ${colors.primaryLight}`,
        paddingBottom: spacing.md,
      }}
    >
      <LeftOutlined
        onClick={() => setCurrentMonth(prev => prev.subtract(1, 'month'))}
        style={{ cursor: 'pointer', color: colors.primary, fontSize: 14 }}
      />
      <span style={{ ...typography.cardTitle, color: colors.text.primary }}>
        综合收益 · {value.format('YYYY年M月')}
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
