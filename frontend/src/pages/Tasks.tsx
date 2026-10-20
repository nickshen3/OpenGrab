import { Button, Empty, Progress, Table, Tag, Typography, Popconfirm, Badge } from 'antd';
import { useTasks, cancelTask, removeTask, clearFinished, Task } from '../tasks';
import { api } from '../api';

const statusText: Record<string, { text: string; color: string }> = {
  queued: { text: '排队中', color: 'default' },
  downloading: { text: '下载中', color: 'processing' },
  processing: { text: '处理中', color: 'processing' },
  finished: { text: '已完成', color: 'success' },
  error: { text: '失败', color: 'error' },
  canceled: { text: '已取消', color: 'warning' },
};

function reveal(t: Task) {
  if (t.filepath) {
    api.RevealFile(t.filepath);
  } else if (t.filename && t.dir) {
    const sep = t.dir.endsWith('\\') ? '' : '\\';
    api.RevealFile(t.dir + sep + t.filename);
  } else if (t.dir) {
    api.OpenFolder(t.dir);
  }
}

export default function Tasks() {
  const tasks = useTasks();

  if (tasks.length === 0) {
    return <Empty description="暂无任务" style={{ marginTop: 80 }} />;
  }

  return (
    <div className="page">
      <div style={{ marginBottom: 12 }}>
        <Popconfirm title="清除所有已完成/失败任务？" onConfirm={clearFinished}>
          <Button>清除已结束任务</Button>
        </Popconfirm>
      </div>
      <Table<Task>
        rowKey="id"
        dataSource={tasks}
        pagination={false}
        columns={[
          {
            title: '#',
            width: 48,
            render: (_, __, i) => (
              <Badge count={tasks.length - i} style={{ backgroundColor: '#4f46e5' }} />
            ),
          },
          {
            title: '任务',
            dataIndex: 'title',
            render: (_, t) => (
              <div style={{ minWidth: 220 }}>
                <Typography.Text ellipsis style={{ maxWidth: 320, display: 'block' }}>
                  {t.title}
                </Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 12 }} ellipsis>
                  {t.status === 'finished' ? (t.filepath || t.filename || t.url) : t.url}
                </Typography.Text>
              </div>
            ),
          },
          {
            title: '状态',
            dataIndex: 'status',
            width: 110,
            render: (s: string, t) => {
              const st = statusText[s] || { text: s, color: 'default' };
              return (
                <div>
                  <Tag color={st.color}>{st.text}</Tag>
                  {t.error && (
                    <Typography.Text type="danger" style={{ fontSize: 12, display: 'block' }}>
                      {t.error}
                    </Typography.Text>
                  )}
                </div>
              );
            },
          },
          {
            title: '进度',
            dataIndex: 'percent',
            width: 260,
            render: (_, t) => (
              <div>
                <Progress
                  percent={Math.round(t.percent)}
                  size="small"
                  status={
                    t.status === 'error' ? 'exception' : t.status === 'finished' ? 'success' : 'active'
                  }
                />
                {(t.status === 'downloading' || t.status === 'processing') && (
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {t.downloadedMb > 0 && `${t.downloadedMb.toFixed(1)}/${t.totalMb.toFixed(1)} MB · `}
                    {t.speed} {t.eta && `· ETA ${t.eta}`}
                  </Typography.Text>
                )}
              </div>
            ),
          },
          {
            title: '操作',
            width: 200,
            render: (_, t) => (
              <span>
                {(t.status === 'downloading' || t.status === 'processing' || t.status === 'queued') && (
                  <Button size="small" danger onClick={() => cancelTask(t.id)}>
                    取消
                  </Button>
                )}{' '}
                {t.status === 'finished' && (t.dir || t.filepath) && (
                  <Button size="small" onClick={() => reveal(t)}>
                    查看
                  </Button>
                )}{' '}
                <Button size="small" onClick={() => removeTask(t.id)}>
                  移除
                </Button>
              </span>
            ),
          },
        ]}
      />
    </div>
  );
}
