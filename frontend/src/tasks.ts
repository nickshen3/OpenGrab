import { useEffect, useState, useCallback } from 'react';
import { api, events, Progress, Meta } from './api';

export interface Task {
  id: string;
  url: string;
  title: string;
  thumbnail?: string;
  dir: string;
  status: Progress['status'] | 'queued';
  percent: number;
  speed: string;
  eta: string;
  totalMb: number;
  downloadedMb: number;
  filename: string;
  filepath: string;
  error?: string;
  addedAt: number;
}

let listeners = new Set<() => void>();
let tasks: Task[] = [];
let seq = 0;

function emit() {
  listeners.forEach((l) => l());
}

export function initTaskListener() {
  events?.EventsOn('download:progress', (p: Progress) => {
    const t = tasks.find((x) => x.id === p.taskId);
    if (!t) return;
    t.status = p.status;
    if (p.percent) t.percent = p.percent;
    if (p.speed) t.speed = p.speed;
    if (p.eta) t.eta = p.eta;
    if (p.totalMb) t.totalMb = p.totalMb;
    if (p.downloadedMb) t.downloadedMb = p.downloadedMb;
    if (p.filename) t.filename = p.filename;
    if (p.dir) t.dir = p.dir;
    if (p.filepath) t.filepath = p.filepath;
    if (p.error) t.error = p.error;
    if (p.status === 'finished') t.percent = 100;
    emit();
  });
}

export function useTasks(): Task[] {
  const [, force] = useState(0);
  const rerender = useCallback(() => force((n) => n + 1), []);
  useEffect(() => {
    listeners.add(rerender);
    return () => {
      listeners.delete(rerender);
    };
  }, [rerender]);
  return tasks;
}

export function addTask(meta: Partial<Task> & { url: string }, dir: string): string {
  const id = `t${Date.now()}_${seq++}`;
  tasks = [
    {
      id,
      url: meta.url,
      title: meta.title || meta.url,
      thumbnail: meta.thumbnail,
      dir: dir || '',
      status: 'queued',
      percent: 0,
      speed: '',
      eta: '',
      totalMb: 0,
      downloadedMb: 0,
      filename: '',
      filepath: '',
      addedAt: Date.now(),
    },
    ...tasks,
  ];
  emit();
  return id;
}

export async function startTask(id: string, formatSel: string, dir: string) {
  const t = tasks.find((x) => x.id === id);
  if (!t) return;
  t.status = 'downloading';
  emit();
  try {
    await api.StartDownload(id, t.url, formatSel, dir);
  } catch (e: any) {
    t.status = 'error';
    t.error = String(e);
    emit();
  }
}

export function cancelTask(id: string) {
  api.CancelDownload(id);
}

export function removeTask(id: string) {
  tasks = tasks.filter((t) => t.id !== id);
  emit();
}

export function clearFinished() {
  tasks = tasks.filter((t) => t.status === 'downloading' || t.status === 'processing' || t.status === 'queued');
  emit();
}

// Shared per-URL download status derived from the task list:
// finished > downloading/processing > queued > none.
export function taskStatus(
  list: Task[],
  url?: string
): { text: string; color: string; busy: boolean; done: boolean } {
  if (!url) return { text: '未下载', color: 'default', busy: false, done: false };
  const related = list.filter((t) => t.url === url);
  if (related.find((t) => t.status === 'finished')) {
    return { text: '已下载', color: 'success', busy: false, done: true };
  }
  const running = related.find(
    (t) => t.status === 'downloading' || t.status === 'processing' || t.status === 'queued'
  );
  if (running) {
    return {
      text: running.status === 'queued' ? '排队中' : `下载中 ${Math.round(running.percent)}%`,
      color: 'processing',
      busy: true,
      done: false,
    };
  }
  return { text: '未下载', color: 'default', busy: false, done: false };
}

export { api };
export type { Meta };
