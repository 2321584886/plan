/**
 * Ant Design 主题定制配置
 * 
 * 通过 ConfigProvider 的 theme 属性注入，统一定制所有 Ant Design 组件的视觉风格。
 * 参考文档：https://ant.design/docs/react/customize-theme-cn
 */
import { colors, borderRadius, typography } from './index';

/** Ant Design 全局主题配置 — SuperDesign 现代极简 */
const antdTheme = {
  token: {
    /** 品牌主色 */
    colorPrimary: colors.primary,
    /** 成功色 */
    colorSuccess: colors.success,
    /** 错误色 */
    colorError: colors.danger,
    /** 警告色 */
    colorWarning: colors.warning,
    /** 全局圆角 */
    borderRadius: borderRadius.md,
    /** 字体族 */
    fontFamily: typography.fontFamily,
    /** 控件高度 — 更舒适 */
    controlHeight: 38,
    /** 基础字号 */
    fontSize: 14,
    /** 主文字色 */
    colorText: colors.text.primary,
    /** 次要文字色 */
    colorTextSecondary: colors.text.secondary,
    /** 禁用文字色 */
    colorTextDisabled: colors.text.disabled,
    /** 页面背景色 */
    colorBgLayout: colors.bg.page,
    /** 容器背景色 */
    colorBgContainer: colors.bg.card,
    /** 默认边框色 */
    colorBorder: colors.border.base,
    /** 分割线色 */
    colorSplit: colors.border.split,
    /** focus 态发光阴影 */
    controlOutline: 'rgba(79, 110, 247, 0.15)',
  },
  components: {
    /** 卡片组件 */
    Card: {
      borderRadiusLG: borderRadius.lg,
      paddingLG: 24,
    },
    /** 菜单组件 */
    Menu: {
      itemHeight: 44,
      itemBorderRadius: borderRadius.md,
      itemMarginInline: 8,
      itemMarginBlock: 6,
      darkItemSelectedBg: 'rgba(255, 255, 255, 0.12)',
      darkItemSelectedColor: '#ffffff',
      darkItemHoverBg: 'rgba(255, 255, 255, 0.08)',
      darkSubMenuItemBg: 'transparent',
    },
    /** 按钮组件 */
    Button: {
      borderRadius: borderRadius.md,
      primaryShadow: '0 2px 6px rgba(79, 110, 247, 0.25)',
    },
    /** 表格组件 */
    Table: {
      headerBg: '#f8f9fc',
      rowHoverBg: colors.bg.hover,
      headerFontWeight: 600,
      borderRadiusLG: borderRadius.lg,
    },
    /** 输入框组件 */
    Input: {
      borderRadius: borderRadius.md,
      activeBorderColor: colors.primary,
      activeShadow: '0 0 0 3px rgba(79, 110, 247, 0.12)',
    },
    /** 选择器组件 */
    Select: {
      borderRadius: borderRadius.md,
      activeBorderColor: colors.primary,
      activeShadow: '0 0 0 3px rgba(79, 110, 247, 0.12)',
    },
    /** 日期选择器组件 */
    DatePicker: {
      borderRadius: borderRadius.md,
    },
    /** 标签组件 */
    Tag: {
      borderRadiusSM: borderRadius.sm,
    },
    /** 弹窗组件 */
    Modal: {
      borderRadiusLG: borderRadius.lg,
    },
    /** 消息提示组件 */
    Message: {
      borderRadiusLG: borderRadius.md,
    },
    /** 统计数值组件 */
    Statistic: {
      contentFontSize: 24,
    },
    /** 分段控制器 */
    Segmented: {
      borderRadius: borderRadius.md,
    },
  },
};

export default antdTheme;
