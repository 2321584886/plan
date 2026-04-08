/**
 * 每日录入页面 - DailyEntry
 *
 * 用于每日录入各账户的金额、涨跌和备注信息，支持入金/出金操作。
 * 账户按一级分类（Collapse）→ 二级分类（Card）→ 账户行方式分组展示。
 */
import { useState, useEffect } from 'react';
import {
  Card,
  DatePicker,
  InputNumber,
  Input,
  Button,
  message,
  Modal,
  Form,
  Select,
  Radio,
  Space,
  Tag,
  Collapse
} from 'antd';
import { SaveOutlined, SwapOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import PageContainer from '../components/PageContainer';
import { colors, spacing, shadows, typography, transitions, borderRadius } from '../theme';

const { Panel } = Collapse;

/** 输入标签统一样式 - 用于金额/涨跌/备注等字段的标签文字 */
const labelStyle = {
  display: 'block',
  fontSize: typography.caption.fontSize,
  color: colors.text.secondary,
  marginBottom: spacing.xs,
  lineHeight: typography.caption.lineHeight,
};

/** 账户行容器样式 - 带 hover 高亮效果的基础样式 */
const accountRowBaseStyle = {
  display: 'flex',
  alignItems: 'center',
  padding: `${spacing.md}px ${spacing.lg}px`,
  borderBottom: `1px solid ${colors.border.base}`,
  borderRadius: borderRadius.sm,
  transition: transitions.fast,
  cursor: 'default',
};

export default function DailyEntry() {
  /** 当前选中的日期 */
  const [selectedDate, setSelectedDate] = useState(dayjs());
  /** 所有账户列表 */
  const [accounts, setAccounts] = useState([]);
  /** 最近一次的录入记录 */
  const [latestRecords, setLatestRecords] = useState([]);
  /** 数据加载状态 */
  const [loading, setLoading] = useState(true);
  /** 表单数据，以账户 ID 为 key */
  const [formData, setFormData] = useState({});

  /** 入金/出金弹窗是否可见 */
  const [transactionModalVisible, setTransactionModalVisible] = useState(false);
  /** 入金/出金表单实例 */
  const [transactionForm] = Form.useForm();
  /** 交易分类列表 */
  const [transactionTypes, setTransactionTypes] = useState([]);

  /** 当前 hover 的账户行 ID，用于高亮效果 */
  const [hoveredRow, setHoveredRow] = useState(null);

  /**
   * 加载账户列表和最近录入数据
   * 同时发起两个 API 请求，并根据最新记录初始化表单数据
   */
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const [accountsRes, latestRes] = await Promise.all([
          fetch('/api/accounts'),
          fetch('/api/daily-records/latest')
        ]);

        const accountsData = await accountsRes.json();
        const latestData = await latestRes.json();

        setAccounts(accountsData);
        setLatestRecords(latestData);

        /* 加载交易分类数据 */
        const typesRes = await fetch('/api/transaction-types');
        const typesData = await typesRes.json();
        setTransactionTypes(typesData || []);

        /* 初始化表单数据：优先使用最近记录的金额，否则使用账户当前金额 */
        const initialFormData = {};
        accountsData.forEach(account => {
          const latestRecord = latestData.find(r => r.account_id === account.id);
          initialFormData[account.id] = {
            amount: latestRecord ? latestRecord.amount : account.current_amount,
            daily_change: latestRecord ? latestRecord.daily_change : 0,
            notes: ''
          };
        });
        setFormData(initialFormData);
      } catch (error) {
        console.error('加载数据失败:', error);
        message.error('加载数据失败');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  /**
   * 判断账户是否为理财类
   * 理财类账户需要额外显示"当日涨跌"输入框
   */
  const isFinancialAccount = (account) => {
    return account.parent_category_name?.includes('理财') ||
           account.category_name?.includes('理财');
  };

  /**
   * 按分类分组账户
   * 返回格式：{ 一级分类: { 二级分类: [账户数组] } }
   */
  const groupAccountsByCategory = () => {
    const groups = {};
    accounts.forEach(account => {
      const parentCategory = account.parent_category_name || '未分类';
      const category = account.category_name || '未分类';

      if (!groups[parentCategory]) {
        groups[parentCategory] = {};
      }
      if (!groups[parentCategory][category]) {
        groups[parentCategory][category] = [];
      }
      groups[parentCategory][category].push(account);
    });
    return groups;
  };

  /**
   * 处理表单数据变化
   * @param {number} accountId - 账户ID
   * @param {string} field - 变化的字段名（amount/daily_change/notes）
   * @param {*} value - 新值
   */
  const handleFormChange = (accountId, field, value) => {
    setFormData(prev => ({
      ...prev,
      [accountId]: {
        ...prev[accountId],
        [field]: value
      }
    }));
  };

  /**
   * 保存所有账户的录入数据
   * 将 formData 转换为记录数组后批量提交
   */
  const handleSave = async () => {
    const records = Object.entries(formData).map(([accountId, data]) => ({
      account_id: parseInt(accountId),
      record_date: selectedDate.format('YYYY-MM-DD'),
      amount: data.amount,
      daily_change: data.daily_change || 0,
      notes: data.notes
    }));

    try {
      const res = await fetch('/api/daily-records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records })
      });

      if (res.ok) {
        const result = await res.json();
        message.success(`录入成功，共保存 ${result.saved} 条记录`);
      } else {
        const error = await res.json();
        message.error('保存失败: ' + (error.error || '未知错误'));
      }
    } catch (error) {
      console.error('保存失败:', error);
      message.error('保存失败，请检查网络连接');
    }
  };

  /**
   * 提交入金/出金表单
   * 操作成功后自动刷新账户数据
   */
  const handleTransactionSubmit = async (values) => {
    try {
      const res = await fetch(`/api/accounts/${values.account_id}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transaction_date: values.transaction_date.format('YYYY-MM-DD'),
          type: values.type,
          amount: values.amount,
          notes: values.notes,
          transaction_type_id: values.transaction_type_id || null,
        })
      });

      if (res.ok) {
        message.success(`${values.type === 'deposit' ? '入金' : '出金'}成功`);
        setTransactionModalVisible(false);
        transactionForm.resetFields();
        /* 刷新账户数据以反映最新余额 */
        const accountsRes = await fetch('/api/accounts');
        const accountsData = await accountsRes.json();
        setAccounts(accountsData);
      } else {
        const error = await res.json();
        message.error('操作失败: ' + (error.error || '未知错误'));
      }
    } catch (error) {
      console.error('操作失败:', error);
      message.error('操作失败，请检查网络连接');
    }
  };

  /** 计算一级分类下的账户总数，用于面板 header 统计 */
  const getParentCategoryCount = (subCategories) => {
    return Object.values(subCategories).reduce((sum, arr) => sum + arr.length, 0);
  };

  /** 按分类分组后的账户数据 */
  const groupedAccounts = groupAccountsByCategory();

  /** 顶部操作栏：日期选择 + 入金/出金按钮 + 保存按钮 */
  const headerExtra = (
    <Space size={spacing.sm}>
      {/* 日期选择器 */}
      <DatePicker
        value={selectedDate}
        onChange={(date) => setSelectedDate(date || dayjs())}
        format="YYYY-MM-DD"
      />
      {/* 入金/出金按钮 */}
      <Button
        icon={<SwapOutlined />}
        onClick={() => setTransactionModalVisible(true)}
      >
        入金/出金
      </Button>
      {/* 保存按钮 - 带渐变背景 */}
      <Button
        type="primary"
        icon={<SaveOutlined />}
        onClick={handleSave}
        style={{
          background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryDark} 100%)`,
          border: 'none',
        }}
      >
        保存
      </Button>
    </Space>
  );

  return (
    <PageContainer title="每日录入" extra={headerExtra} loading={loading}>
      {/* 账户列表 - 按一级分类折叠展示 */}
      <Collapse
        defaultActiveKey={Object.keys(groupedAccounts)}
        style={{
          background: 'transparent',
          border: 'none',
        }}
      >
        {Object.entries(groupedAccounts).map(([parentCategory, subCategories]) => (
          <Panel
            header={
              <span style={{ fontWeight: typography.sectionTitle.fontWeight }}>
                {parentCategory}
                <span style={{
                  marginLeft: spacing.sm,
                  color: colors.text.secondary,
                  fontWeight: typography.body.fontWeight,
                  fontSize: typography.caption.fontSize,
                }}>
                  （共 {getParentCategoryCount(subCategories)} 个账户）
                </span>
              </span>
            }
            key={parentCategory}
            style={{
              marginBottom: spacing.lg,
              borderRadius: borderRadius.md,
              overflow: 'hidden',
              border: `1px solid ${colors.border.base}`,
            }}
          >
            {/* 二级分类卡片 */}
            {Object.entries(subCategories).map(([category, categoryAccounts]) => (
              <Card
                key={category}
                size="small"
                title={
                  <span style={{ ...typography.cardTitle }}>
                    {category}
                    <span style={{
                      marginLeft: spacing.sm,
                      color: colors.text.secondary,
                      fontWeight: typography.body.fontWeight,
                      fontSize: typography.caption.fontSize,
                    }}>
                      {categoryAccounts.length} 个
                    </span>
                  </span>
                }
                style={{
                  marginBottom: spacing.lg,
                  borderRadius: borderRadius.md,
                  boxShadow: shadows.card,
                }}
                type="inner"
              >
                {/* 遍历渲染每个账户的输入行 */}
                {categoryAccounts.map((account, index) => (
                  <div
                    key={account.id}
                    style={{
                      ...accountRowBaseStyle,
                      background: hoveredRow === account.id ? colors.bg.hover : 'transparent',
                      /* 最后一行不需要底部边框 */
                      borderBottom: index < categoryAccounts.length - 1
                        ? `1px solid ${colors.border.base}`
                        : 'none',
                    }}
                    onMouseEnter={() => setHoveredRow(account.id)}
                    onMouseLeave={() => setHoveredRow(null)}
                  >
                    {/* 左侧：账户名称 + 分类标签 */}
                    <div style={{ flex: 1, minWidth: 140 }}>
                      <div style={{ fontWeight: 500, color: colors.text.primary, marginBottom: spacing.xs }}>
                        {account.name}
                      </div>
                      <Tag
                        color={colors.primaryLight}
                        style={{
                          color: colors.primary,
                          border: 'none',
                          borderRadius: borderRadius.sm,
                          fontSize: typography.caption.fontSize,
                        }}
                      >
                        {account.category_name}
                      </Tag>
                    </div>

                    {/* 右侧：输入框组（金额、涨跌、备注） */}
                    <Space size={spacing.lg}>
                      {/* 金额输入 */}
                      <div>
                        <label style={labelStyle}>金额</label>
                        <InputNumber
                          value={formData[account.id]?.amount}
                          onChange={(value) => handleFormChange(account.id, 'amount', value)}
                          precision={2}
                          style={{ width: 140, borderRadius: borderRadius.sm }}
                          placeholder="请输入金额"
                        />
                      </div>

                      {/* 理财类账户显示"当日涨跌"输入，带黄色圆点装饰以视觉区分 */}
                      {isFinancialAccount(account) && (
                        <div>
                          <label style={labelStyle}>
                            <span style={{
                              display: 'inline-block',
                              width: 6,
                              height: 6,
                              borderRadius: borderRadius.round,
                              background: colors.warning,
                              marginRight: spacing.xs,
                              verticalAlign: 'middle',
                            }} />
                            当日涨跌
                          </label>
                          <InputNumber
                            value={formData[account.id]?.daily_change}
                            onChange={(value) => handleFormChange(account.id, 'daily_change', value)}
                            precision={2}
                            style={{ width: 120, borderRadius: borderRadius.sm }}
                            placeholder="当日涨跌"
                          />
                        </div>
                      )}

                      {/* 备注输入 */}
                      <div>
                        <label style={labelStyle}>备注</label>
                        <Input
                          value={formData[account.id]?.notes}
                          onChange={(e) => handleFormChange(account.id, 'notes', e.target.value)}
                          style={{ width: 150, borderRadius: borderRadius.sm }}
                          placeholder="可选"
                        />
                      </div>
                    </Space>
                  </div>
                ))}
              </Card>
            ))}
          </Panel>
        ))}
      </Collapse>

      {/* 入金/出金弹窗 */}
      <Modal
        title={
          <Space>
            <SwapOutlined style={{ color: colors.primary }} />
            <span>入金/出金</span>
          </Space>
        }
        open={transactionModalVisible}
        onCancel={() => setTransactionModalVisible(false)}
        footer={null}
        styles={{
          body: { padding: `${spacing.xl}px` },
        }}
      >
        <Form
          form={transactionForm}
          layout="vertical"
          onFinish={handleTransactionSubmit}
          style={{ marginTop: spacing.lg }}
        >
          {/* 选择账户 */}
          <Form.Item
            name="account_id"
            label="选择账户"
            rules={[{ required: true, message: '请选择账户' }]}
          >
            <Select placeholder="请选择账户">
              {accounts.map(account => (
                <Select.Option key={account.id} value={account.id}>
                  {account.name} ({account.category_name})
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          {/* 操作类型：入金或出金 */}
          <Form.Item
            name="type"
            label="操作类型"
            rules={[{ required: true, message: '请选择操作类型' }]}
          >
            <Radio.Group
              optionType="button"
              buttonStyle="solid"
              onChange={() => transactionForm.setFieldValue('transaction_type_id', undefined)}
              options={[
                { label: '入金', value: 'deposit' },
                { label: '出金', value: 'withdraw' },
              ]}
            />
          </Form.Item>

          {/* 交易分类选择 */}
          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.type !== cur.type}>
            {() => {
              const currentType = transactionForm.getFieldValue('type');
              return (
                <Form.Item name="transaction_type_id" label="交易分类">
                  <Select placeholder="请选择分类（可选）" allowClear>
                    {transactionTypes
                      .filter(t => {
                        if (currentType === 'deposit') return t.type === 'income';
                        if (currentType === 'withdraw') return t.type === 'expense';
                        return true;
                      })
                      .map(t => (
                        <Select.Option key={t.id} value={t.id}>{t.name}</Select.Option>
                      ))}
                  </Select>
                </Form.Item>
              );
            }}
          </Form.Item>

          {/* 金额 */}
          <Form.Item
            name="amount"
            label="金额"
            rules={[{ required: true, message: '请输入金额' }]}
          >
            <InputNumber
              precision={2}
              style={{ width: '100%', borderRadius: borderRadius.sm }}
              placeholder="请输入金额"
            />
          </Form.Item>

          {/* 日期 */}
          <Form.Item
            name="transaction_date"
            label="日期"
            rules={[{ required: true, message: '请选择日期' }]}
            initialValue={dayjs()}
          >
            <DatePicker
              style={{ width: '100%' }}
              format="YYYY-MM-DD"
            />
          </Form.Item>

          {/* 备注 */}
          <Form.Item name="notes" label="备注">
            <Input placeholder="可选" style={{ borderRadius: borderRadius.sm }} />
          </Form.Item>

          {/* 底部操作按钮 - 右对齐 */}
          <Form.Item style={{ marginBottom: 0 }}>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={() => setTransactionModalVisible(false)}>
                取消
              </Button>
              <Button type="primary" htmlType="submit">
                提交
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </PageContainer>
  );
}
