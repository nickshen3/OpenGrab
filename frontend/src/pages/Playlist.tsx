import { playlistStore } from './state';
import { api, Meta, fmtDuration } from '../api';
import { addTask, startTask, initTaskListener, useTasks, taskStatus } from '../tasks';
import { bestFormats } from '../formats';
import { Input, Button, Card, List, message, Spin, Tag, Typography, Empty, Select } from 'antd';
import { OrderedListOutlined } from '@ant-design/icons';

initTaskListener();

export default function Playlist() {
  const [st, setPl] = playlistStore.use();
  const tasks = useTasks();
  const { url, loading, meta, rowFormats, parseId } = st;

  async function parse() {
    if (!url.trim() || loading) return;
    const pid = `pl${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    setPl({ loading: true, parseId: pid, meta: null });
    try {
      const m = await api.ParsePlaylist(pid, url);
      setPl({ meta: m, loading: false });
      if (!m.isPlaylist) {
        message.warning('该链接不是播放列表/主页，仅解析到单个视频');
      }
    } catch (e: any) {
      setPl({ loading: false });
      message.error(String(e));
    }
  }

  function cancelParse() {
    api.CancelParse(parseId);
    setPl({ loading: false });
    message.info('已取消解析');
  }

  function rowFormat(m: Meta): string {
    return rowFormats[m.id || m.webpageUrl] || 'bv*+ba/b';
  }

  function setRowFormat(m: Meta, v: string) {
    setPl({ rowFormats: { ...rowFormats, [m.id || m.webpageUrl]: v } });
  }

  function downloadEntry(e: Meta) {
    if (!e.webpageUrl) return;
    const dir = localStorage.getItem('opengrab.dir') || '';
    const id = addTask({ url: e.webpageUrl, title: e.title, thumbnail: e.thumbnail }, dir);
    startTask(id, rowFormat(e), dir);
  }

  function downloadAll() {
    const entries = (meta?.entries || []).filter((e) => e.webpageUrl);
    if (entries.length === 0) return;
    const dir = localStorage.getItem('opengrab.dir') || '';
    entries.forEach((e) => {
      const id = addTask({ url: e.webpageUrl, title: e.title, thumbnail: e.thumbnail }, dir);
      startTask(id, rowFormat(e), dir);
    });
    message.success(`已加入 ${entries.length} 个任务`);
  }

  const entries = meta?.entries || [];

  return (
    <div className="page">
      <div className="grab-box">
        <Input.Search
          size="large"
          value={url}
          onChange={(e) => setPl({ url: e.target.value })}
          onSearch={parse}
          placeholder="粘贴播放列表 / 频道 / 主页链接，自动展开全部视频"
          enterButton={
            <Button type="primary" icon={<OrderedListOutlined />} loading={loading}>
              获取
            </Button>
          }
        />
        {loading && (
          <div className="cancel-row">
            <Button danger size="small" onClick={cancelParse}>
              取消解析
            </Button>
          </div>
        )}
      </div>

      {loading && (
        <div className="center-box">
          <Spin tip="正在解析播放列表..." />
        </div>
      )}

      {meta && !meta.isPlaylist && (
        <Card className="meta-card">
          <div className="meta-row">
            {meta.thumbnail && (
              <div className="meta-thumb">
                <img src={meta.thumbnail} alt={meta.title} />
                <span className="meta-duration">{fmtDuration(meta.duration)}</span>
              </div>
            )}
            <div className="meta-info">
              <Typography.Title level={5} ellipsis={{ rows: 2 }} style={{ marginBottom: 4 }}>
                {meta.title}
              </Typography.Title>
              <Button type="primary" onClick={() => downloadEntry(meta)}>
                下载
              </Button>
            </div>
          </div>
        </Card>
      )}

      {meta && meta.isPlaylist && (
        <Card
          title={`播放列表 · ${meta.title || '未命名'} · 共 ${entries.length} 项`}
          extra={
            <Button type="primary" onClick={downloadAll} disabled={entries.length === 0}>
              全部下载（{entries.length}）
            </Button>
          }
        >
          {entries.length === 0 ? (
            <Empty description="该列表没有解析到条目" />
          ) : (
            <List
              dataSource={entries}
              renderItem={(e, i) => {
                const s = taskStatus(tasks, e.webpageUrl);
                return (
                  <List.Item
                    key={e.id || i}
                    actions={[
                      <Tag key="st" color={s.color} style={{ marginInlineEnd: 0 }}>
                        {s.text}
                      </Tag>,
                      <Select
                        key="fmt"
                        size="small"
                        style={{ minWidth: 170 }}
                        value={rowFormat(e)}
                        onChange={(v) => setRowFormat(e, v)}
                        options={bestFormats(e)}
                        disabled={s.busy || s.done}
                      />,
                      <Button
                        key="dl"
                        size="small"
                        type="primary"
                        onClick={() => downloadEntry(e)}
                        disabled={s.busy || s.done}
                      >
                        下载
                      </Button>,
                    ]}
                  >
                    <List.Item.Meta
                      avatar={
                        e.thumbnail ? (
                          <img src={e.thumbnail} width={96} alt="" />
                        ) : (
                          <div className="thumb-placeholder">{(e.title || e.id || '?').slice(0, 1)}</div>
                        )
                      }
                      title={
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, maxWidth: 560 }}>
                          <Typography.Text ellipsis style={{ maxWidth: 460 }}>
                            {e.title || e.webpageUrl || e.id || '未命名条目'}
                          </Typography.Text>
                          <Tag style={{ marginInlineEnd: 0 }}>{fmtDuration(e.duration)}</Tag>
                        </span>
                      }
                    />
                  </List.Item>
                );
              }}
            />
          )}
        </Card>
      )}
    </div>
  );
}
