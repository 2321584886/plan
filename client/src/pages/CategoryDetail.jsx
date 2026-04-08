/**
 * 分类详情页 - CategoryDetail
 *
 * 展示某投资分类的完整信息，包括：
 * - 渐变 Banner（分类名 + 总金额）
 * - 收益率概览面板（当日/7日/30日/累计/年化）
 * - 资金趋势折线图（带渐变填充）
 * - 账户明细折叠面板（支持入金/出金操作）
 */
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  Card,
  Row,
  Col,
  Collapse,
  Button,
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  message,
  Space,
  Tag,
  Empty,
  Table,
  Drawer,
  DatePicker,
} from 'antd';
/* recharts 已由 TrendChart 内部使用，此处无需导入 */
import { SwapOutlined, HistoryOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

/* 导入主题常量 */
import { colors, spacing, shadows, typography, transitions, borderRadius } from '../theme';
/* 导入公共组件 */
import PageContainer from '../components/PageContainer';
import ChartCard from '../components/ChartCard';
import TrendChart from '../components/TrendChart';
import TrendValue from '../components/TrendValue';

const { Option } = Select;

/**
 * 分类详情页主组件
 * 通过路由参数 id 获取分类数据，展示详情、收益率、趋势图和账户列表
 */
export default function CategoryDetail() {
  /** 从路由获取分类 ID */
  const { id } = useParams();

  /** 页面整体加载状态 */
  const [loading, setLoading] = useState(true);
  /** 分类详情数据（包含 name, total_amount, trend, children） */
  const [detail, setDetail] = useState(null);
  /** 独立管理的趋势数据 */
  const [trendData, setTrendData] = useState([]);
  /** 趋势图时间维度 */
  const [trendDays, setTrendDays] = useState('30');
  /** 收益率数据（包含 daily, weekly, monthly, total, annualized） */
  const [returns, setReturns] = useState(null);
  /** 入金/出金弹窗是否可见 */
  const [modalVisible, setModalVisible] = useState(false);
  /** 当前选中的账户（用于入金/出金操作） */
  const [selectedAccount, setSelectedAccount] = useState(null);
  /** 表单实例 */
  const [form] = Form.useForm();

  /** 交易记录抽屉是否可见 */
  const [txDrawerVisible, setTxDrawerVisible] = useState(false);
  /** 当前查看交易记录的账户 */
  const [txAccount, setTxAccount] = useState(null);
  /** 交易记录列表数据 */
  const [transactions, setTransactions] = useState([]);
  /** 交易记录总条数 */
  const [txTotal, setTxTotal] = useState(0);
  /** 交易记录当前页码 */
  const [txPage, setTxPage] = useState(1);
  /** 交易记录每页条数 */
  const [txPageSize] = useState(20);
  /** 交易记录加载状态 */
  const [txLoading, setTxLoading] = useState(false);
  /** 交易分类列表 */
  const [transactionTypes, setTransactionTypes] = useState([]);

  /**
   * 页面初始化 — 并行加载分类详情和收益率数据
   * 当路由 id 变化时重新触发
   */
  useEffect(() => {
    setLoading(true);

    /* 加载分类详情 */
    fetch(`/api/funds/category/${id}/detail`)
      .then(res => res.json())
      .then(data => {
        setDetail(data);
      })
      .catch(err => {
        console.error('加载分类详情失败:', err);
        message.error('加载分类详情失败');
      });

    /* 加载交易分类数据 */
    fetch('/api/transaction-types')
      .then(res => res.json())
      .then(data => setTransactionTypes(data || []))
      .catch(console.error);

    /* 加载收益率数据 */
    fetch(`/api/funds/category/${id}/returns`)
      .then(res => res.json())
      .then(data => {
        /* 如果所有收益率均为 0，则视为无收益率数据 */
        const hasReturns = data && (
          data.daily?.rate !== 0 ||
          data.weekly?.rate !== 0 ||
          data.monthly?.rate !== 0 ||
          data.total?.rate !== 0
        );
        setReturns(hasReturns ? data : null);
      })
      .catch(err => {
        console.error('加载收益率失败:', err);
        setReturns(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [id]);

  /** 独立请求趋势数据 — 随 trendDays / id 变化重新获取 */
  useEffect(() => {
    fetch(`/api/funds/category/${id}/detail?days=${trendDays}`)
      .then(res => res.json())
      .then(data => setTrendData(data.trend || []))
      .catch(console.error);
  }, [id, trendDays]);

  /**
   * 加载指定账户的交易记录
   * @param {number} accountId - 账户 ID
   * @param {number} page - 页码
   */
  const loadTransactions = async (accountId, page = 1) => {
    setTxLoading(true);
    try {
      const res = await fetch(`/api/accounts/${accountId}/transactions?page=${page}&pageSize=${txPageSize}`);
      const data = await res.json();
      setTransactions(data.transactions || []);
      setTxTotal(data.total || 0);
      setTxPage(data.page || page);
    } catch (err) {
      console.error('加载交易记录失败:', err);
      message.error('加载交易记录失败');
    } finally {
      setTxLoading(false);
    }
  };

  /**
   * 打开交易记录抽屉
   * @param {Object} account - 目标账户对象
   */
  const handleOpenTxDrawer = (account) => {
    setTxAccount(account);
    setTxDrawerVisible(true);
    loadTransactions(account.id, 1);
  };

  /**
   * 打开入金/出金弹窗
   * @param {Object} account - 目标账户对象
   */
  const handleOpenTransaction = (account) => {
    setSelectedAccount(account);
    form.resetFields();
    setModalVisible(true);
  };

  /**
   * 提交资金变动（入金/出金）
   * @param {Object} values - 表单提交的值
   */
  const handleSubmitTransaction = async (values) => {
    if (!selectedAccount) return;

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
        /* 操作成功后刷新分类详情数据 */
        const detailRes = await fetch(`/api/funds/category/${id}/detail`);
        const detailData = await detailRes.json();
        setDetail(detailData);
        /* 如果交易记录抽屉已打开且是同一账户，自动刷新交易记录 */
        if (txDrawerVisible && txAccount && txAccount.id === selectedAccount?.id) {
          loadTransactions(txAccount.id, txPage);
        }
      } else {
        const error = await response.json();
        message.error(error.error || '操作失败');
      }
    } catch (err) {
      console.error('提交失败:', err);
      message.error('提交失败');
    }
  };

  /**
   * 格式化金额显示
   * @param {number} amount - 金额数值
   * @returns {string} 格式化后的金额字符串，带 ¥ 前缀和千分位
   */
  const formatAmount = (amount) => {
    return `¥${Number(amount || 0).toLocaleString()}`;
  };

  /**
   * 根据收益值确定指标卡片的背景色
   * 正收益用成功浅色背景，负收益用危险浅色背景，零值用白色
   * @param {number} value - 收益变动值
   * @returns {string} 背景色
   */
  const getIndicatorBg = (value) => {
    const num = Number(value || 0);
    if (num > 0) return colors.successLight;
    if (num < 0) return colors.dangerLight;
    return colors.bg.card;
  };

  /* ==================== 渲染 ==================== */

  return (
    <PageContainer title={detail?.name || '分类详情'} loading={loading}>
      {detail && (
        <>
          {/* ========== 1. 顶部渐变 Banner ========== */}
          <div
            style={{
              background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryDark} 100%)`,
              borderRadius: borderRadius.lg,
              padding: `${spacing.xl}px ${spacing.xxl}px`,
              marginBottom: spacing.xl,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: spacing.lg,
            }}
          >
            {/* Banner 左侧：分类名称（白色大字） */}
            <div
              style={{
                ...typography.pageTitle,
                color: colors.text.inverse,
              }}
            >
              {detail.name}
            </div>

            {/* Banner 右侧：总金额（白色大数字） */}
            <div
              style={{
                ...typography.bigNumber,
                color: colors.text.inverse,
              }}
            >
              <span style={{ ...typography.body, color: 'rgba(255,255,255,0.75)', marginRight: spacing.xs }}>¥</span>
              {Number(detail.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>

          {/* ========== 2. 收益率概览面板 ========== */}
          {returns && (
            <Card
              bordered={false}
              title="收益率概览"
              style={{
                marginBottom: spacing.xl,
                borderRadius: borderRadius.md,
              }}
              styles={{ body: { padding: spacing.xl } }}
            >
              <Row gutter={[spacing.lg, spacing.lg]}>
                {/* 收益率指标配置列表 */}
                {[
                  { label: '当日收益', data: returns.daily },
                  { label: '近7日收益', data: returns.weekly },
                  { label: '近30日收益', data: returns.monthly },
                  { label: '累计收益', data: returns.total },
                  { label: '年化收益率', data: { change: null, rate: returns.annualized }, isAnnualized: true },
                ].map((item, idx) => (
                  <Col xs={24} sm={12} md={8} lg={4} key={idx}>
                    {/* 单个收益率指标卡片 */}
                    <div
                      style={{
                        background: item.isAnnualized
                          ? getIndicatorBg(returns.annualized)
                          : getIndicatorBg(item.data?.change),
                        borderRadius: borderRadius.md,
                        padding: spacing.lg,
                        height: '100%',
                      }}
                    >
                      {/* 指标标题 */}
                      <div
                        style={{
                          ...typography.caption,
                          color: colors.text.secondary,
                          marginBottom: spacing.sm,
                        }}
                      >
                        {item.label}
                      </div>

                      {/* 金额变动（年化指标不展示金额变动行） */}
                      {!item.isAnnualized && (
                        <div style={{ marginBottom: spacing.xs }}>
                          <TrendValue
                            value={item.data?.change || 0}
                            prefix="¥"
                            precision={2}
                            fontSize={typography.number.fontSize + 2}
                          />
                        </div>
                      )}

                      {/* 收益率百分比 */}
                      <div>
                        <TrendValue
                          value={item.isAnnualized ? (returns.annualized || 0) : (item.data?.rate || 0)}
                          suffix="%"
                          precision={2}
                          fontSize={item.isAnnualized ? typography.number.fontSize + 4 : typography.number.fontSize}
                          showArrow
                        />
                      </div>
                    </div>
                  </Col>
                ))}
              </Row>
            </Card>
          )}

          {/* ========== 3. 资金趋势图（增强版 TrendChart） ========== */}
          <div style={{ marginBottom: spacing.xl }}>
            <ChartCard title="资金趋势" height={300}>
              {trendData.length > 0 ? (
                <TrendChart
                  data={trendData}
                  height={270}
                  showTimeRangeSelector={true}
                  currentTimeRange={trendDays}
                  onTimeRangeChange={(days) => setTrendDays(days)}
                  showBrush={trendData.length > 30}
                  gradientId="category-trend"
                />
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                  <Empty description="暂无趋势数据" />
                </div>
              )}
            </ChartCard>
          </div>

          {/* ========== 4. 账户明细折叠面板 ========== */}
          <Card
            bordered={false}
            title="账户明细"
            style={{ borderRadius: borderRadius.md }}
            styles={{ body: { padding: spacing.xl } }}
          >
            {detail.children && detail.children.length > 0 ? (
              <Collapse
                defaultActiveKey={detail.children.map(c => String(c.id))}
                style={{ background: 'transparent', border: 'none' }}
                items={detail.children.map((child) => ({
                  key: String(child.id),
                  /* 折叠面板头部：分类名（加粗）+ 账户数量标签 */
                  label: (
                    <Space>
                      <span style={{ fontWeight: 600, color: colors.text.primary }}>
                        {child.name}
                      </span>
                      <Tag color="blue">{child.accounts?.length || 0} 个账户</Tag>
                    </Space>
                  ),
                  /* 折叠面板内容 */
                  children: child.accounts && child.accounts.length > 0 ? (
                    <Row gutter={[spacing.lg, spacing.lg]}>
                      {child.accounts.map((account) => (
                        <Col xs={24} sm={12} md={8} key={account.id}>
                          {/* 单个账户卡片 — 带 hover 效果 */}
                          <div
                            style={{
                              background: colors.bg.card,
                              borderRadius: borderRadius.md,
                              padding: spacing.lg,
                              border: `1px solid ${colors.border.base}`,
                              boxShadow: shadows.card,
                              transition: transitions.base,
                              cursor: 'default',
                            }}
                            /* hover 效果：轻微上移 + 阴影增强 */
                            onMouseEnter={(e) => {
                              e.currentTarget.style.transform = 'translateY(-1px)';
                              e.currentTarget.style.boxShadow = shadows.cardHover;
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.transform = 'translateY(0)';
                              e.currentTarget.style.boxShadow = shadows.card;
                            }}
                          >
                            {/* 账户名称 */}
                            <div
                              style={{
                                fontWeight: 600,
                                color: colors.text.primary,
                                marginBottom: spacing.sm,
                                ...typography.body,
                              }}
                            >
                              {account.name}
                            </div>

                            {/* 当前金额 */}
                            <div style={{ marginBottom: spacing.sm }}>
                              <span style={{ ...typography.caption, color: colors.text.secondary }}>
                                当前金额
                              </span>
                              <div
                                style={{
                                  ...typography.sectionTitle,
                                  color: colors.text.primary,
                                  marginTop: spacing.xs,
                                }}
                              >
                                {formatAmount(account.current_amount)}
                              </div>
                            </div>

                            {/* 当日涨跌 — 使用 TrendValue 组件 */}
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
                              {/* 交易记录按钮 */}
                              <Button
                                size="small"
                                icon={<HistoryOutlined />}
                                onClick={() => handleOpenTxDrawer(account)}
                              >
                                交易记录
                              </Button>
                              {/* 入金/出金按钮 */}
                              <Button
                                type="primary"
                                ghost
                                size="small"
                                icon={<SwapOutlined />}
                                onClick={() => handleOpenTransaction(account)}
                              >
                                入金/出金
                              </Button>
                            </div>
                          </div>
                        </Col>
                      ))}
                    </Row>
                  ) : (
                    /* 该分类下无账户提示 */
                    <div style={{ ...typography.body, color: colors.text.disabled, padding: `${spacing.lg}px 0` }}>
                      该分类下暂无账户
                    </div>
                  ),
                }))}
              />
            ) : (
              /* 无账户数据的空状态 */
              <div style={{ display: 'flex', justifyContent: 'center', padding: `${spacing.xxl}px 0` }}>
                <Empty description="暂无账户数据" />
              </div>
            )}
          </Card>

          {/* ========== 5. 交易记录抽屉 ========== */}
          <Drawer
            title={
              <div>
                {/* 账户名称 */}
                <div style={{ fontWeight: 600, color: colors.text.primary, ...typography.cardTitle }}>
                  {txAccount?.name} - 交易记录
                </div>
                {/* 当前余额 */}
                <div style={{ ...typography.caption, color: colors.text.secondary, marginTop: spacing.xs }}>
                  当前余额：<span style={{ ...typography.number, color: colors.primary }}>{formatAmount(txAccount?.current_amount)}</span>
                </div>
              </div>
            }
            open={txDrawerVisible}
            onClose={() => setTxDrawerVisible(false)}
            width={640}
            styles={{
              body: { padding: spacing.lg },
            }}
          >
            <Table
              dataSource={transactions}
              rowKey="id"
              loading={txLoading}
              size="middle"
              pagination={{
                current: txPage,
                pageSize: txPageSize,
                total: txTotal,
                showTotal: (total) => `共 ${total} 条记录`,
                onChange: (page) => {
                  if (txAccount) loadTransactions(txAccount.id, page);
                },
              }}
              columns={[
                {
                  title: '交易日期',
                  dataIndex: 'transaction_date',
                  key: 'transaction_date',
                  width: 120,
                  render: (text) => (
                    <span style={{ ...typography.number, color: colors.text.primary }}>{text}</span>
                  ),
                },
                {
                  title: '类型',
                  dataIndex: 'type',
                  key: 'type',
                  width: 80,
                  render: (type) => (
                    <Tag color={type === 'deposit' ? colors.success : colors.danger}>
                      {type === 'deposit' ? '入金' : '出金'}
                    </Tag>
                  ),
                },
                {
                  title: '分类',
                  dataIndex: 'transaction_type_name',
                  key: 'transaction_type_name',
                  width: 100,
                  render: (text) => text || '-',
                },
                {
                  title: '金额',
                  dataIndex: 'amount',
                  key: 'amount',
                  width: 140,
                  render: (amount, record) => (
                    <TrendValue
                      value={record.type === 'deposit' ? Number(amount) : -Number(amount)}
                      prefix="¥"
                      precision={2}
                      showArrow={false}
                    />
                  ),
                },
                {
                  title: '备注',
                  dataIndex: 'notes',
                  key: 'notes',
                  ellipsis: true,
                  render: (text) => (
                    <span style={{ color: text ? colors.text.primary : colors.text.disabled }}>
                      {text || '-'}
                    </span>
                  ),
                },
              ]}
            />
          </Drawer>

          {/* ========== 6. 入金/出金弹窗 ========== */}
          <Modal
            title={`${selectedAccount?.name || ''} - 资金变动`}
            open={modalVisible}
            onCancel={() => setModalVisible(false)}
            onOk={() => form.submit()}
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

              {/* 备注输入 */}
              <Form.Item
                name="notes"
                label="备注"
                style={{ marginBottom: spacing.sm }}
              >
                <Input.TextArea rows={3} placeholder="可选填" />
              </Form.Item>
            </Form>
          </Modal>
        </>
      )}

      {/* 加载失败且无数据时显示空状态 */}
      {!loading && !detail && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: `${spacing.page}px 0` }}>
          <Empty description="加载失败，请稍后重试" />
        </div>
      )}
    </PageContainer>
  );
}
