// Local UI sandbox. No production API requests; edits disappear on restart.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { randomUUID } from 'node:crypto';
const root = resolve('out');
const { moments } = JSON.parse(await readFile('work/preview-data.json', 'utf8'));
for (const moment of moments) for (const photo of moment.photos) {
  for (const key of ['webUrl', 'thumbnailUrl']) if (photo[key]) photo[key] = new URL(photo[key], 'https://d1v1mg445zdh54.cloudfront.net').href;
}
let records = structuredClone(moments);
let signedIn = true;
const send = (res, code, value) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(value)); };
const summary = () => records.map((item) => ({ ...item, photos: undefined, photoCount: item.photos.length }));
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1:3000');
    const path = decodeURIComponent(url.pathname);
    if (path === '/site-data.json') return send(res, 200, { moments: records.filter((m) => m.status === 'published') });
    if (path.startsWith('/api/')) {
      if (req.headers.origin && req.headers.origin !== 'http://127.0.0.1:3000' && req.headers.origin !== 'http://localhost:3000') return send(res, 403, { error: '仅允许本地预览操作。' });
      if (path === '/api/auth/logout') { signedIn = false; return send(res, 200, {}); }
      if (path === '/api/auth/login') return send(res, 403, { error: '本地演示无需账号，请重启预览服务进入。' });
      if (!signedIn) return send(res, 401, {});
      let raw = '';
      for await (const chunk of req) { raw += chunk; if (raw.length > 1000000) return send(res, 413, { error: '请求过大。' }); }
      const input = raw ? JSON.parse(raw) : {};
      const parts = path.split('/').filter(Boolean);
      const item = records.find((m) => m.id === parts[3]);
      if (parts.length === 3 && req.method === 'GET') return send(res, 200, { admin: { id: 'local', username: '本地演示 · 重启恢复' }, moments: summary() });
      if (parts.length === 3 && req.method === 'POST') {
        const next = { ...input, id: randomUUID(), status: 'draft', photos: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), publishedAt: null };
        records.unshift(next); return send(res, 200, { id: next.id });
      }
      if (!item) return send(res, 404, { error: '未找到记录。' });
      if (req.method === 'GET') return send(res, 200, item);
      if (path.endsWith('/status')) {
        if (!['draft', 'published'].includes(input.status)) return send(res, 400, { error: '无效状态。' });
        if (input.status === 'published' && !item.photos.some((p) => p.status === 'ready')) return send(res, 400, { error: '请先添加已就绪的照片。' });
        item.status = input.status;
      } else if (path.endsWith('/reorder')) {
        if (!Array.isArray(input.order) || input.order.length !== item.photos.length || new Set(input.order).size !== item.photos.length || input.order.some((id) => !item.photos.some((p) => p.id === id))) return send(res, 400, { error: '无效照片顺序。' });
        item.photos = input.order.map((id, index) => ({ ...item.photos.find((p) => p.id === id), sortOrder: index }));
      } else if (req.method === 'DELETE' && parts.length === 6) item.photos = item.photos.filter((p) => p.id !== parts[5]);
      else if (req.method === 'DELETE' && parts.length === 4) records = records.filter((m) => m !== item);
      else if (req.method === 'PUT' && parts.length === 4) for (const key of ['date', 'title', 'location', 'caption']) item[key] = String(input[key] ?? '');
      else return send(res, 400, { error: '本地样式预览不上传文件。可以选择照片查看队列；实际上传请使用正式后台。' });
      return send(res, 200, {});
    }
    let filename = resolve(root, '.' + (path === '/' ? '/index.html' : path));
    if (!filename.startsWith(root + '/')) return send(res, 403, {});
    if (!extname(filename)) filename += '.html';
    let body = await readFile(filename);
    if (extname(filename) === '.html') body = Buffer.from(body.toString().replace('</body>', '<div style="position:fixed;bottom:12px;right:12px;z-index:100;padding:8px 12px;border:1px solid #ccd5c6;border-radius:4px;background:#f5f7f0;color:#4d604c;font:11px system-ui">本地演示 · 修改仅在本次运行保留</div></body>'));
    res.writeHead(200, { 'content-type': types[extname(filename)] || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(body);
  } catch (error) { send(res, error.code === 'ENOENT' ? 404 : 400, { error: '本地预览请求失败。' }); }
}).listen(3000, '127.0.0.1', () => console.log('Local preview: http://127.0.0.1:3000 — /admin'));
