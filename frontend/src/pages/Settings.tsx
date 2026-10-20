import { useEffect, useState } from 'react';
import { Card, Form, Input, Button, message, Descriptions, Space, Typography } from 'antd';
import { api, EngineStatus } from '../api';

export default function Settings() {
  const [engine, setEngine] = useState<EngineStatus | null>(null);
  const [checked, setChecked] = useState(false);
  const [dir, setDir] = useState(localStorage.getItem('opengrab.dir') || '');
  const [proxy, setProxy] = useState(localStorage.getItem('opengrab.proxy') || '');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // reads the backend's startup-cached status; no yt-dlp process is spawned
    api.EngineStatus().then((s) => {
      if (s) {
        setEngine(s);
        setChecked(true);
      }
    });
    (window as any).runtime?.EventsOn('engine:status', (s: EngineStatus) => {
      if (s) {
        setEngine(s);
        setChecked(true);
      }
    });
  }, []);

  async function selectEngine() {
    setBusy(true);
    try {
      const s = await api.SelectEngine();
      if (s) {
        setEngine(s);
        message.success('引擎已设置');
      }
    } catch (e: any) {
      if (String(e) !== '未选择文件') message.error(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function checkUpdate() {
    setBusy(true);
    try {
      await api.UpdateEngine();
      setEngine(await api.EngineStatus());
      setChecked(true);
      message.success('引擎已更新到最新版');
    } catch (e: any) {
      message.error(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function browse() {
    try {
      const p = await api.PickDirectory();
      if (p) {
        setDir(p);
        localStorage.setItem('opengrab.dir', p);
        message.success('已保存');
      }
    } catch (e: any) {
      message.error(String(e));
    }
  }

  function saveProxy(v: string) {
    localStorage.setItem('opengrab.proxy', v);
    api.SetProxy(v);
    message.success('已保存');
  }

  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <Card title="下载引擎（yt-dlp）" style={{ marginBottom: 16 }}>
        {engine ? (
          <Descriptions column={1} size="small">
            <Descriptions.Item label="状态">
              {engine.ok ? '已安装' : '未安装'}
            </Descriptions.Item>
            <Descriptions.Item label="版本">{engine.version || '--'}</Descriptions.Item>
            <Descriptions.Item label="路径">
              <Typography.Text copyable style={{ fontSize: 12 }}>{engine.path}</Typography.Text>
            </Descriptions.Item>
          </Descriptions>
        ) : (
          <Typography.Text type="secondary">
            尚未检测。点击下方“检查更新”会自动检测并下载最新版引擎。
          </Typography.Text>
        )}
        <Space style={{ marginTop: 12 }} wrap>
          {!engine?.ok && (
            <Button type="primary" loading={busy} onClick={selectEngine}>
              选择引擎...
            </Button>
          )}
          {engine?.ok && (
            <Button loading={busy} onClick={selectEngine}>
              选择引擎...
            </Button>
          )}
          <Button onClick={() => api.OpenEngineDownloadPage()}>官方下载</Button>
          {engine?.ok && (
            <Button loading={busy} onClick={checkUpdate}>
              检查更新
            </Button>
          )}
        </Space>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0, marginTop: 8, fontSize: 12 }}>
          默认使用程序目录旁自带的 yt-dlp.exe；没有自带时可在上方手动选择，或点“官方下载”
          在浏览器下载 yt-dlp.exe 后再选择它。
        </Typography.Paragraph>
      </Card>

      <Card title="下载目录" style={{ marginBottom: 16 }}>
        <Space.Compact style={{ width: '100%' }}>
          <Input
            value={dir}
            onChange={(e) => setDir(e.target.value)}
            placeholder="留空则使用 系统下载目录\\OpenGrab"
          />
          <Button onClick={browse}>浏览...</Button>
          <Button
            type="primary"
            onClick={() => {
              localStorage.setItem('opengrab.dir', dir);
              message.success('已保存');
            }}
          >
            保存
          </Button>
          {dir && <Button onClick={() => api.OpenFolder(dir)}>打开文件夹</Button>}
        </Space.Compact>
      </Card>

      <Card title="网络代理（可选）" style={{ marginBottom: 16 }}>
        <Space.Compact style={{ width: '100%' }}>
          <Input
            value={proxy}
            onChange={(e) => setProxy(e.target.value)}
            placeholder="例如 http://127.0.0.1:7890，留空不使用"
          />
          <Button type="primary" onClick={() => saveProxy(proxy)}>
            保存
          </Button>
        </Space.Compact>
      </Card>

      <Card title="关于">
        <Typography.Paragraph type="secondary">
          OpenGrab 是一个开源（MIT）的本地下载工具：界面基于 React + Ant Design，后端基于 Go + Wails，
          下载引擎为开源项目 yt-dlp。所有功能本地运行，没有账户、没有会员、没有次数限制，
          解析与下载能力由 yt-dlp 社区持续维护。
        </Typography.Paragraph>
      </Card>
    </div>
  );
}
