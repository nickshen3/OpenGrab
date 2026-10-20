import { Meta, fmtMB } from './api';

// Shared quality selector options for a parsed video.
export function bestFormats(meta?: Meta | null): { value: string; label: string }[] {
  const list: { value: string; label: string }[] = [
    { value: 'bv*+ba/b', label: '最佳画质（视频+音频）' },
  ];
  const seen = new Set<string>();
  for (const f of [...(meta?.formats || [])].reverse()) {
    if (f.resolution && f.resolution !== 'audio' && !seen.has(f.resolution)) {
      seen.add(f.resolution);
      const size = fmtMB(f.filesizeMb);
      list.push({
        value: `bestvideo[height=${parseInt(f.resolution)}]+bestaudio/b[height<=${parseInt(f.resolution)}]`,
        label: `${f.resolution}${f.fps ? ` ${Math.round(f.fps)}fps` : ''}${size ? ` · ~${size}` : ''}`,
      });
    }
  }
  list.push({ value: 'ba/b', label: '仅音频（最佳音质）' });
  return list;
}
