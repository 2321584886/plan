/**
 * App.jsx - 应用主框架
 * 
 * 投资追踪系统的顶层布局组件，包含：
 * - 深色金融风格侧边栏（渐变背景 + Logo + 导航菜单）
 * - 可折叠侧边栏，支持展开/收起切换
 * - 主内容区域（渐变浅色背景，承载各页面路由）
 */
import { useState, useEffect } from 'react';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { Layout, Menu, Badge, Spin, Select } from 'antd';
import {
  DashboardOutlined,
  FormOutlined,
  AppstoreOutlined,
  FolderOutlined,
  FundOutlined,
  UserSwitchOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from '@ant-design/icons';

/** 导入主题常量 - 替代所有硬编码的颜色、间距、阴影等值 */
import { colors, spacing, shadows, typography, transitions, layout } from './theme';

/** 导入各页面组件 */
import Dashboard from './pages/Dashboard';
import CategoryDetail from './pages/CategoryDetail';
import DailyEntry from './pages/DailyEntry';
import DictCategories from './pages/DictCategories';
import FinanceOverview from './pages/FinanceOverview';
import FinanceSubRoute from './pages/FinanceSubRoute';

const { Sider, Content } = Layout;

/**
 * 侧边栏渐变背景样式 - 从深蓝顶部过渡到品牌深色底部
 * 营造专业金融系统的视觉氛围
 */
const siderStyle = {
  background: `linear-gradient(180deg, ${colors.bg.siderTop} 0%, ${colors.bg.siderBottom} 100%)`,
  boxShadow: shadows.sider,
  overflow: 'hidden',
  position: 'relative',
};

/**
 * Logo 区域样式 - 侧边栏顶部品牌标识
 * 高度 64px，垂直居中，底部淡色分割线
 */
const logoContainerStyle = {
  height: 64,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderBottom: `1px solid rgba(255, 255, 255, 0.15)`,
  padding: `0 ${spacing.lg}px`,
  gap: spacing.sm,
  flexShrink: 0,
};

/**
 * Logo 图标样式 - 白色金融图标
 */
const logoIconStyle = {
  fontSize: 24,
  color: colors.text.inverse,
};

/**
 * Logo 文字样式 - 白色加粗标题
 */
const logoTextStyle = {
  fontSize: 18,
  fontWeight: 600,
  color: colors.text.inverse,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  transition: transitions.base,
};

/**
 * 内容区域背景 — 柔和浅色
 */
const contentStyle = {
  padding: `clamp(10px, 1.2vw, ${layout.contentPadding}px) clamp(12px, 1.8vw, 20px)`,
  overflow: 'auto',
  background: `
    radial-gradient(1200px 500px at 100% -10%, rgba(79, 110, 247, 0.12), transparent 60%),
    radial-gradient(900px 420px at -5% 0%, rgba(34, 197, 94, 0.08), transparent 55%),
    ${colors.bg.page}
  `,
  minHeight: '100vh',
};

/**
 * 自定义折叠按钮样式 - 固定在侧边栏底部
 */
const collapseButtonStyle = {
  position: 'absolute',
  bottom: 0,
  left: 0,
  right: 0,
  height: 48,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  color: colors.text.inverse,
  fontSize: 16,
  borderTop: '1px solid rgba(255, 255, 255, 0.15)',
  background: 'rgba(255, 255, 255, 0.05)',
  transition: transitions.base,
};

/**
 * App 主组件
 * 
 * 管理应用的整体布局结构，包括：
 * 1. 侧边栏的折叠状态
 * 2. 分类数据的加载与菜单构建
 * 3. 今日提醒数量的获取与展示
 * 4. 路由页面的渲染
 */
function App() {
  /** 获取当前路由信息，用于菜单高亮 */
  const location = useLocation();
  /** 路由导航方法 */
  const navigate = useNavigate();

  /** 分类树数据 - 用于动态构建侧边栏菜单 */
  const [categories, setCategories] = useState([]);
  /** 今日待处理提醒数量 - 显示在"每日录入"菜单项上 */
  const [pendingCount, setPendingCount] = useState(0);
  /** 页面加载状态 - 控制全局 Loading 显示 */
  const [loading, setLoading] = useState(true);
  /** 侧边栏折叠状态 - true 为收起，false 为展开 */
  const [collapsed, setCollapsed] = useState(false);
  /** 可切换用户列表 */
  const [users, setUsers] = useState([]);
  /** 当前用户ID（持久化到 localStorage） */
  const [activeUserId, setActiveUserId] = useState(localStorage.getItem('activeUserId') || '1');

  const activeUser = users.find((u) => String(u.id) === String(activeUserId));

  const formatMoney = (value) => {
    const num = Number(value || 0);
    return `¥${num.toLocaleString()}`;
  };

  /** 子菜单展开状态 - 受控管理，支持用户手动展开/收起 */
  const [menuOpenKeys, setMenuOpenKeys] = useState(
    location.pathname.startsWith('/finance') ? ['sub-finance'] : []
  );

  /** 子菜单展开/收起回调 */
  const handleOpenChange = (keys) => {
    setMenuOpenKeys(keys);
  };

  /** 监听路由变化，自动展开对应子菜单 */
  useEffect(() => {
    if (location.pathname.startsWith('/finance')) {
      setMenuOpenKeys(prev => prev.includes('sub-finance') ? prev : [...prev, 'sub-finance']);
    }
  }, [location.pathname]);

  /** 加载用户列表，供侧栏切换 */
  useEffect(() => {
    fetch('/api/users')
      .then(res => res.json())
      .then(data => {
        const list = Array.isArray(data) ? data : [];
        setUsers(list);

        if (list.length === 0) return;

        const hasActive = list.some(u => String(u.id) === String(activeUserId));
        if (!hasActive) {
          const fallbackId = String(list[0].id);
          localStorage.setItem('activeUserId', fallbackId);
          setActiveUserId(fallbackId);
          window.location.reload();
        }
      })
      .catch(err => {
        console.error('加载用户列表失败:', err);
      });
  }, []);

  /**
   * 加载分类树数据
   * 从后端接口获取所有投资分类，构建侧边栏动态菜单项
   */
  useEffect(() => {
    fetch('/api/dict-categories/tree')
      .then(res => res.json())
      .then(data => {
        setCategories(data || []);
        setLoading(false);
      })
      .catch(err => {
        console.error('加载分类失败:', err);
        setLoading(false);
      });
  }, []);

  /**
   * 加载今日提醒数量
   * 获取当天待处理的基金提醒条数，用于菜单项角标展示
   */
  useEffect(() => {
    fetch('/api/funds/reminders/today')
      .then(res => res.json())
      .then(data => {
        setPendingCount(data?.pending_count || 0);
      })
      .catch(console.error);
  }, []);

  /**
   * 菜单点击事件处理
   * 根据菜单项的 key（即路由路径）进行页面导航
   */
  const handleMenuClick = ({ key }) => {
    navigate(key);
  };

  /**
   * 切换侧边栏折叠状态
   */
  const toggleCollapsed = () => {
    setCollapsed(prev => !prev);
  };

  const handleUserChange = (userId) => {
    const nextUserId = String(userId);
    if (nextUserId === String(activeUserId)) return;

    localStorage.setItem('activeUserId', nextUserId);
    setActiveUserId(nextUserId);
    window.location.reload();
  };

  /**
   * 构建侧边栏菜单项列表
   * 
   * 菜单结构分为两部分：
   * 1. 固定菜单项：仪表盘、每日录入、字典管理
   * 2. 动态分类菜单：从后端加载的投资分类，以分组形式展示
   * 
   * @returns {Array} Ant Design Menu 组件所需的 items 数组
   */
  const buildMenuItems = () => {
    /** 固定菜单项 - 系统核心功能入口 */
    const items = [
      {
        key: '/',
        icon: <DashboardOutlined />,
        label: '仪表盘',
      },
      {
        key: '/daily-entry',
        icon: <FormOutlined />,
        label: (
          <span>
            每日录入
            {pendingCount > 0 && (
              <Badge count={pendingCount} size="small" style={{ marginLeft: 8 }} />
            )}
          </span>
        ),
      },
      {
        key: '/dict-categories',
        icon: <AppstoreOutlined />,
        label: '字典管理',
      },
    ];

    /**
     * 动态分类菜单项 - 以"资产分类"分组标题展示
     * 仅在有分类数据时才添加此分组
     */
    if (categories.length > 0) {
      items.push({
        type: 'group',
        label: collapsed ? null : '资产分类',
        children: categories.map(cat => {
          if (cat.children && cat.children.length > 0) {
            /** 有子分类的菜单项 - 生成可展开的子菜单（如理财分类） */
            return {
              key: 'sub-finance',
              icon: <FundOutlined />,
              label: cat.name,
              children: [
                {
                  key: '/finance-overview',
                  label: '理财总览',
                },
                ...cat.children.map(child => ({
                  key: `/finance/${child.id}`,
                  label: child.name,
                })),
              ],
            };
          }
          /** 无子分类的菜单项 - 普通导航链接 */
          return {
            key: `/category/${cat.id}`,
            icon: <FolderOutlined />,
            label: cat.name,
          };
        }),
      });
    }

    return items;
  };

  /**
   * 全局加载态 - 分类数据未就绪时展示居中 Loading
   */
  if (loading) {
    return (
      <Layout style={{
        minHeight: '100vh',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        background: colors.bg.page,
      }}>
        <Spin size="large" />
      </Layout>
    );
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {/* ========== 深色金融风格侧边栏 ========== */}
      <Sider
        collapsible
        collapsed={collapsed}
        trigger={null}
        width={layout.siderWidth}
        collapsedWidth={layout.siderCollapsedWidth}
        style={siderStyle}
      >
        {/* Logo 区域 - 品牌标识，折叠时只显示图标 */}
        <div style={logoContainerStyle}>
          <FundOutlined style={logoIconStyle} />
          {!collapsed && <span style={logoTextStyle}>投资追踪</span>}
        </div>

        {!collapsed && (
          <div className="user-switcher-panel">
            <div className="user-switcher-meta">
              <span className="user-switcher-title">当前用户</span>
              <span className="user-switcher-amount">{formatMoney(activeUser?.total_amount || 0)}</span>
            </div>
            <Select
              value={activeUserId}
              onChange={handleUserChange}
              className="user-switcher-select"
              style={{ width: '100%' }}
              size="middle"
              suffixIcon={<UserSwitchOutlined style={{ color: 'rgba(255, 255, 255, 0.75)' }} />}
              options={users.map(user => ({
                value: String(user.id),
                label: (
                  <div className="user-switcher-option">
                    <span className="user-switcher-name">{user.username}</span>
                    <span className="user-switcher-id">ID:{user.id}</span>
                  </div>
                ),
              }))}
            />
          </div>
        )}

        {/* 导航菜单 - 深色主题，背景透明以透出渐变 */}
        <div style={{ flex: 1, overflowY: 'auto', paddingTop: spacing.sm, paddingBottom: 48 }}>
          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={[location.pathname]}
            openKeys={menuOpenKeys}
            onOpenChange={handleOpenChange}
            items={buildMenuItems()}
            onClick={handleMenuClick}
            style={{ background: 'transparent', borderRight: 'none' }}
          />
        </div>

        {/* 自定义折叠按钮 - 固定在侧边栏底部 */}
        <div
          style={collapseButtonStyle}
          onClick={toggleCollapsed}
          role="button"
          tabIndex={0}
          title={collapsed ? '展开侧边栏' : '收起侧边栏'}
        >
          {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
        </div>
      </Sider>

      {/* ========== 主内容区域 ========== */}
      <Layout>
        <Content style={contentStyle}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/daily-entry" element={<DailyEntry />} />
            <Route path="/dict-categories" element={<DictCategories />} />
            <Route path="/category/:id" element={<CategoryDetail />} />
            <Route path="/finance-overview" element={<FinanceOverview />} />
            <Route path="/finance/:subId" element={<FinanceSubRoute />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  );
}

export default App;
