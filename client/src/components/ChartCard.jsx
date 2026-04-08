/**
 * 图表容器卡片组件 - ChartCard
 *
 * 为 recharts 图表提供统一的卡片包装，包含标题区域、操作区域和固定高度的图表容器。
 * 支持加载态骨架屏显示。
 *
 * @module ChartCard
 *
 * @param {Object} props - 组件属性
 * @param {string} props.title - 卡片标题
 * @param {string} [props.subtitle] - 副标题，显示在标题下方
 * @param {React.ReactNode} [props.extra] - 右上角操作区域，如时间筛选、按钮等
 * @param {number} [props.height=350] - 图表区域高度（px）
 * @param {boolean} [props.loading=false] - 是否处于加载状态，为 true 时显示骨架屏
 * @param {React.ReactNode} props.children - 图表内容，通常为 recharts 组件
 * @param {string} [props.className] - 自定义 CSS 类名
 * @param {React.CSSProperties} [props.style] - 自定义内联样式
 *
 * @example
 * // 基础用法
 * <ChartCard title="资产趋势">
 *   <ResponsiveContainer>
 *     <LineChart data={data}>...</LineChart>
 *   </ResponsiveContainer>
 * </ChartCard>
 *
 * @example
 * // 带副标题和操作区
 * <ChartCard
 *   title="收益分析"
 *   subtitle="近30天"
 *   extra={<Select options={options} />}
 *   height={400}
 *   loading={isLoading}
 * >
 *   <ResponsiveContainer>
 *     <BarChart data={data}>...</BarChart>
 *   </ResponsiveContainer>
 * </ChartCard>
 */
import React from 'react';
import { Card, Skeleton } from 'antd';
import { colors, spacing, typography, borderRadius } from '../theme';

/** 图表容器卡片组件 */
const ChartCard = ({
  title,
  subtitle,
  extra,
  height = 350,
  loading = false,
  children,
  className,
  style,
}) => {
  return (
    <Card
      className={`card-fade-in ${className || ''}`}
      bordered={false}
      style={{
        borderRadius: borderRadius.lg,
        ...style,
      }}
      styles={{
        body: {
          padding: spacing.xl,
        },
      }}
    >
      {/* 头部区域 — 底部加细分割线 + 顶部装饰条 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          marginBottom: spacing.lg,
          paddingBottom: spacing.lg,
          borderBottom: `1px solid ${colors.border.split}`,
        }}
      >
        {/* 左侧：标题 + 副标题 */}
        <div>
          <div
            style={{
              ...typography.cardTitle,
              color: colors.text.primary,
            }}
          >
            {title}
          </div>
          {subtitle && (
            <div
              style={{
                ...typography.caption,
                color: colors.text.secondary,
                marginTop: spacing.xs,
              }}
            >
              {subtitle}
            </div>
          )}
        </div>

        {/* 右侧：操作区 */}
        {extra && <div style={{ flexShrink: 0 }}>{extra}</div>}
      </div>

      {/* 图表内容区域 */}
      <div style={{ height, width: '100%' }}>
        {loading ? (
          <Skeleton active paragraph={{ rows: Math.floor(height / 40) }} />
        ) : (
          children
        )}
      </div>
    </Card>
  );
};

export default ChartCard;
