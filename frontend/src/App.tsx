import { useEffect, useState } from 'react';
import { Layout, Menu, Typography, Tag } from 'antd';
import {
  LinkOutlined,
  OrderedListOutlined,
  UnorderedListOutlined,
  SettingOutlined,
  DownloadOutlined,
} from '@ant-design/icons';
import Batch from './pages/Batch';
import Playlist from './pages/Playlist';
import Tasks from './pages/Tasks';
import Settings from './pages/Settings';

const { Sider, Header, Content } = Layout;

export default function App() {
  const [page, setPage] = useState('batch');

  useEffect(() => {
    document.title = 'OpenGrab';
  }, []);

  const menu = [
    { key: 'batch', icon: <LinkOutlined />, label: '链接下载' },
    { key: 'playlist', icon: <OrderedListOutlined />, label: '播放列表下载' },
    { key: 'tasks', icon: <UnorderedListOutlined />, label: '任务列表' },
    { key: 'settings', icon: <SettingOutlined />, label: '设置' },
  ];

  return (
    <Layout className="app-root">
      <Sider width={208} className="app-sider" theme="light">
        <div className="app-logo">
          <DownloadOutlined className="app-logo-icon" />
          <span className="app-logo-text">OpenGrab</span>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[page]}
          items={menu}
          onClick={({ key }) => setPage(key)}
          style={{ borderInlineEnd: 'none', paddingTop: 8 }}
        />
        <div className="app-sider-footer">
          <Tag color="green">开源 · 无限制</Tag>
        </div>
      </Sider>
      <Layout>
        <Header className="app-header">
          <Typography.Text strong style={{ fontSize: 16 }}>
            {page === 'batch' && '链接下载'}
            {page === 'playlist' && '播放列表下载'}
            {page === 'tasks' && '任务列表'}
            {page === 'settings' && '设置'}
          </Typography.Text>
          <Typography.Text type="secondary" className="app-header-sub">
            基于 yt-dlp 引擎 · 支持上千个站点 · 无额度限制
          </Typography.Text>
        </Header>
        <Content className="app-content">
          {page === 'batch' && <Batch />}
          {page === 'playlist' && <Playlist />}
          {page === 'tasks' && <Tasks />}
          {page === 'settings' && <Settings />}
        </Content>
      </Layout>
    </Layout>
  );
}
