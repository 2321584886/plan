/**
 * 分类字典管理页面 - DictCategories
 *
 * 以树形结构展示和管理分类字典（一级分类 → 子分类）。
 * 支持新增一级分类、添加子分类、编辑和删除操作。
 * 操作按钮在 hover 节点行时淡入显示，保持界面简洁。
 */
import { useState, useEffect } from 'react';
import {
  Card,
  Tree,
  Button,
  message,
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Tabs,
  Popconfirm,
  Tooltip
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import PageContainer from '../components/PageContainer';
import { colors, spacing, shadows, typography, transitions, borderRadius } from '../theme';

/** 树节点行样式 - 正常状态（透明背景） */
const treeNodeRowStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  width: '100%',
  minHeight: 44,
  padding: `0 ${spacing.sm}px`,
  borderRadius: borderRadius.sm,
  transition: transitions.base,
};

/** 操作按钮组样式 - 默认隐藏，hover 时显示 */
const actionGroupStyle = {
  opacity: 0,
  transition: transitions.fast,
  marginLeft: spacing.xl,
  flexShrink: 0,
};

/** 操作按钮组 hover 时显示的样式 */
const actionGroupVisibleStyle = {
  ...actionGroupStyle,
  opacity: 1,
};

export default function DictCategories() {
  /** 树形数据（已适配 Tree 组件格式） */
  const [treeData, setTreeData] = useState([]);
  /** 数据加载状态 */
  const [loading, setLoading] = useState(false);
  /** 弹窗是否可见 */
  const [modalVisible, setModalVisible] = useState(false);
  /** 弹窗类型：'add' 新增一级 / 'edit' 编辑 / 'addChild' 添加子分类 */
  const [modalType, setModalType] = useState('add');
  /** 当前操作的节点数据 */
  const [currentNode, setCurrentNode] = useState(null);
  /** 表单实例 */
  const [form] = Form.useForm();
  /** 当前 hover 的节点 key，用于控制操作按钮显示 */
  const [hoveredNodeKey, setHoveredNodeKey] = useState(null);

  /* ========== 交易分类管理 状态 ========== */
  /** 交易分类列表 */
  const [transactionTypes, setTransactionTypes] = useState([]);
  /** 交易分类加载状态 */
  const [txTypeLoading, setTxTypeLoading] = useState(false);
  /** 交易分类弹窗是否可见 */
  const [txTypeModalVisible, setTxTypeModalVisible] = useState(false);
  /** 交易分类弹窗模式：'add' 新增 / 'edit' 编辑 */
  const [txTypeModalMode, setTxTypeModalMode] = useState('add');
  /** 当前编辑的交易分类 */
  const [editingTxType, setEditingTxType] = useState(null);
  /** 交易分类表单实例 */
  const [txTypeForm] = Form.useForm();
  /** 当前 hover 的交易分类项 ID */
  const [hoveredTxTypeId, setHoveredTxTypeId] = useState(null);

  /**
   * 加载分类树数据
   * 从 API 获取后转换为 Tree 组件所需的 treeData 格式
   */
  const loadTreeData = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/dict-categories/tree');
      const data = await res.json();

      /**
       * 递归转换数据结构，将后端返回的嵌套对象转为 Tree 组件的 treeData 格式
       * 每个节点的 title 使用 renderTreeNode 自定义渲染
       */
      const convertTree = (nodes) => {
        return nodes.map(node => ({
          key: String(node.id),
          title: renderTreeNode(node),
          children: node.children ? convertTree(node.children) : undefined
        }));
      };
      setTreeData(convertTree(data));
    } catch (error) {
      console.error('加载分类树失败:', error);
      message.error('加载分类树失败');
    } finally {
      setLoading(false);
    }
  };

  /**
   * 加载交易分类数据
   */
  const loadTransactionTypes = async () => {
    try {
      setTxTypeLoading(true);
      const res = await fetch('/api/transaction-types');
      const data = await res.json();
      setTransactionTypes(data);
    } catch (error) {
      console.error('加载交易分类失败:', error);
      message.error('加载交易分类失败');
    } finally {
      setTxTypeLoading(false);
    }
  };

  /** 组件挂载时并行加载分类树和交易分类 */
  useEffect(() => {
    loadTreeData();
    loadTransactionTypes();
  }, []);

  /**
   * 渲染单个树节点
   * 包含节点名称和操作按钮组（添加子分类、编辑、删除）
   * 操作按钮通过 CSS opacity 实现 hover 淡入效果
   *
   * @param {Object} node - 节点原始数据
   */
  const renderTreeNode = (node) => {
    const isRoot = !node.parent_id;
    const nodeKey = String(node.id);

    return (
      <div
        style={{
          ...treeNodeRowStyle,
          background: hoveredNodeKey === nodeKey ? colors.bg.hover : 'transparent',
        }}
        onMouseEnter={() => setHoveredNodeKey(nodeKey)}
        onMouseLeave={() => setHoveredNodeKey(null)}
      >
        {/* 节点名称 */}
        <span style={{
          ...typography.body,
          color: colors.text.primary,
        }}>
          {node.name}
        </span>

        {/* 操作按钮组 - hover 时淡入显示，均为图标按钮 + Tooltip */}
        <Space
          size={spacing.xs}
          style={hoveredNodeKey === nodeKey ? actionGroupVisibleStyle : actionGroupStyle}
        >
          {/* 一级分类节点才显示"添加子分类"按钮 */}
          {isRoot && (
            <Tooltip title="添加子分类">
              <Button
                type="text"
                size="small"
                icon={<PlusOutlined style={{ color: colors.primary }} />}
                onClick={(e) => {
                  e.stopPropagation();
                  handleAddChild(node);
                }}
              />
            </Tooltip>
          )}

          {/* 编辑按钮 */}
          <Tooltip title="编辑">
            <Button
              type="text"
              size="small"
              icon={<EditOutlined style={{ color: colors.primary }} />}
              onClick={(e) => {
                e.stopPropagation();
                handleEdit(node);
              }}
            />
          </Tooltip>

          {/* 删除按钮 - 带二次确认 */}
          <Popconfirm
            title="确认删除"
            description={`确定要删除分类 "${node.name}" 吗？`}
            onConfirm={(e) => {
              e.stopPropagation();
              handleDelete(node.id);
            }}
            okText="确认"
            cancelText="取消"
          >
            <Tooltip title="删除">
              <Button
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={(e) => e.stopPropagation()}
              />
            </Tooltip>
          </Popconfirm>
        </Space>
      </div>
    );
  };

  /**
   * 打开新增一级分类弹窗
   * 清空表单并设置弹窗类型为 'add'
   */
  const handleAddRoot = () => {
    setModalType('add');
    setCurrentNode(null);
    form.resetFields();
    setModalVisible(true);
  };

  /**
   * 打开添加子分类弹窗
   * @param {Object} node - 父节点数据
   */
  const handleAddChild = (node) => {
    setModalType('addChild');
    setCurrentNode(node);
    form.resetFields();
    setModalVisible(true);
  };

  /**
   * 打开编辑分类弹窗，并回填当前节点数据
   * @param {Object} node - 待编辑节点数据
   */
  const handleEdit = (node) => {
    setModalType('edit');
    setCurrentNode(node);
    form.setFieldsValue({
      name: node.name,
      sort_order: node.sort_order
    });
    setModalVisible(true);
  };

  /**
   * 删除指定分类
   * 如果分类被引用（409 状态码），提示无法删除
   * @param {number} id - 分类 ID
   */
  const handleDelete = async (id) => {
    try {
      const res = await fetch(`/api/dict-categories/${id}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        message.success('删除成功');
        loadTreeData();
      } else if (res.status === 409) {
        const error = await res.json();
        message.error(error.error || '该分类已被引用，无法删除');
      } else {
        const error = await res.json();
        message.error('删除失败: ' + (error.error || '未知错误'));
      }
    } catch (error) {
      console.error('删除失败:', error);
      message.error('删除失败，请检查网络连接');
    }
  };

  /**
   * 提交新增/编辑表单
   * 根据 modalType 决定调用新增还是编辑 API
   */
  const handleSubmit = async (values) => {
    try {
      let res;

      if (modalType === 'edit') {
        /* 编辑已有分类 */
        res = await fetch(`/api/dict-categories/${currentNode.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: values.name,
            sort_order: values.sort_order
          })
        });
      } else {
        /* 新增一级分类或子分类 */
        res = await fetch('/api/dict-categories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: values.name,
            parent_id: modalType === 'addChild' ? currentNode.id : null,
            sort_order: values.sort_order
          })
        });
      }

      if (res.ok) {
        message.success(
          modalType === 'edit' ? '修改成功' :
          modalType === 'addChild' ? '添加子分类成功' : '添加成功'
        );
        setModalVisible(false);
        form.resetFields();
        loadTreeData();
      } else {
        const error = await res.json();
        message.error('操作失败: ' + (error.error || '未知错误'));
      }
    } catch (error) {
      console.error('操作失败:', error);
      message.error('操作失败，请检查网络连接');
    }
  };

  /**
   * 根据弹窗类型返回对应的标题文字
   */
  const getModalTitle = () => {
    switch (modalType) {
      case 'edit':
        return '编辑分类';
      case 'addChild':
        return `添加子分类 - ${currentNode?.name}`;
      default:
        return '新增一级分类';
    }
  };

  /* ========== 交易分类 CRUD 操作 ========== */

  /** 打开新增交易分类弹窗 */
  const handleAddTxType = () => {
    setTxTypeModalMode('add');
    setEditingTxType(null);
    txTypeForm.resetFields();
    setTxTypeModalVisible(true);
  };

  /**
   * 打开编辑交易分类弹窗
   * @param {Object} item - 待编辑的交易分类
   */
  const handleEditTxType = (item) => {
    setTxTypeModalMode('edit');
    setEditingTxType(item);
    txTypeForm.setFieldsValue({ name: item.name, type: item.type });
    setTxTypeModalVisible(true);
  };

  /**
   * 删除交易分类
   * @param {number} id - 交易分类 ID
   */
  const handleDeleteTxType = async (id) => {
    try {
      const res = await fetch(`/api/transaction-types/${id}`, { method: 'DELETE' });
      if (res.ok) {
        message.success('删除成功');
        loadTransactionTypes();
      } else if (res.status === 409) {
        const error = await res.json();
        message.error(error.error || '该分类已被引用，无法删除');
      } else {
        const error = await res.json();
        message.error('删除失败: ' + (error.error || '未知错误'));
      }
    } catch (error) {
      console.error('删除交易分类失败:', error);
      message.error('删除失败，请检查网络连接');
    }
  };

  /**
   * 提交交易分类新增/编辑表单
   */
  const handleTxTypeSubmit = async (values) => {
    try {
      let res;
      if (txTypeModalMode === 'edit') {
        res = await fetch(`/api/transaction-types/${editingTxType.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: values.name }),
        });
      } else {
        res = await fetch('/api/transaction-types', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: values.name, type: values.type }),
        });
      }

      if (res.ok) {
        message.success(txTypeModalMode === 'edit' ? '修改成功' : '添加成功');
        setTxTypeModalVisible(false);
        txTypeForm.resetFields();
        loadTransactionTypes();
      } else {
        const error = await res.json();
        message.error('操作失败: ' + (error.error || '未知错误'));
      }
    } catch (error) {
      console.error('操作交易分类失败:', error);
      message.error('操作失败，请检查网络连接');
    }
  };

  /**
   * 渲染交易分类列表项
   * @param {Object} item - 交易分类数据
   */
  const renderTxTypeItem = (item) => (
    <div
      key={item.id}
      style={{
        ...treeNodeRowStyle,
        background: hoveredTxTypeId === item.id ? colors.bg.hover : 'transparent',
      }}
      onMouseEnter={() => setHoveredTxTypeId(item.id)}
      onMouseLeave={() => setHoveredTxTypeId(null)}
    >
      <span style={{ ...typography.body, color: colors.text.primary }}>
        {item.name}
      </span>
      <Space
        size={spacing.xs}
        style={hoveredTxTypeId === item.id ? actionGroupVisibleStyle : actionGroupStyle}
      >
        <Tooltip title="编辑">
          <Button
            type="text"
            size="small"
            icon={<EditOutlined style={{ color: colors.primary }} />}
            onClick={() => handleEditTxType(item)}
          />
        </Tooltip>
        <Popconfirm
          title="确认删除"
          description={`确定要删除交易分类 "${item.name}" 吗？`}
          onConfirm={() => handleDeleteTxType(item.id)}
          okText="确认"
          cancelText="取消"
        >
          <Tooltip title="删除">
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Tooltip>
        </Popconfirm>
      </Space>
    </div>
  );

  /** 按类型筛选交易分类 */
  const incomeTypes = transactionTypes.filter(t => t.type === 'income');
  const expenseTypes = transactionTypes.filter(t => t.type === 'expense');

  return (
    <PageContainer
      title="分类字典管理"
      extra={
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={handleAddRoot}
        >
          新增一级分类
        </Button>
      }
      loading={loading}
    >
      {/* 分类树卡片容器 */}
      <Card
        style={{
          borderRadius: borderRadius.md,
          boxShadow: shadows.card,
          padding: spacing.lg,
        }}
        styles={{
          body: { padding: spacing.lg },
        }}
      >
        <Tree
          treeData={treeData}
          defaultExpandAll
          showLine={{ showLeafIcon: false }}
          showIcon={false}
          style={{
            /* 自定义树连线颜色为浅灰 */
            '--ant-tree-line-color': colors.border.base,
          }}
        />
      </Card>

      {/* 交易分类管理卡片 */}
      <Card
        title="交易分类管理"
        loading={txTypeLoading}
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleAddTxType}
          >
            新增分类
          </Button>
        }
        style={{
          borderRadius: borderRadius.md,
          boxShadow: shadows.card,
          marginTop: spacing.xl,
        }}
        styles={{
          body: { padding: spacing.lg },
        }}
      >
        <Tabs
          defaultActiveKey="income"
          items={[
            {
              key: 'income',
              label: '收入类',
              children: incomeTypes.length > 0
                ? incomeTypes.map(renderTxTypeItem)
                : <div style={{ ...typography.caption, color: colors.text.disabled, textAlign: 'center', padding: spacing.xl }}>暂无收入类分类</div>,
            },
            {
              key: 'expense',
              label: '支出类',
              children: expenseTypes.length > 0
                ? expenseTypes.map(renderTxTypeItem)
                : <div style={{ ...typography.caption, color: colors.text.disabled, textAlign: 'center', padding: spacing.xl }}>暂无支出类分类</div>,
            },
          ]}
        />
      </Card>

      {/* 新增/编辑分类弹窗 */}
      <Modal
        title={getModalTitle()}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
        styles={{
          body: { padding: `${spacing.xl}px` },
        }}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          style={{ marginTop: spacing.lg }}
        >
          {/* 分类名称 */}
          <Form.Item
            name="name"
            label="分类名称"
            rules={[{ required: true, message: '请输入分类名称' }]}
          >
            <Input
              placeholder="请输入分类名称"
              style={{ borderRadius: borderRadius.sm }}
            />
          </Form.Item>

          {/* 排序序号 */}
          <Form.Item
            name="sort_order"
            label="排序"
          >
            <InputNumber
              style={{ width: '100%', borderRadius: borderRadius.sm }}
              placeholder="可选，数字越小排序越靠前"
              min={0}
            />
          </Form.Item>

          {/* 底部操作按钮 - 右对齐 */}
          <Form.Item style={{ marginBottom: 0 }}>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={() => setModalVisible(false)}>
                取消
              </Button>
              <Button type="primary" htmlType="submit">
                确认
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
      {/* 新增/编辑交易分类弹窗 */}
      <Modal
        title={txTypeModalMode === 'edit' ? '编辑交易分类' : '新增交易分类'}
        open={txTypeModalVisible}
        onCancel={() => setTxTypeModalVisible(false)}
        footer={null}
        styles={{
          body: { padding: `${spacing.xl}px` },
        }}
      >
        <Form
          form={txTypeForm}
          layout="vertical"
          onFinish={handleTxTypeSubmit}
          style={{ marginTop: spacing.lg }}
        >
          {/* 分类名称 */}
          <Form.Item
            name="name"
            label="分类名称"
            rules={[{ required: true, message: '请输入分类名称' }]}
          >
            <Input
              placeholder="请输入分类名称"
              style={{ borderRadius: borderRadius.sm }}
            />
          </Form.Item>

          {/* 类型选择 - 仅新增时显示 */}
          {txTypeModalMode === 'add' && (
            <Form.Item
              name="type"
              label="类型"
              rules={[{ required: true, message: '请选择分类类型' }]}
            >
              <Select
                placeholder="请选择分类类型"
                options={[
                  { value: 'income', label: '收入类' },
                  { value: 'expense', label: '支出类' },
                ]}
              />
            </Form.Item>
          )}

          {/* 底部操作按钮 - 右对齐 */}
          <Form.Item style={{ marginBottom: 0 }}>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={() => setTxTypeModalVisible(false)}>
                取消
              </Button>
              <Button type="primary" htmlType="submit">
                确认
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </PageContainer>
  );
}
