/**
 * 分类字典管理页面 - DictCategories
 *
 * 页面职责：
 * 1. 维护资产分类树（一级/二级分类）
 * 2. 维护交易分类字典（收入/支出）
 *
 * 说明：本次重构聚焦前端视觉和交互层，不改变已有后端接口与业务行为。
 */
import { useEffect, useMemo, useState } from 'react';
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
  Tooltip,
  Row,
  Col,
  Tag,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ApartmentOutlined,
  NodeIndexOutlined,
  TagsOutlined,
} from '@ant-design/icons';
import PageContainer from '../components/PageContainer';
import { colors, spacing, shadows, typography, transitions, borderRadius } from '../theme';

const rowBaseStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  width: '100%',
  minHeight: 46,
  padding: `${spacing.xs}px ${spacing.sm}px`,
  borderRadius: borderRadius.sm,
  border: '1px solid transparent',
  transition: transitions.fast,
};

const actionGroupStyle = {
  opacity: 0,
  transform: 'translateX(6px)',
  transition: transitions.fast,
  marginLeft: spacing.xl,
  flexShrink: 0,
};

const actionGroupVisibleStyle = {
  ...actionGroupStyle,
  opacity: 1,
  transform: 'translateX(0)',
};

export default function DictCategories() {
  const [treeData, setTreeData] = useState([]);
  const [categorySource, setCategorySource] = useState([]);
  const [loading, setLoading] = useState(false);

  const [modalVisible, setModalVisible] = useState(false);
  const [modalType, setModalType] = useState('add');
  const [currentNode, setCurrentNode] = useState(null);
  const [form] = Form.useForm();
  const [hoveredNodeKey, setHoveredNodeKey] = useState(null);

  const [transactionTypes, setTransactionTypes] = useState([]);
  const [txTypeLoading, setTxTypeLoading] = useState(false);
  const [txTypeModalVisible, setTxTypeModalVisible] = useState(false);
  const [txTypeModalMode, setTxTypeModalMode] = useState('add');
  const [editingTxType, setEditingTxType] = useState(null);
  const [txTypeForm] = Form.useForm();
  const [hoveredTxTypeId, setHoveredTxTypeId] = useState(null);

  const categoryStats = useMemo(() => {
    const rootCount = categorySource.length;
    const subCount = categorySource.reduce((sum, node) => sum + (node.children?.length || 0), 0);
    return {
      rootCount,
      subCount,
      txCount: transactionTypes.length,
    };
  }, [categorySource, transactionTypes]);

  const loadTreeData = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/dict-categories/tree');
      if (!res.ok) {
        throw new Error('分类树接口返回异常');
      }
      const data = await res.json();
      const normalized = Array.isArray(data) ? data : [];
      setCategorySource(normalized);

      const convertTree = (nodes) => nodes.map((node) => ({
        key: String(node.id),
        id: node.id,
        name: node.name,
        parent_id: node.parent_id,
        sort_order: node.sort_order,
        children: node.children ? convertTree(node.children) : undefined,
      }));

      setTreeData(convertTree(normalized));
    } catch (error) {
      console.error('加载分类树失败:', error);
      message.error('加载分类树失败');
    } finally {
      setLoading(false);
    }
  };

  const loadTransactionTypes = async () => {
    try {
      setTxTypeLoading(true);
      const res = await fetch('/api/transaction-types');
      if (!res.ok) {
        throw new Error('交易分类接口返回异常');
      }
      const data = await res.json();
      setTransactionTypes(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('加载交易分类失败:', error);
      message.error('加载交易分类失败');
    } finally {
      setTxTypeLoading(false);
    }
  };

  useEffect(() => {
    loadTreeData();
    loadTransactionTypes();
  }, []);

  const handleAddRoot = () => {
    setModalType('add');
    setCurrentNode(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleAddChild = (node) => {
    setModalType('addChild');
    setCurrentNode(node);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (node) => {
    setModalType('edit');
    setCurrentNode(node);
    form.setFieldsValue({
      name: node.name,
      sort_order: node.sort_order,
    });
    setModalVisible(true);
  };

  const handleDelete = async (id) => {
    try {
      const res = await fetch(`/api/dict-categories/${id}`, {
        method: 'DELETE',
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

  const handleSubmit = async (values) => {
    try {
      let res;

      if (modalType === 'edit') {
        res = await fetch(`/api/dict-categories/${currentNode.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: values.name,
            sort_order: values.sort_order,
          }),
        });
      } else {
        res = await fetch('/api/dict-categories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: values.name,
            parent_id: modalType === 'addChild' ? currentNode.id : null,
            sort_order: values.sort_order,
          }),
        });
      }

      if (res.ok) {
        message.success(
          modalType === 'edit' ? '修改成功' : modalType === 'addChild' ? '添加子分类成功' : '添加成功',
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

  const handleAddTxType = () => {
    setTxTypeModalMode('add');
    setEditingTxType(null);
    txTypeForm.resetFields();
    setTxTypeModalVisible(true);
  };

  const handleEditTxType = (item) => {
    setTxTypeModalMode('edit');
    setEditingTxType(item);
    txTypeForm.setFieldsValue({ name: item.name, type: item.type });
    setTxTypeModalVisible(true);
  };

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

  const renderTreeNode = (node) => {
    const isRoot = !node.parent_id;
    const nodeKey = String(node.id);

    return (
      <div
        style={{
          ...rowBaseStyle,
          background: hoveredNodeKey === nodeKey ? colors.bg.hover : 'transparent',
          borderColor: hoveredNodeKey === nodeKey ? 'rgba(79, 110, 247, 0.2)' : 'transparent',
        }}
        onMouseEnter={() => setHoveredNodeKey(nodeKey)}
        onMouseLeave={() => setHoveredNodeKey(null)}
      >
        <Space size={spacing.sm} align="center">
          <Tag
            color={isRoot ? 'blue' : 'default'}
            style={{ borderRadius: 999, marginInlineEnd: 0 }}
          >
            {isRoot ? '一级' : '二级'}
          </Tag>
          <span style={{ ...typography.body, color: colors.text.primary }}>{node.name}</span>
        </Space>

        <Space size={spacing.xs} style={hoveredNodeKey === nodeKey ? actionGroupVisibleStyle : actionGroupStyle}>
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

  const renderTxTypeItem = (item) => (
    <div
      key={item.id}
      className="dict-tx-item"
      style={{
        ...rowBaseStyle,
        background: hoveredTxTypeId === item.id ? colors.bg.hover : 'transparent',
        borderColor: hoveredTxTypeId === item.id ? 'rgba(79, 110, 247, 0.2)' : 'transparent',
      }}
      onMouseEnter={() => setHoveredTxTypeId(item.id)}
      onMouseLeave={() => setHoveredTxTypeId(null)}
    >
      <span style={{ ...typography.body, color: colors.text.primary, fontWeight: 500 }}>{item.name}</span>
      <Space size={spacing.xs} style={hoveredTxTypeId === item.id ? actionGroupVisibleStyle : actionGroupStyle}>
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

  const incomeTypes = transactionTypes.filter((t) => t.type === 'income');
  const expenseTypes = transactionTypes.filter((t) => t.type === 'expense');

  return (
    <PageContainer
      title="字典管理中心"
      extra={
        <Space>
          <Button icon={<PlusOutlined />} onClick={handleAddTxType}>
            新增交易分类
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAddRoot}>
            新增一级分类
          </Button>
        </Space>
      }
      loading={loading}
    >
      <div className="dict-hero card-fade-in" style={{ marginBottom: spacing.xl }}>
        <div>
          <div className="dict-hero-title">资产与交易分类配置台</div>
          <div className="dict-hero-subtitle">统一维护分类口径，确保录入、统计与报表在多用户下保持一致。</div>
        </div>
        <div className="dict-hero-stats">
          <div className="dict-stat-chip">
            <ApartmentOutlined />
            <span>一级 {categoryStats.rootCount}</span>
          </div>
          <div className="dict-stat-chip">
            <NodeIndexOutlined />
            <span>二级 {categoryStats.subCount}</span>
          </div>
          <div className="dict-stat-chip">
            <TagsOutlined />
            <span>交易 {categoryStats.txCount}</span>
          </div>
        </div>
      </div>

      <Row gutter={[spacing.lg, spacing.lg]}>
        <Col xs={24} lg={14}>
          <Card
            className="dict-panel-card"
            title={<span style={{ ...typography.sectionTitle }}>资产分类树</span>}
            extra={
              <Button type="default" size="small" icon={<PlusOutlined />} onClick={handleAddRoot}>
                一级分类
              </Button>
            }
            style={{ borderRadius: borderRadius.md, boxShadow: shadows.card }}
            styles={{ body: { padding: spacing.lg } }}
          >
            <Tree
              treeData={treeData}
              titleRender={renderTreeNode}
              defaultExpandAll
              showLine={{ showLeafIcon: false }}
              showIcon={false}
              style={{ '--ant-tree-line-color': colors.border.base }}
            />
          </Card>
        </Col>

        <Col xs={24} lg={10}>
          <Card
            className="dict-panel-card"
            title={<span style={{ ...typography.sectionTitle }}>交易分类字典</span>}
            loading={txTypeLoading}
            extra={
              <Button type="default" size="small" icon={<PlusOutlined />} onClick={handleAddTxType}>
                新增
              </Button>
            }
            style={{ borderRadius: borderRadius.md, boxShadow: shadows.card }}
            styles={{ body: { padding: spacing.lg } }}
          >
            <Tabs
              defaultActiveKey="income"
              items={[
                {
                  key: 'income',
                  label: '收入类',
                  children: incomeTypes.length > 0
                    ? incomeTypes.map(renderTxTypeItem)
                    : <div className="dict-empty-tip">暂无收入类分类</div>,
                },
                {
                  key: 'expense',
                  label: '支出类',
                  children: expenseTypes.length > 0
                    ? expenseTypes.map(renderTxTypeItem)
                    : <div className="dict-empty-tip">暂无支出类分类</div>,
                },
              ]}
            />
          </Card>
        </Col>
      </Row>

      <Modal
        title={getModalTitle()}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
        styles={{ body: { padding: `${spacing.xl}px` } }}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit} style={{ marginTop: spacing.lg }}>
          <Form.Item name="name" label="分类名称" rules={[{ required: true, message: '请输入分类名称' }]}>
            <Input placeholder="请输入分类名称" style={{ borderRadius: borderRadius.sm }} />
          </Form.Item>

          <Form.Item name="sort_order" label="排序">
            <InputNumber
              style={{ width: '100%', borderRadius: borderRadius.sm }}
              placeholder="可选，数字越小排序越靠前"
              min={0}
            />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0 }}>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={() => setModalVisible(false)}>取消</Button>
              <Button type="primary" htmlType="submit">确认</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={txTypeModalMode === 'edit' ? '编辑交易分类' : '新增交易分类'}
        open={txTypeModalVisible}
        onCancel={() => setTxTypeModalVisible(false)}
        footer={null}
        styles={{ body: { padding: `${spacing.xl}px` } }}
      >
        <Form form={txTypeForm} layout="vertical" onFinish={handleTxTypeSubmit} style={{ marginTop: spacing.lg }}>
          <Form.Item name="name" label="分类名称" rules={[{ required: true, message: '请输入分类名称' }]}>
            <Input placeholder="请输入分类名称" style={{ borderRadius: borderRadius.sm }} />
          </Form.Item>

          {txTypeModalMode === 'add' && (
            <Form.Item name="type" label="类型" rules={[{ required: true, message: '请选择分类类型' }]}>
              <Select
                placeholder="请选择分类类型"
                options={[
                  { value: 'income', label: '收入类' },
                  { value: 'expense', label: '支出类' },
                ]}
              />
            </Form.Item>
          )}

          <Form.Item style={{ marginBottom: 0 }}>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={() => setTxTypeModalVisible(false)}>取消</Button>
              <Button type="primary" htmlType="submit">确认</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </PageContainer>
  );
}
