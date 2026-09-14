import assert from 'node:assert/strict';
const origin = 'http://127.0.0.1:3000';
async function call(path, method = 'GET', body) {
  const response = await fetch(origin + path, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}
assert.equal((await call('/api/admin/moments')).body.admin.id, 'local');
const { body: { id } } = await call('/api/admin/moments', 'POST', { date: '2026-09-09', title: 'Preview check', location: 'Local', caption: '' });
try {
  const path = `/api/admin/moments/${id}`;
  assert.equal((await call(path + '/status', 'PUT', { status: 'published' })).status, 400);
  await call(path, 'PUT', { date: '2026-09-09', title: 'Saved check', location: 'Local', caption: '' });
  assert.equal((await call(path)).body.title, 'Saved check');
  assert.equal((await call('/site-data.json')).body.moments.some((item) => item.id === id), false);
  assert.equal((await call(path + '/photos/reorder', 'PUT', { order: ['unknown'] })).status, 400);
} finally {
  assert.equal((await call(`/api/admin/moments/${id}`, 'DELETE')).status, 200);
}
console.log('Local preview checks passed');
