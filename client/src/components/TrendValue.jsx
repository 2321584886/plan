/**
 * 涨跌值显示组件 - TrendValue
 *
 * 金融数据通用的涨跌值展示组件，根据正负值自动着色并显示方向箭头。
 * 正值显示绿色（上涨），负值显示红色（下跌），零值显示灰色。
 *
 * @module TrendValue
 *
 * @param {Object} props - 组件属性
 * @param {number} props.value - 涨跌数值，正数为上涨，负数为下跌
 * @param {string} [props.prefix=''] - 数值前缀，如 ¥、+
 * @param {string} [props.suffix=''] - 数值后缀，如 %
 * @param {number} [props.precision=2] - 小数位数
 * @param {boolean} [props.showArrow=true] - 是否显示方向箭头图标
 * @param {boolean} [props.reverseColor=false] - 是否反转颜色（正红负绿），用于支出等特殊场景
 * @param {number} [props.fontSize] - 自定义字号（px），不传则使用默认
 * @param {string} [props.className] - 自定义 CSS 类名
 * @param {React.CSSProperties} [props.style] - 自定义内联样式
 *
 * @example
 * // 基础用法 - 显示收益率
 * <TrendValue value={5.23} suffix="%" />
 *
 * @example
 * // 显示金额变动
 * <TrendValue value={-1200} prefix="¥" precision={0} />
 *
 * @example
 * // 反转颜色（支出场景：增加为红色）
 * <TrendValue value={300} prefix="¥" reverseColor />
 *
 * @example
 * // 不显示箭头
 * <TrendValue value={0.5} suffix="%" showArrow={false} />
 */
import React from 'react';
import { ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';
import { colors, spacing } from '../theme';

/** 涨跌值显示组件 */
const TrendValue = ({
  value,
  prefix = '',
  suffix = '',
  precision = 2,
  showArrow = true,
  reverseColor = false,
  fontSize,
  className,
  style,
}) => {
  /**
   * 根据数值和是否反转颜色获取显示颜色
   * 正常模式：正值绿色，负值红色
   * 反转模式：正值红色，负值绿色
   */
  const getColor = () => {
    if (value === 0 || value === null || value === undefined) {
      return colors.text.disabled;
    }
    const isPositive = value > 0;
    if (reverseColor) {
      return isPositive ? colors.danger : colors.success;
    }
    return isPositive ? colors.success : colors.danger;
  };

  /**
   * 格式化数值显示
   * 正数自动添加 + 号，按精度保留小数
   */
  const formatValue = () => {
    if (value === null || value === undefined) return '--';
    const absValue = Math.abs(value).toFixed(precision);
    const sign = value > 0 ? '+' : value < 0 ? '-' : '';
    return `${sign}${absValue}`;
  };

  /** 获取箭头图标 */
  const renderArrow = () => {
    if (!showArrow || value === 0 || value === null || value === undefined) {
      return null;
    }
    return value > 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />;
  };

  const displayColor = getColor();

  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: spacing.xs,
        color: displayColor,
        fontWeight: 600,
        fontSize: fontSize || 'inherit',
        ...style,
      }}
    >
      {renderArrow()}
      <span>
        {prefix}{formatValue()}{suffix}
      </span>
    </span>
  );
};

export default TrendValue;
