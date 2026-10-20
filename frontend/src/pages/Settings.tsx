import { useEffect, useState } from 'react';
import { Card, Form, Input, Button, message, Descriptions, Space, Typography, Select, Switch, Modal } from 'antd';
import { api, EngineStatus } from '../api';

export default function Settings() {
  const [engine, setEngine] = useState<EngineStatus | null>(null);
  const [checked, setChecked] = useState(false);
  const [dir, setDir] = useState(localStorage.getItem('opengrab.dir') || '');
  const [proxy, setProxy] = useState(localStorage.getItem('opengrab.proxy') || '');
  const [busy, setBusy] = useState(false);
  const [cookieBrowser, setCookieBrowser] = useState<string | undefined>(undefined);
  const [cookieFile, setCookieFile] = useState<string | undefined>(undefined);

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
    api.GetCookieConfig().then((c) => {
      setCookieBrowser(c?.fromBrowser || undefined);
      setCookieFile(c?.file || undefined);
    });
  }, []);

  async function pickCookieBrowser(v: string) {
    const browser = v || '';
    setCookieBrowser(browser || undefined);
    if (browser) setCookieFile(undefined);
    await api.SetCookieConfig(browser, '');
    message.success(browser ? `已使用 ${browser} 浏览器的 Cookie` : '已清除 Cookie 配置');
  }

  async function pickCookieFile() {
    try {
      const p = await api.SelectCookiesFile();
      if (p) {
        setCookieFile(p);
        setCookieBrowser(undefined);
        await api.SetCookieConfig('', p);
        message.success('已使用 cookies.txt');
      }
    } catch (e: any) {
      if (String(e) !== '取消') message.error(String(e));
    }
  }

  async function clearCookies() {
    setCookieBrowser(undefined);
    setCookieFile(undefined);
    await api.SetCookieConfig('', '');
    message.success('已清除 Cookie 配置');
  }

  const [debugOn, setDebugOn] = useState(false);
  const [logText, setLogText] = useState<string | null>(null);

  useEffect(() => {
    api.GetDebugLogEnabled().then(setDebugOn);
  }, []);

  async function toggleDebug(on: boolean) {
    setDebugOn(on);
    await api.SetDebugLog(on);
    message.success(on ? '调试日志已开启' : '调试日志已关闭');
  }

  async function viewLog() {
    const t = await api.GetDebugLog();
    setLogText(t || '（日志为空：开启开关后重新操作一次，再回来查看）');
  }

  async function copyLog() {
    if (!logText) return;
    try {
      await navigator.clipboard.writeText(logText);
      message.success('日志已复制到剪贴板');
    } catch {
      message.error('复制失败，请在弹窗中手动选择复制');
    }
  }

  async function clearLog() {
    await api.ClearDebugLog();
    setLogText('');
    message.success('日志已清空');
  }

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
          {engine?.ok && (
            <Button
              loading={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api.UpdateEngineNightly();
                  setEngine(await api.EngineStatus());
                  message.success('已更新到测试版（nightly）引擎');
                } catch (e: any) {
                  message.error(String(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              更新到测试版
            </Button>
          )}
        </Space>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0, marginTop: 8, fontSize: 12 }}>
          默认使用程序目录旁自带的 yt-dlp.exe；没有自带时可在上方手动选择，或点“官方下载”
          在浏览器下载 yt-dlp.exe 后再选择它。
        </Typography.Paragraph>
      </Card>

      <Card title="站点 Cookie（YouTube 等登录验证）" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Select
            style={{ minWidth: 200 }}
            placeholder="从浏览器读取 Cookie"
            value={cookieBrowser}
            onChange={pickCookieBrowser}
            allowClear
            options={[
              { value: 'edge', label: 'Edge' },
              { value: 'chrome', label: 'Chrome' },
              { value: 'firefox', label: 'Firefox' },
              { value: 'brave', label: 'Brave' },
              { value: 'opera', label: 'Opera' },
              { value: 'safari', label: 'Safari' },
            ]}
          />
          <Button onClick={pickCookieFile}>使用 cookies.txt...</Button>
          {(cookieBrowser || cookieFile) && <Button danger onClick={clearCookies}>清除</Button>}
        </Space>
        {cookieFile && (
          <Typography.Paragraph style={{ marginTop: 8, marginBottom: 0, fontSize: 12 }} copyable>
            {cookieFile}
          </Typography.Paragraph>
        )}
        <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0, fontSize: 12 }}>
          YouTube 出现「Sign in to confirm you're not a bot」时：选择一个已登录该站点的浏览器，
          或用浏览器扩展（如 Get cookies.txt LOCALLY）导出 cookies.txt 后选择该文件。
          两种方式二选一，配置对所有解析和下载生效。
        </Typography.Paragraph>
      </Card>

      <Card title="调试日志" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Switch checked={debugOn} onChange={toggleDebug} checkedChildren="开" unCheckedChildren="关" />
          <span style={{ color: '#6b7280' }}>开启后记录每次解析/下载的完整命令与错误输出</span>
          <Button size="small" onClick={viewLog}>查看日志</Button>
          <Button size="small" danger onClick={clearLog}>清空日志</Button>
        </Space>
        <Modal
          title="调试日志（最近 800 行）"
          open={logText !== null}
          onCancel={() => setLogText(null)}
          width={760}
          footer={[
            <Button key="copy" type="primary" onClick={copyLog}>复制全部</Button>,
            <Button key="close" onClick={() => setLogText(null)}>关闭</Button>,
          ]}
        >
          <Input.TextArea
            value={logText || ''}
            readOnly
            autoSize={{ minRows: 12, maxRows: 24 }}
            style={{ fontFamily: 'Consolas, monospace', fontSize: 12 }}
          />
        </Modal>
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
