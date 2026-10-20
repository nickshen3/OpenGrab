import { batchStore } from './state';
import { api, Meta, fmtDuration } from '../api';
import { addTask, startTask, useTasks, taskStatus } from '../tasks';
import { bestFormats } from '../formats';
import { Input, Button, Card, message, List, Typography, Tag, Select } from 'antd';
import { AppstoreOutlined } from '@ant-design/icons';

export default function Batch() {
  const [st, setBatch] = batchStore.use();
  const tasks = useTasks();
  const { text, loading, metas, fails, rowFormats, parseId } = st;

  async function parseAll() {
    if (!text.trim() || loading) return;
    const pid = `b${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    setBatch({ loading: true, parseId: pid, metas: [], fails: [] });
    try {
      const { metas: m, fails: f } = await api.ParseBatch(pid, text);
      setBatch({ metas: m || [], fails: f || [], loading: false });
      message.info(`解析完成：成功 ${(m || []).length} 个，失败 ${(f || []).length} 个`);
    } catch (e: any) {
      setBatch({ loading: false });
      message.error(String(e));
    }
  }

  function cancelParse() {
    api.CancelParse(parseId);
    setBatch({ loading: false });
    message.info('已取消解析');
  }

  function rowFormat(m: Meta): string {
    return rowFormats[m.id || m.webpageUrl] || 'bv*+ba/b';
  }

  function setRowFormat(m: Meta, v: string) {
    setBatch({ rowFormats: { ...rowFormats, [m.id || m.webpageUrl]: v } });
  }

  function downloadAll() {
    const dir = localStorage.getItem('opengrab.dir') || '';
    metas.forEach((m) => {
      const id = addTask({ url: m.webpageUrl, title: m.title, thumbnail: m.thumbnail }, dir);
      startTask(id, rowFormat(m), dir);
    });
    message.success(`已加入 ${metas.length} 个任务`);
  }

  function downloadOne(m: Meta) {
    const dir = localStorage.getItem('opengrab.dir') || '';
    const id = addTask({ url: m.webpageUrl, title: m.title, thumbnail: m.thumbnail }, dir);
    startTask(id, rowFormat(m), dir);
  }

  return (
    <div className="page">
      <Card>
        <Input.TextArea
          rows={8}
          value={text}
          onChange={(e) => setBatch({ text: e.target.value })}
          placeholder={'每行一个链接，支持混合不同站点，数量不限\nhttps://example.com/video1\nhttps://example.com/video2'}
        />
        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <Button
            type="primary"
            icon={<AppstoreOutlined />}
            loading={loading}
            onClick={parseAll}
          >
            批量解析
          </Button>
          {loading && (
            <Button danger onClick={cancelParse}>
              取消解析
            </Button>
          )}
          {metas.length > 0 && (
            <Button onClick={downloadAll}>全部下载（{metas.length}）</Button>
          )}
        </div>
      </Card>

      {fails.length > 0 && (
        <Card title={`解析失败（${fails.length}）`} size="small" style={{ marginTop: 16 }}>
          {fails.map((f, i) => (
            <Typography.Text key={i} type="danger" style={{ display: 'block', fontSize: 12 }}>
              {f}
            </Typography.Text>
          ))}
        </Card>
      )}

      {metas.length > 0 && (
        <Card title={`解析结果（${metas.length}）`} style={{ marginTop: 16 }}>
          <List
            dataSource={metas}
            renderItem={(m) => {
              const s = taskStatus(tasks, m.webpageUrl);
              return (
                <List.Item
                  actions={[
                    <Tag key="st" color={s.color} style={{ marginInlineEnd: 0 }}>
                      {s.text}
                    </Tag>,
                    <Select
                      key="fmt"
                      size="small"
                      style={{ minWidth: 170 }}
                      value={rowFormat(m)}
                      onChange={(v) => setRowFormat(m, v)}
                      options={bestFormats(m)}
                      disabled={s.busy || s.done}
                    />,
                    <Button
                      key="dl"
                      size="small"
                      type="primary"
                      onClick={() => downloadOne(m)}
                      disabled={s.busy || s.done}
                    >
                      下载
                    </Button>,
                  ]}
                >
                  <List.Item.Meta
                    avatar={m.thumbnail ? <img src={m.thumbnail} width={96} alt="" /> : undefined}
                    title={<Typography.Text ellipsis style={{ maxWidth: 480 }}>{m.title}</Typography.Text>}
                    description={
                      <span>
                        {m.uploader && <Tag color="blue">{m.uploader}</Tag>}
                        {m.extractor && <Tag>{m.extractor}</Tag>}
                        <Tag>{fmtDuration(m.duration)}</Tag>
                      </span>
                    }
                  />
                </List.Item>
              );
            }}
          />
        </Card>
      )}
    </div>
  );
}
