/**
 * TrendChart — 可复用的增强趋势图组件
 *
 * 功能：
 * - 时间维度切换器（7天/30天/90天/1年/全部）
 * - Brush 范围选择（可选）
 * - 渐变填充 AreaChart，自适应日期格式
 *
 * 所有颜色/间距/字体引用主题常量，禁止硬编码。
 */
import { useMemo, useId } from 'react';
import { Segmented } from 'antd';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Brush,
} from 'recharts';
import { colors, spacing, typography, borderRadius, shadows } from '../theme';

/** 时间维度选项 */
const TIME_RANGES = [
  { label: '7天', value: '7' },
  { label: '30天', value: '30' },
  { label: '90天', value: '90' },
  { label: '1年', value: '365' },
  { label: '全部', value: 'all' },
];

/** Y 轴默认格式化：以万为单位 */
const defaultYFormatter = (value) => `${(value / 10000).toFixed(1)}万`;

/** Tooltip 默认值格式化：¥ + 千分位 + 两位小数 */
const defaultTooltipValueFormatter = (value, _name, _props, tooltipLabel) =>
  [`¥${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, tooltipLabel];

/**
 * 增强趋势图组件
 *
 * @param {Object} props
 * @param {Array}    props.data                  趋势数据数组
 * @param {string}   props.dataKey               Y 轴数据字段名
 * @param {string}   props.dateKey               X 轴日期字段名
 * @param {number}   props.height                图表高度
 * @param {string}   props.color                 主色调
 * @param {string}   props.gradientId            渐变 ID（同页面多图避免冲突）
 * @param {boolean}  props.showBrush             是否显示 Brush 范围选择器
 * @param {boolean}  props.showDots              是否显示数据点
 * @param {string}   props.tooltipLabel          Tooltip 标签名
 * @param {Function} props.yAxisFormatter        Y 轴格式化函数
 * @param {Function} props.tooltipValueFormatter Tooltip 值格式化函数
 * @param {Function} props.onTimeRangeChange     时间维度切换回调
 * @param {string}   props.currentTimeRange      当前选中的时间维度
 * @param {boolean}  props.showTimeRangeSelector 是否显示时间维度切换器
 */
export default function TrendChart({
  data = [],
  dataKey = 'total_amount',
  dateKey = 'date',
  height = 300,
  color = colors.primary,
  gradientId,
  showBrush = false,
  showDots = true,
  tooltipLabel = '总金额',
  yAxisFormatter = defaultYFormatter,
  tooltipValueFormatter,
  onTimeRangeChange,
  currentTimeRange = '30',
  showTimeRangeSelector = true,
}) {
  /** 自动生成唯一渐变 ID，避免 SVG id 冲突 */
  const autoId = useId();
  const gId = gradientId || `trend-gradient-${autoId.replace(/:/g, '')}`;

  /**
   * 日期格式自适应：
   * - YYYY-MM 格式（月度聚合）直接显示
   * - YYYY-MM-DD 格式简化为 M/D
   */
  const formatDate = useMemo(() => {
    if (!data.length) return (v) => v;
    const sample = data[0]?.[dateKey] || '';
    if (/^\d{4}-\d{2}$/.test(sample)) return (v) => v;
    // 日期包含 "-" 则按 M/D 格式化，兼容 "MM-DD" 和 "YYYY-MM-DD"
    return (v) => {
      if (!v) return '';
      const parts = v.split('-');
      if (parts.length === 3) return `${parseInt(parts[1])}/${parseInt(parts[2])}`;
      if (parts.length === 2) return `${parseInt(parts[0])}/${parseInt(parts[1])}`;
      return v;
    };
  }, [data, dateKey]);

  /** Tooltip formatter — 将 tooltipLabel 注入 */
  const tooltipFmt = useMemo(() => {
    if (tooltipValueFormatter) return tooltipValueFormatter;
    return (value, name, props) => defaultTooltipValueFormatter(value, name, props, tooltipLabel);
  }, [tooltipValueFormatter, tooltipLabel]);

  return (
    <div>
      {/* 时间维度切换器 */}
      {showTimeRangeSelector && onTimeRangeChange && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: spacing.md }}>
          <Segmented
            size="small"
            options={TIME_RANGES}
            value={currentTimeRange}
            onChange={onTimeRangeChange}
          />
        </div>
      )}

      {/* 图表 */}
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data}>
          {/* 渐变定义 */}
          <defs>
            <linearGradient id={gId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.2} />
              <stop offset="100%" stopColor={color} stopOpacity={0.01} />
            </linearGradient>
          </defs>

          {/* 仅水平网格线 */}
          <CartesianGrid strokeDasharray="3 3" stroke={colors.border.split} vertical={false} />

          {/* X 轴 — 日期 */}
          <XAxis
            dataKey={dateKey}
            axisLine={{ stroke: colors.border.base }}
            tickLine={false}
            tick={{ ...typography.caption, fill: colors.text.secondary }}
            tickFormatter={formatDate}
          />

          {/* Y 轴 — 金额 */}
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ ...typography.caption, fill: colors.text.secondary }}
            tickFormatter={yAxisFormatter}
          />

          {/* Tooltip */}
          <Tooltip
            contentStyle={{
              borderRadius: borderRadius.md,
              border: `1px solid ${colors.border.base}`,
              boxShadow: shadows.dropdown,
            }}
            labelFormatter={(label) => `日期：${label}`}
            formatter={tooltipFmt}
          />

          {/* 面积 + 折线 */}
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={2}
            fill={`url(#${gId})`}
            dot={showDots ? { fill: color, strokeWidth: 2, r: 3, stroke: colors.bg.card } : false}
            activeDot={{ r: 5, stroke: color, strokeWidth: 2, fill: colors.bg.card }}
          />

          {/* Brush 范围选择器 */}
          {showBrush && data.length > 10 && (
            <Brush
              dataKey={dateKey}
              height={30}
              stroke={color}
              tickFormatter={formatDate}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
