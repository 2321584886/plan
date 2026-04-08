/**
 * 页面容器组件 - PageContainer
 *
 * 统一所有页面的标题区和内容区样式，提供一致的页面布局规范。
 * 包含顶部标题栏（左侧标题 + 右侧操作区）和带淡入动画的内容区域。
 *
 * @module PageContainer
 *
 * @param {Object} props - 组件属性
 * @param {string|React.ReactNode} props.title - 页面标题，支持字符串或自定义 ReactNode
 * @param {React.ReactNode} [props.extra] - 标题栏右侧额外操作区，如按钮、筛选器等
 * @param {React.ReactNode} props.children - 页面主体内容
 * @param {boolean} [props.loading=false] - 是否处于加载状态，为 true 时显示骨架屏
 * @param {string} [props.className] - 自定义 CSS 类名，透传到最外层容器
 * @param {React.CSSProperties} [props.style] - 自定义内联样式，透传到最外层容器
 *
 * @example
 * // 基础用法
 * <PageContainer title="仪表盘">
 *   <div>页面内容</div>
 * </PageContainer>
 *
 * @example
 * // 带操作区和加载态
 * <PageContainer
 *   title="资产概览"
 *   extra={<Button type="primary">新增</Button>}
 *   loading={isLoading}
 * >
 *   <Table dataSource={data} />
 * </PageContainer>
 */
import React from 'react';
import { Skeleton } from 'antd';
import { spacing, typography, colors, borderRadius } from '../theme';

/** 页面容器组件 */
const PageContainer = ({
  title,
  extra,
  children,
  loading = false,
  className,
  style,
}) => {
  return (
    <div className={className} style={{ ...style }}>
      {/* 标题栏区域 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: spacing.xl,
        }}
      >
        {/* 左侧标题 */}
        <div style={{ position: 'relative' }}>
          <div
            style={{
              ...typography.pageTitle,
              color: colors.text.primary,
            }}
          >
            {title}
          </div>
          {/* 品牌色下划线装饰 */}
          <div
            style={{
              position: 'absolute',
              bottom: -6,
              left: 0,
              width: 32,
              height: 3,
              borderRadius: 1.5,
              background: `linear-gradient(90deg, ${colors.primary} 0%, ${colors.accent || colors.primaryDark} 100%)`,
            }}
          />
        </div>

        {/* 右侧操作区 */}
        {extra && <div style={{ flexShrink: 0 }}>{extra}</div>}
      </div>

      {/* 内容区域 - 带淡入动画 */}
      <div className="page-fade-in">
        {loading ? (
          <Skeleton active paragraph={{ rows: 8 }} />
        ) : (
          children
        )}
      </div>
    </div>
  );
};

export default PageContainer;
