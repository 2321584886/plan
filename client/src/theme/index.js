/**
 * 主题配置 - 投资追踪系统统一设计规范
 * 
 * 基于 SuperDesign 现代极简风格 (Vercel/Linear)
 * 本文件定义了应用的所有视觉常量，包括颜色、间距、字体、阴影等。
 * 所有页面和组件必须引用此处常量，禁止硬编码颜色值。
 */

/** 主色调 — 现代蓝紫 indigo-blue */
export const colors = {
  /** 品牌主色 - 现代 indigo-blue，避免 generic blue */
  primary: '#4f6ef7',
  /** 品牌深色 - 用于侧边栏等深色区域 */
  primaryDark: '#2c3e99',
  /** 品牌浅色 - 用于背景高亮 */
  primaryLight: '#eef1ff',
  /** 品牌强调色 - 用于小面积点缀 */
  accent: '#6366f1',
  
  /** 成功/上涨色 - 鲜艳绿 */
  success: '#22c55e',
  /** 成功浅色背景 */
  successLight: '#f0fdf4',
  /** 危险/下跌色 - 现代红 */
  danger: '#ef4444',
  /** 危险浅色背景 */
  dangerLight: '#fef2f2',
  /** 警告色 - 琥珀橙 */
  warning: '#f59e0b',
  /** 警告浅色背景 */
  warningLight: '#fffbeb',
  /** 信息色 - 品牌蓝紫 */
  info: '#4f6ef7',
  /** 信息浅色背景 */
  infoLight: '#eef1ff',
  
  /** 文字颜色 */
  text: {
    /** 主要文字 */
    primary: 'rgba(15, 23, 42, 0.92)',
    /** 次要文字 */
    secondary: 'rgba(15, 23, 42, 0.58)',
    /** 占位/禁用文字 */
    disabled: 'rgba(15, 23, 42, 0.25)',
    /** 反色文字（深色背景上使用） */
    inverse: '#ffffff',
  },
  
  /** 背景色 */
  bg: {
    /** 页面主背景 */
    page: '#f8f9fc',
    /** 卡片背景 */
    card: '#ffffff',
    /** 表面层 - 用于内嵌区域 */
    surface: '#f1f3f8',
    /** 悬浮层 - 用于弹窗、下拉等 */
    elevated: '#ffffff',
    /** 侧边栏顶部（深色） */
    siderTop: '#0f172a',
    /** 侧边栏底部（渐变终点） */
    siderBottom: '#1e293b',
    /** 表格斑马纹背景 */
    tableStripe: '#f8f9fc',
    /** 悬浮高亮背景 */
    hover: 'rgba(79, 110, 247, 0.04)',
  },
  
  /** 边框颜色 */
  border: {
    /** 默认边框 */
    base: '#e5e7eb',
    /** 分割线 */
    split: 'rgba(15, 23, 42, 0.06)',
  },
  
  /** 图表配色方案（9色） — 与品牌 indigo-blue 协调 */
  chart: ['#4f6ef7', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'],
};

/** 间距规范 - 基于 8px 网格系统 */
export const spacing = {
  /** 2px - 极小间距（精细调整） */
  micro: 2,
  /** 4px - 极小间距 */
  xs: 4,
  /** 8px - 小间距 */
  sm: 8,
  /** 12px - 中间距 */
  md: 12,
  /** 16px - 大间距 */
  lg: 16,
  /** 24px - 超大间距 */
  xl: 24,
  /** 32px - 极大间距 */
  xxl: 32,
  /** 48px - 页面级间距 */
  page: 48,
};

/** 圆角规范 — 现代大圆角 */
export const borderRadius = {
  /** 6px - 小圆角（标签、徽标等） */
  sm: 6,
  /** 10px - 中圆角（按钮、输入框、卡片等） */
  md: 10,
  /** 14px - 大圆角（弹窗、Banner 等） */
  lg: 14,
  /** 20px - 特大圆角（浮动面板等） */
  xl: 20,
  /** 圆形 */
  round: '50%',
};

/** 阴影规范 — 3层深度 + 语义阴影 */
export const shadows = {
  /** 小阴影 - 内嵌元素、分割区域 */
  sm: '0 1px 3px rgba(15, 23, 42, 0.04), 0 1px 2px rgba(15, 23, 42, 0.02)',
  /** 卡片默认阴影 */
  card: '0 2px 8px rgba(15, 23, 42, 0.06), 0 1px 3px rgba(15, 23, 42, 0.04)',
  /** 卡片悬浮阴影 */
  cardHover: '0 8px 24px rgba(15, 23, 42, 0.10), 0 2px 8px rgba(15, 23, 42, 0.06)',
  /** 大阴影 - 弹窗、下拉等 */
  lg: '0 12px 32px rgba(15, 23, 42, 0.12), 0 4px 12px rgba(15, 23, 42, 0.06)',
  /** 侧边栏阴影 */
  sider: '2px 0 12px rgba(15, 23, 42, 0.10)',
  /** 下拉菜单阴影 */
  dropdown: '0 8px 24px rgba(15, 23, 42, 0.10), 0 2px 8px rgba(15, 23, 42, 0.05)',
  /** 弹窗阴影 */
  modal: '0 16px 48px rgba(15, 23, 42, 0.16), 0 4px 16px rgba(15, 23, 42, 0.08)',
  /** 品牌色发光 - 用于 focus 态 */
  glow: '0 0 0 3px rgba(79, 110, 247, 0.15)',
};

/** 字体规范 — Inter 字体 + 语义层级 */
export const typography = {
  /** 全局字体族 — Plus Jakarta Sans + 系统回退 */
  fontFamily: "'Plus Jakarta Sans', 'PingFang SC', 'Microsoft YaHei', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  /** 页面大标题 */
  pageTitle: { fontSize: 24, fontWeight: 700, lineHeight: 1.3, letterSpacing: '-0.02em' },
  /** 区块标题 */
  sectionTitle: { fontSize: 18, fontWeight: 600, lineHeight: 1.4, letterSpacing: '-0.01em' },
  /** 卡片标题 */
  cardTitle: { fontSize: 15, fontWeight: 600, lineHeight: 1.5 },
  /** 正文 */
  body: { fontSize: 14, fontWeight: 400, lineHeight: 1.6 },
  /** 辅助文字 */
  caption: { fontSize: 12, fontWeight: 400, lineHeight: 1.5 },
  /** 数据数字（等宽） */
  number: { fontSize: 14, fontWeight: 600, fontFamily: "'JetBrains Mono', 'Tabular Nums', monospace", fontVariantNumeric: 'tabular-nums' },
  /** 大数字展示 */
  bigNumber: { fontSize: 28, fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' },
};

/** 过渡动画规范 — 语义化时间曲线 */
export const transitions = {
  /** 默认过渡 */
  base: 'all 0.3s cubic-bezier(0.645, 0.045, 0.355, 1)',
  /** 快速过渡 */
  fast: 'all 0.15s ease',
  /** 弹性过渡 — hover/点击回弹 */
  bounce: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
  /** 平滑过渡 — 页面级动画 */
  smooth: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
  /** 微交互 — 按钮/小元素 */
  micro: 'all 0.12s ease-out',
  /** 弹性回弹 — spring 效果 */
  spring: 'all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
};

/** 布局尺寸规范 */
export const layout = {
  /** 侧边栏展开宽度 */
  siderWidth: 220,
  /** 侧边栏收起宽度 */
  siderCollapsedWidth: 64,
  /** 页面内容最大宽度 */
  contentMaxWidth: 1400,
  /** 页面内边距（收紧默认值，避免内容区留白过大） */
  contentPadding: 16,
};
