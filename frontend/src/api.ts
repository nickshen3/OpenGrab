// Bridge to the Go backend (Wails bindings).
// Uses window.go directly so the frontend compiles even before `wails build`
// regenerates wailsjs bindings.

export interface Format {
  id: string;
  ext: string;
  resolution: string;
  fps: number;
  filesizeMb: number;
  vcodec: string;
  acodec: string;
}

export interface Meta {
  id: string;
  title: string;
  uploader: string;
  duration: number;
  thumbnail: string;
  webpageUrl: string;
  extractor: string;
  isPlaylist: boolean;
  entries?: Meta[];
  formats: Format[];
}

export interface Progress {
  taskId: string;
  status: 'downloading' | 'processing' | 'finished' | 'error' | 'canceled';
  percent: number;
  speed: string;
  eta: string;
  totalMb: number;
  downloadedMb: number;
  filename: string;
  dir: string;
  filepath: string;
  error?: string;
}

export interface EngineStatus {
  ok: boolean;
  path: string;
  version: string;
}

type AppBinding = {
  ParseURL(parseId: string, raw: string): Promise<Meta>;
  ParsePlaylist(parseId: string, raw: string): Promise<Meta>;
  ParseBatch(parseId: string, raw: string): Promise<{ metas: Meta[]; fails: string[] }>;
  CancelParse(parseId: string): Promise<void>;
  RevealFile(path: string): Promise<void>;
  PickDirectory(): Promise<string>;
  SelectEngine(): Promise<EngineStatus>;
  OpenEngineDownloadPage(): Promise<void>;
  SetCookieConfig(fromBrowser: string, file: string): Promise<void>;
  GetCookieConfig(): Promise<{ fromBrowser: string; file: string }>;
  SelectCookiesFile(): Promise<string>;
  SetDebugLog(on: boolean): Promise<void>;
  GetDebugLogEnabled(): Promise<boolean>;
  GetDebugLog(): Promise<string>;
  ClearDebugLog(): Promise<void>;
  StartDownload(taskId: string, url: string, formatSel: string, dir: string): Promise<void>;
  CancelDownload(taskId: string): Promise<void>;
  EngineStatus(): Promise<EngineStatus>;
  EnsureEngine(): Promise<string>;
  UpdateEngine(): Promise<string>;
  UpdateEngineNightly(): Promise<string>;
  SetProxy(p: string): Promise<void>;
  OpenFolder(path: string): Promise<void>;
};

declare global {
  interface Window {
    go: { main: { App: AppBinding } };
    runtime: {
      EventsOn(name: 'download:progress' | 'engine:ready', cb: (data: any) => void): void;
    };
  }
}

export const api: AppBinding = (window as any).go?.main?.App;
export const events = (window as any).runtime;

export function fmtDuration(sec: number): string {
  if (!sec || sec <= 0) return '--:--';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

export function fmtMB(mb: number): string {
  if (!mb || mb <= 0) return '';
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`;
}
