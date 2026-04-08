/**
 * 金融统计卡片组件 - StatCard
 *
 * 用于展示资产金额、收益率等关键统计数据，支持趋势指标显示。
 * 卡片左侧带有渐变装饰条，悬浮时有微上浮动效。
 *
 * @module StatCard
 *
 * @param {Object} props - 组件属性
 * @param {string} props.title - 卡片标题，如"总资产"、"月收益"
 * @param {number|string} props.value - 展示的数值
 * @param {string} [props.prefix=''] - 数值前缀，如 ¥、$
 * @param {string} [props.suffix=''] - 数值后缀，如 元、万
 * @param {React.ReactNode} [props.icon] - 标题区域图标，推荐使用 Ant Design 图标
 * @param {string} [props.color] - 左侧装饰条颜色，默认使用品牌主色
 * @param {number} [props.trend] - 涨跌趋势值，正数表示上涨，负数表示下跌
 * @param {string} [props.trendSuffix=''] - 趋势值后缀，如 %
 * @param {Function} [props.onClick] - 点击卡片的回调函数
 * @param {string} [props.className] - 自定义 CSS 类名
 * @param {React.CSSProperties} [props.style] - 自定义内联样式
 *
 * @example
 * // 基础用法
 * <StatCard
 *   title="总资产"
 *   value={1250000}
 *   prefix="¥"
 *   icon={<FundOutlined />}
 * />
 *
 * @example
 * // 带趋势指标
 * <StatCard
 *   title="月收益率"
 *   value={8.52}
 *   suffix="%"
 *   trend={2.3}
 *   trendSuffix="%"
 *   color={colors.success}
 *   onClick={() => navigate('/detail')}
 * />
 */
import React from 'react';
import { Card } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';
import { colors, spacing, typography, shadows, borderRadius, transitions } from '../theme';

/** 金融统计卡片组件 */
const StatCard = ({
  title,
  value,
  prefix = '',
  suffix = '',
  icon,
  color = colors.primary,
  trend,
  trendSuffix = '',
  onClick,
  className,
  style,
}) => {
  /** 判断趋势方向 */
  const getTrendColor = (val) => {
    if (val > 0) return colors.success;
    if (val < 0) return colors.danger;
    return colors.text.disabled;
  };

  /** 格式化趋势显示文本 */
  const formatTrend = (val) => {
    if (val > 0) return `+${val}`;
    return `${val}`;
  };

  return (
    <Card
      className={`card-fade-in ${className || ''}`}
      bordered={false}
      onClick={onClick}
      style={{
        borderRadius: borderRadius.lg,
        overflow: 'hidden',
        cursor: onClick ? 'pointer' : 'default',
        transition: transitions.smooth,
        position: 'relative',
        ...style,
      }}
      styles={{
        body: {
          padding: spacing.xl,
          paddingLeft: spacing.xl + spacing.sm,
        },
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-3px)';
        e.currentTarget.style.boxShadow = shadows.cardHover;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = shadows.card;
      }}
    >
      {/* 左侧渐变装饰条 — 3px 更精致 */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: spacing.md,
          bottom: spacing.md,
          width: 3,
          borderRadius: 1.5,
          background: `linear-gradient(180deg, ${color} 0%, ${colors.primaryDark} 100%)`,
        }}
      />

      {/* 顶部：图标 + 标题 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: spacing.sm,
          marginBottom: spacing.md,
        }}
      >
        {icon && (
          <span style={{ color: color, fontSize: 16 }}>{icon}</span>
        )}
        <span
          style={{
            ...typography.caption,
            color: colors.text.secondary,
          }}
        >
          {title}
        </span>
      </div>

      {/* 中部：大号数值 */}
      <div
        style={{
          ...typography.bigNumber,
          color: colors.text.primary,
          marginBottom: trend !== undefined ? spacing.sm : 0,
          letterSpacing: '-0.02em',
          fontSize: 'clamp(22px, 2vw, 30px)',
          lineHeight: 1.15,
          overflowWrap: 'anywhere',
        }}
      >
        {prefix && (
          <span style={{ fontSize: 18, fontWeight: 500, marginRight: spacing.xs }}>
            {prefix}
          </span>
        )}
        {value}
        {suffix && (
          <span style={{ fontSize: 14, fontWeight: 400, marginLeft: spacing.xs }}>
            {suffix}
          </span>
        )}
      </div>

      {/* 底部：趋势值 */}
      {trend !== undefined && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: spacing.xs,
            color: getTrendColor(trend),
            ...typography.caption,
            fontWeight: 500,
          }}
        >
          {trend > 0 && <ArrowUpOutlined />}
          {trend < 0 && <ArrowDownOutlined />}
          <span>
            {formatTrend(trend)}{trendSuffix}
          </span>
        </div>
      )}
    </Card>
  );
};

export default StatCard;
