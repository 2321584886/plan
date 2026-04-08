/**
 * 子分类详情页 - SubCategoryDetail
 *
 * 展示某投资子分类的完整信息，包括：
 * - 顶部信息条（子分类名 + 总金额）
 * - 资金趋势面积图（近30天，蓝色渐变填充）
 * - 账户卡片列表（名称、金额、涨跌、入金/出金操作）
 * - 入金/出金弹窗（Modal + Form）
 *
 * @module SubCategoryDetail
 */
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card,
  Row,
  Col,
  Button,
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  message,
  Empty,
  Dropdown,
  Space,
  DatePicker,
} from 'antd';
import {
  MoreOutlined,
  EditOutlined,
  DeleteOutlined,
  DollarOutlined,
  PlusOutlined,
  MinusOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';


/* 导入主题常量 */
import { colors, spacing, shadows, typography, transitions, borderRadius } from '../theme';
/* 导入公共组件 */
import PageContainer from '../components/PageContainer';
import ChartCard from '../components/ChartCard';
import TrendValue from '../components/TrendValue';
import TrendChart from '../components/TrendChart';
import EarningsCalendar from '../components/EarningsCalendar';

const { Option } = Select;

/**
 * 格式化金额显示
 * @param {number} amount - 金额数值
 * @returns {string} 格式化后的金额字符串，带千分位
 */
const formatAmount = (amount) => {
  return Number(amount || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

/**
 * 子分类详情页主组件
 * 通过路由参数 subId 获取子分类数据，展示详情、趋势图和账户列表
 */
export default function SubCategoryDetail() {
  /** 从路由获取子分类 ID */
  const { subId } = useParams();
  /** 路由导航 */
  const navigate = useNavigate();

  /** 页面整体加载状态 */
  const [loading, setLoading] = useState(true);
  /** 子分类详情数据（包含 name, parent_name, total_amount, accounts, trend） */
  const [detail, setDetail] = useState(null);
  /** 入金/出金弹窗是否可见 */
  const [modalVisible, setModalVisible] = useState(false);
  /** 当前选中的账户（用于入金/出金操作） */
  const [selectedAccount, setSelectedAccount] = useState(null);
  /** 弹窗默认操作类型（deposit=入金，withdraw=出金） */
  const [defaultType, setDefaultType] = useState('deposit');
  /** 表单实例 */
  const [form] = Form.useForm();
  /** 提交加载状态 */
  const [submitting, setSubmitting] = useState(false);
  /** 交易分类列表 */
  const [transactionTypes, setTransactionTypes] = useState([]);
  /** 趋势数据 */
  const [trendData, setTrendData] = useState([]);
  /** 趋势时间维度 */
  const [trendDays, setTrendDays] = useState('30');

  /** 账户管理弹窗 */
  const [accountModalVisible, setAccountModalVisible] = useState(false);
  const [accountModalMode, setAccountModalMode] = useState('add'); // 'add' | 'rename' | 'updateBalance'
  const [editingAccount, setEditingAccount] = useState(null);
  const [accountForm] = Form.useForm();

  /**
   * 加载子分类详情数据
   * 当路由 subId 变化时重新触发
   */
  const fetchDetail = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/funds/subcategory/${subId}/detail`);
      if (!res.ok) throw new Error('请求失败');
      const data = await res.json();
      setDetail(data);
    } catch (err) {
      console.error('加载子分类详情失败:', err);
      message.error('加载子分类详情失败');
    } finally {
      setLoading(false);
    }
  };

  /** 初始化加载 */
  useEffect(() => {
    fetchDetail();
    /* 加载交易分类数据 */
    fetch('/api/transaction-types')
      .then(res => res.json())
      .then(data => setTransactionTypes(data || []))
      .catch(console.error);
  }, [subId]);

  /** 趋势数据独立加载 — 跟随时间维度切换 */
  useEffect(() => {
    fetch(`/api/funds/subcategory/${subId}/detail?days=${trendDays}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => setTrendData(data?.trend || []))
      .catch(console.error);
  }, [subId, trendDays]);

  /**
   * 打开入金/出金弹窗
   * @param {Object} account - 目标账户对象
   * @param {string} type - 操作类型：'deposit' 或 'withdraw'
   */
  const handleOpenModal = (account, type = 'deposit') => {
    setSelectedAccount(account);
    setDefaultType(type);
    form.resetFields();
    form.setFieldsValue({ type });
    setModalVisible(true);
  };

  /**
   * 提交资金变动（入金/出金）
   * @param {Object} values - 表单提交的值
   */
  const handleSubmitTransaction = async (values) => {
    if (!selectedAccount) return;
    setSubmitting(true);

    try {
      const response = await fetch(`/api/accounts/${selectedAccount.id}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transaction_date: values.transaction_date.format('YYYY-MM-DD'),
          type: values.type,
          amount: values.amount,
          notes: values.notes,
          transaction_type_id: values.transaction_type_id || null,
        }),
      });

      if (response.ok) {
        message.success('操作成功');
        setModalVisible(false);
        /* 操作成功后刷新子分类详情数据 */
        fetchDetail();
      } else {
        const error = await response.json();
        message.error(error.error || '操作失败');
      }
    } catch (err) {
      console.error('提交失败:', err);
      message.error('提交失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * 打开新增账户弹窗
   */
  const handleAddAccount = () => {
    setAccountModalMode('add');
    setEditingAccount(null);
    accountForm.resetFields();
    setAccountModalVisible(true);
  };

  /**
   * 打开重命名账户弹窗
   * @param {Object} account - 目标账户对象
   */
  const handleRenameAccount = (account) => {
    setAccountModalMode('rename');
    setEditingAccount(account);
    accountForm.resetFields();
    accountForm.setFieldsValue({ name: account.name });
    setAccountModalVisible(true);
  };

  /**
   * 打开更新余额弹窗
   * @param {Object} account - 目标账户对象
   */
  const handleUpdateBalance = (account) => {
    setAccountModalMode('updateBalance');
    setEditingAccount(account);
    accountForm.resetFields();
    accountForm.setFieldsValue({ current_amount: account.current_amount });
    setAccountModalVisible(true);
  };

  /**
   * 删除账户（带确认弹窗）
   * @param {Object} account - 目标账户对象
   */
  const handleDeleteAccount = (account) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除账户「${account.name}」吗？此操作不可恢复。`,
      okText: '确认删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const res = await fetch(`/api/accounts/${account.id}`, { method: 'DELETE' });
          if (res.ok) {
            message.success('删除成功');
            fetchDetail();
          } else {
            const error = await res.json();
            message.error(error.error || '删除失败');
          }
        } catch (err) {
          console.error('删除账户失败:', err);
          message.error('删除失败，请稍后重试');
        }
      },
    });
  };

  /**
   * 账户管理弹窗统一提交处理
   * @param {Object} values - 表单提交的值
   */
  const handleAccountSubmit = async (values) => {
    try {
      let res;
      if (accountModalMode === 'add') {
        /* 新增账户 */
        res = await fetch('/api/accounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: values.name, dict_category_id: detail.id }),
        });
      } else if (accountModalMode === 'rename') {
        /* 重命名账户 */
        res = await fetch(`/api/accounts/${editingAccount.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: values.name }),
        });
      } else if (accountModalMode === 'updateBalance') {
        /* 更新余额 */
        res = await fetch(`/api/accounts/${editingAccount.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ current_amount: values.current_amount }),
        });
      }

      if (res && res.ok) {
        message.success('操作成功');
        setAccountModalVisible(false);
        fetchDetail();
      } else if (res) {
        const error = await res.json();
        message.error(error.error || '操作失败');
      }
    } catch (err) {
      console.error('账户操作失败:', err);
      message.error('操作失败，请稍后重试');
    }
  };

  /* ==================== 渲染区域 ==================== */

  /** 面包屑式标题：父分类 / 子分类 */
  const pageTitle = detail
    ? `${detail.parent_name || ''} / ${detail.name}`
    : '子分类详情';

  /** 账户列表 */
  const accounts = detail?.accounts || [];

  return (
    <PageContainer title={pageTitle} loading={loading}>
      {detail && (
        <>
          {/* ========== 1. 顶部信息条 ========== */}
          <div
            style={{
              background: colors.bg.card,
              borderRadius: borderRadius.md,
              boxShadow: shadows.card,
              padding: `${spacing.xl}px ${spacing.xxl}px`,
              marginBottom: spacing.xl,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: spacing.lg,
            }}
          >
            {/* 左侧：子分类名称 */}
            <div style={{ ...typography.sectionTitle, color: colors.text.primary }}>
              {detail.name}
            </div>

            {/* 右侧：总金额（大号数字） */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: spacing.xs }}>
              <span style={{ ...typography.body, color: colors.text.secondary }}>¥</span>
              <span style={{ ...typography.bigNumber, color: colors.text.primary }}>
                {formatAmount(detail.total_amount)}
              </span>
            </div>
          </div>

          {/* ========== 2. 资金趋势图 ========== */}
          <div style={{ marginBottom: spacing.xl }}>
            <ChartCard title="资金趋势" height={280}>
              {trendData.length > 0 ? (
                <TrendChart
                  data={trendData}
                  height={250}
                  showTimeRangeSelector={true}
                  currentTimeRange={trendDays}
                  onTimeRangeChange={(days) => setTrendDays(days)}
                  showBrush={trendData.length > 30}
                  gradientId="subcategory-trend"
                />
              ) : (
                /* 无数据时展示空状态 */
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                  <Empty description="暂无趋势数据" />
                </div>
              )}
            </ChartCard>
          </div>

          {/* ========== 2.5. 收益日历（仅活期+/活期+plus） ========== */}
          {(detail.id === 7 || detail.id === 8) && accounts.length > 0 && (
            <div style={{ marginBottom: spacing.xl }}>
              <Row gutter={[spacing.lg, spacing.lg]}>
                {accounts.map((account) => (
                  <Col xs={24} md={12} key={`cal-${account.id}`}>
                    <Card
                      bordered={false}
                      style={{ borderRadius: borderRadius.md }}
                      styles={{ body: { padding: spacing.lg } }}
                    >
                      <EarningsCalendar accountId={account.id} accountName={account.name} />
                    </Card>
                  </Col>
                ))}
              </Row>
            </div>
          )}

          {/* ========== 3. 账户列表 ========== */}
          <Card
            bordered={false}
            title="账户列表"
            extra={
              <Space>
                <span style={{ ...typography.caption, color: colors.text.secondary }}>
                  共 {accounts.length} 个账户
                </span>
                <Button
                  type="primary"
                  ghost
                  size="small"
                  icon={<PlusOutlined />}
                  onClick={handleAddAccount}
                >
                  新增账户
                </Button>
              </Space>
            }
            style={{ borderRadius: borderRadius.md }}
            styles={{ body: { padding: spacing.xl } }}
          >
            {accounts.length > 0 ? (
              <Row gutter={[spacing.lg, spacing.lg]}>
                {accounts.map((account) => (
                  <Col xs={24} sm={12} md={8} key={account.id}>
                    {/* 单个账户卡片 — 带 hover 上浮效果 */}
                    <div
                      style={{
                        background: colors.bg.card,
                        borderRadius: borderRadius.md,
                        padding: spacing.lg,
                        border: `1px solid ${colors.border.base}`,
                        boxShadow: shadows.card,
                        transition: transitions.base,
                        cursor: 'default',
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                      }}
                      /* hover 效果：微上浮 + 阴影增大 */
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.boxShadow = shadows.cardHover;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = shadows.card;
                      }}
                    >
                      {/* 账户名称 + 操作菜单 */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
                        <div style={{ ...typography.cardTitle, fontWeight: 600, color: colors.text.primary }}>
                          {account.name}
                        </div>
                        <Dropdown
                          menu={{
                            items: [
                              { key: 'rename', icon: <EditOutlined />, label: '重命名' },
                              { key: 'updateBalance', icon: <DollarOutlined />, label: '更新余额' },
                              { type: 'divider' },
                              { key: 'delete', icon: <DeleteOutlined />, label: '删除账户', danger: true },
                            ],
                            onClick: ({ key }) => {
                              if (key === 'rename') handleRenameAccount(account);
                              else if (key === 'updateBalance') handleUpdateBalance(account);
                              else if (key === 'delete') handleDeleteAccount(account);
                            },
                          }}
                          trigger={['click']}
                        >
                          <Button type="text" size="small" icon={<MoreOutlined />} />
                        </Dropdown>
                      </div>

                      {/* 当前金额（大号数字） */}
                      <div
                        style={{
                          ...typography.sectionTitle,
                          color: colors.text.primary,
                          marginBottom: spacing.sm,
                        }}
                      >
                        <span style={{ ...typography.body, color: colors.text.secondary, marginRight: spacing.xs }}>¥</span>
                        {formatAmount(account.current_amount)}
                      </div>

                      {/* 当日涨跌 — 使用 TrendValue 组件，非 0 时显示 */}
                      {account.daily_change !== 0 && (
                        <div style={{ marginBottom: spacing.md }}>
                          <span style={{ ...typography.caption, color: colors.text.secondary, marginRight: spacing.sm }}>
                            当日涨跌
                          </span>
                          <TrendValue
                            value={account.daily_change}
                            prefix="¥"
                            precision={2}
                            showArrow
                          />
                        </div>
                      )}

                      {/* 弹性占位 — 将操作按钮推到底部 */}
                      <div style={{ flex: 1 }} />

                      {/* 操作按钮区 */}
                      <div
                        style={{
                          borderTop: `1px solid ${colors.border.split}`,
                          paddingTop: spacing.md,
                          marginTop: spacing.sm,
                          display: 'flex',
                          justifyContent: 'flex-end',
                          gap: spacing.sm,
                        }}
                      >
                        {/* 入金按钮 */}
                        <Button
                          type="primary"
                          ghost
                          size="small"
                          icon={<PlusOutlined />}
                          onClick={() => handleOpenModal(account, 'deposit')}
                        >
                          入金
                        </Button>
                        {/* 出金按钮 */}
                        <Button
                          danger
                          ghost
                          size="small"
                          icon={<MinusOutlined />}
                          onClick={() => handleOpenModal(account, 'withdraw')}
                        >
                          出金
                        </Button>
                      </div>
                    </div>
                  </Col>
                ))}
              </Row>
            ) : (
              /* 无账户数据的空状态 */
              <div style={{ display: 'flex', justifyContent: 'center', padding: `${spacing.xxl}px 0` }}>
                <Empty description="暂无账户数据" />
              </div>
            )}
          </Card>
        </>
      )}

      {/* 加载失败且无数据时显示空状态 */}
      {!loading && !detail && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: `${spacing.page}px 0` }}>
          <Empty description="加载失败，请稍后重试" />
        </div>
      )}

      {/* ========== 4. 入金/出金弹窗 ========== */}
      <Modal
        title={`${defaultType === 'deposit' ? '入金' : '出金'} - ${selectedAccount?.name || ''}`}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={() => form.submit()}
        okText="确认"
        cancelText="取消"
        confirmLoading={submitting}
        styles={{
          content: {
            borderRadius: borderRadius.lg,
            padding: spacing.xl,
          },
        }}
        width={480}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmitTransaction}
          style={{ marginTop: spacing.lg }}
        >
          {/* 操作类型选择 */}
          <Form.Item
            name="type"
            label="操作类型"
            rules={[{ required: true, message: '请选择操作类型' }]}
            style={{ marginBottom: spacing.xl }}
          >
            <Select
              placeholder="请选择"
              size="large"
              onChange={() => form.setFieldValue('transaction_type_id', undefined)}
            >
              <Option value="deposit">入金</Option>
              <Option value="withdraw">出金</Option>
            </Select>
          </Form.Item>

          {/* 交易分类选择 */}
          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.type !== cur.type}>
            {() => {
              const currentType = form.getFieldValue('type');
              return (
                <Form.Item name="transaction_type_id" label="交易分类" style={{ marginBottom: spacing.xl }}>
                  <Select placeholder="请选择分类（可选）" allowClear size="large">
                    {transactionTypes
                      .filter(t => {
                        if (currentType === 'deposit') return t.type === 'income';
                        if (currentType === 'withdraw') return t.type === 'expense';
                        return true;
                      })
                      .map(t => (
                        <Option key={t.id} value={t.id}>{t.name}</Option>
                      ))}
                  </Select>
                </Form.Item>
              );
            }}
          </Form.Item>

          {/* 交易日期选择 */}
          <Form.Item
            name="transaction_date"
            label="交易日期"
            initialValue={dayjs()}
            rules={[{ required: true, message: '请选择日期' }]}
            style={{ marginBottom: spacing.xl }}
          >
            <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" size="large" />
          </Form.Item>

          {/* 金额输入 */}
          <Form.Item
            name="amount"
            label="金额"
            rules={[
              { required: true, message: '请输入金额' },
              { type: 'number', min: 0.01, message: '金额必须大于0' },
            ]}
            style={{ marginBottom: spacing.xl }}
          >
            <InputNumber
              style={{ width: '100%' }}
              prefix="¥"
              precision={2}
              placeholder="请输入金额"
              size="large"
            />
          </Form.Item>

          {/* 备注输入（可选） */}
          <Form.Item
            name="notes"
            label="备注"
            style={{ marginBottom: spacing.sm }}
          >
            <Input.TextArea rows={3} placeholder="可选填" />
          </Form.Item>
        </Form>
      </Modal>

      {/* ========== 5. 账户管理弹窗（新增/重命名/更新余额） ========== */}
      <Modal
        title={
          accountModalMode === 'add' ? '新增账户' :
          accountModalMode === 'rename' ? '重命名账户' : '更新余额'
        }
        open={accountModalVisible}
        onCancel={() => setAccountModalVisible(false)}
        onOk={() => accountForm.submit()}
        okText="确认"
        cancelText="取消"
        styles={{
          content: {
            borderRadius: borderRadius.lg,
            padding: spacing.xl,
          },
        }}
        width={480}
      >
        <Form form={accountForm} layout="vertical" onFinish={handleAccountSubmit} style={{ marginTop: spacing.lg }}>
          {(accountModalMode === 'add' || accountModalMode === 'rename') && (
            <Form.Item name="name" label="账户名称" rules={[{ required: true, message: '请输入账户名称' }]}>
              <Input placeholder="请输入账户名称" size="large" />
            </Form.Item>
          )}
          {accountModalMode === 'updateBalance' && (
            <Form.Item name="current_amount" label="当前余额" rules={[{ required: true, message: '请输入余额' }]}>
              <InputNumber style={{ width: '100%' }} prefix="¥" precision={2} placeholder="请输入金额" size="large" />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </PageContainer>
  );
}
