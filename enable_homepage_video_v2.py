#!/usr/bin/env python3
"""Install Cloudinary-backed homepage video management into the BHOTAN portal."""
from pathlib import Path
import re, shutil, sys

ROOT = Path.cwd()
server = ROOT / 'backend/src/server.js'
app = ROOT / 'frontend/src/App.jsx'
if not server.exists() or not app.exists():
    sys.exit('Run this script from the dear-results-portal project root.')
S = server.read_text()
A = app.read_text()

# Verify the exact backend primitives used by this project before touching files.
for token in ('app.use((req, res) => res.status(404)', 'requireAdmin', 'asyncRoute', 'pool.query'):
    if token not in S:
        sys.exit(f'Backend compatibility check failed: missing {token!r}. No files changed.')
if 'homepage-video/signature' in S or 'HomepageVideoAdmin' in A:
    sys.exit('Homepage video integration appears to be already installed. No files changed.')

# Locate the end-of-routes insertion point, immediately before the JSON 404 handler.
marker = "app.use((req, res) => res.status(404)"
backend_routes = r'''
// --- BHOTAN homepage video management (Cloudinary) ---
async function ensureHomepageVideoTable() {
  await pool.query(`CREATE TABLE IF NOT EXISTS homepage_video (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    video_url TEXT NOT NULL,
    public_id TEXT NOT NULL,
    original_filename TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
}

app.get('/api/settings/homepage-video', asyncRoute(async (_req, res) => {
  await ensureHomepageVideoTable();
  const { rows } = await pool.query('SELECT video_url, updated_at FROM homepage_video WHERE id=1');
  res.set('Cache-Control', 'no-store');
  res.json(rows[0] || null);
}));

app.get('/api/admin/homepage-video', requireAdmin, asyncRoute(async (_req, res) => {
  await ensureHomepageVideoTable();
  const { rows } = await pool.query('SELECT video_url, public_id, original_filename, updated_at FROM homepage_video WHERE id=1');
  res.json(rows[0] || null);
}));

app.post('/api/admin/homepage-video/signature', requireAdmin, asyncRoute(async (_req, res) => {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) return res.status(503).json({ error: 'Cloudinary environment variables are not configured on the backend.' });
  const { v2: cloudinary } = await import('cloudinary');
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = 'bhotan/homepage';
  const public_id = `homepage-${timestamp}`;
  const params = { timestamp, folder, public_id };
  const signature = cloudinary.utils.api_sign_request(params, apiSecret);
  res.json({ cloud_name: cloudName, api_key: apiKey, timestamp, folder, public_id, signature });
}));

app.put('/api/admin/homepage-video', requireAdmin, asyncRoute(async (req, res) => {
  const { video_url, public_id, version, signature, original_filename } = req.body || {};
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!apiSecret || !process.env.CLOUDINARY_API_KEY) return res.status(503).json({ error: 'Cloudinary is not configured on the backend.' });
  if (typeof video_url !== 'string' || !video_url.startsWith('https://res.cloudinary.com/') || typeof public_id !== 'string' || !public_id.startsWith('bhotan/homepage/') || !Number.isInteger(Number(version)) || typeof signature !== 'string') {
    return res.status(400).json({ error: 'Invalid Cloudinary upload details.' });
  }
  const { v2: cloudinary } = await import('cloudinary');
  const expected = cloudinary.utils.api_sign_request({ public_id, version: Number(version) }, apiSecret);
  if (expected !== signature) return res.status(403).json({ error: 'Cloudinary upload signature verification failed.' });
  await ensureHomepageVideoTable();
  const { rows } = await pool.query(`INSERT INTO homepage_video (id, video_url, public_id, original_filename, updated_at)
    VALUES (1,$1,$2,$3,NOW()) ON CONFLICT (id) DO UPDATE SET video_url=EXCLUDED.video_url, public_id=EXCLUDED.public_id,
    original_filename=EXCLUDED.original_filename, updated_at=NOW()
    RETURNING video_url, public_id, original_filename, updated_at`, [video_url, public_id, String(original_filename || '').slice(0,255)]);
  res.json(rows[0]);
}));

app.delete('/api/admin/homepage-video', requireAdmin, asyncRoute(async (_req, res) => {
  await ensureHomepageVideoTable();
  const { rows } = await pool.query('SELECT public_id FROM homepage_video WHERE id=1');
  if (rows[0]?.public_id && process.env.CLOUDINARY_API_SECRET && process.env.CLOUDINARY_API_KEY) {
    const { v2: cloudinary } = await import('cloudinary');
    cloudinary.config({ cloud_name: process.env.CLOUDINARY_CLOUD_NAME, api_key: process.env.CLOUDINARY_API_KEY, api_secret: process.env.CLOUDINARY_API_SECRET, secure: true });
    await cloudinary.uploader.destroy(rows[0].public_id, { resource_type: 'video', invalidate: true });
  }
  await pool.query('DELETE FROM homepage_video WHERE id=1');
  res.status(204).end();
}));
// --- End homepage video management ---

'''
S2 = S.replace(marker, backend_routes + marker, 1)

# Create a self-contained admin/public component. Upload is direct to Cloudinary;
# the signed upload and publication are both verified by the backend.
component = r'''import React, { useEffect, useState } from 'react';
import { api } from './api';

export function HomepageVideoAdmin() {
  const [current, setCurrent] = useState(null);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { api('/admin/homepage-video').then(setCurrent).catch(e => setError(e.message)); }, []);
  async function publish(e) {
    e.preventDefault(); setError(''); setMessage('');
    if (!file) { setError('Choose a video first.'); return; }
    if (!['video/mp4', 'video/webm', 'video/quicktime'].includes(file.type)) { setError('Use an MP4, WebM, or MOV video.'); return; }
    if (file.size > 100 * 1024 * 1024) { setError('Maximum video size is 100 MB.'); return; }
    setBusy(true);
    try {
      const signed = await api('/admin/homepage-video/signature', { method: 'POST', body: JSON.stringify({}) });
      const data = new FormData();
      for (const key of ['api_key','timestamp','folder','public_id','signature']) data.append(key, signed[key]);
      data.append('file', file);
      const uploadResponse = await fetch(`https://api.cloudinary.com/v1_1/${signed.cloud_name}/video/upload`, { method: 'POST', body: data });
      const uploaded = await uploadResponse.json();
      if (!uploadResponse.ok) throw new Error(uploaded.error?.message || 'Cloudinary upload failed.');
      const saved = await api('/admin/homepage-video', { method: 'PUT', body: JSON.stringify({ video_url: uploaded.secure_url, public_id: uploaded.public_id, version: uploaded.version, signature: uploaded.signature, original_filename: file.name }) });
      setCurrent(saved); setFile(null); e.target.reset(); setMessage('Video published. It is now visible on the homepage.');
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  async function removeVideo() {
    if (!confirm('Remove the currently published homepage video?')) return;
    setBusy(true); setError(''); setMessage('');
    try { await api('/admin/homepage-video', { method: 'DELETE' }); setCurrent(null); setMessage('Homepage video removed.'); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <section className="panel form-panel" style={{maxWidth:900}}>
    <div className="panel-heading"><div><span className="eyebrow">PUBLIC HOMEPAGE</span><h3>Homepage video management</h3></div></div>
    <p className="muted">Upload an MP4, WebM, or MOV video (maximum 100 MB). Publishing replaces the video shown to all visitors.</p>
    {current?.video_url ? <div style={{margin:'16px 0'}}><strong>Currently published</strong><video key={current.updated_at} src={current.video_url} controls playsInline style={{display:'block',width:'100%',maxHeight:360,background:'#111',borderRadius:10,marginTop:10}}/><small className="muted">{current.original_filename || 'Homepage video'} · Updated {new Date(current.updated_at).toLocaleString('en-IN')}</small></div> : <p className="muted">No homepage video is currently published.</p>}
    <form className="stack-form" onSubmit={publish}><label>Select video<input type="file" accept="video/mp4,video/webm,video/quicktime" onChange={e=>setFile(e.target.files?.[0] || null)} required/></label>
      {file && <p className="muted">Selected: {file.name} · {(file.size/1024/1024).toFixed(1)} MB</p>}
      <div className="form-actions"><button className="primary-button" disabled={busy || !file}>{busy ? 'Uploading…' : 'Upload & publish on homepage'}</button>{current?.video_url && <button type="button" className="danger-link" disabled={busy} onClick={removeVideo}>Remove current video</button>}</div>
    </form>
    {error && <p className="error-text" role="alert">{error}</p>}{message && <p className="success-text" role="status">{message}</p>}
  </section>;
}

export function HomepageVideo() {
  const [video, setVideo] = useState(null);
  useEffect(() => { api('/settings/homepage-video').then(setVideo).catch(() => setVideo(null)); }, []);
  if (!video?.video_url) return null;
  return <section aria-label="Featured video" style={{maxWidth:1200,margin:'24px auto',padding:'0 20px'}}>
    <video key={video.updated_at} src={video.video_url} autoPlay muted loop playsInline controls style={{display:'block',width:'100%',maxHeight:520,objectFit:'contain',background:'#111',borderRadius:12}} />
  </section>;
}
'''
component_path = ROOT / 'frontend/src/HomepageVideo.jsx'

# Add imports and admin navigation/tab. Use exact structural anchors from provided App.jsx.
if "from './HomepageVideo'" not in A:
    A2 = A.replace("import { api } from './api';", "import { api } from './api';\nimport { HomepageVideo, HomepageVideoAdmin } from './HomepageVideo';", 1)
else:
    A2 = A
nav_anchor = "['lottery-form','Add category',CalendarDays]"
if nav_anchor not in A2:
    sys.exit('Frontend patch check failed: admin navigation anchor not found. Backend not written.')
A2 = A2.replace(nav_anchor, nav_anchor + ",['video','Homepage video',FileText]", 1)
# Insert video admin tab before closing admin main, using the unique final lottery form section.
admin_end = "</section>}\n    </main></div></div>;"
if admin_end not in A2:
    sys.exit('Frontend patch check failed: admin panel closing anchor not found. Backend not written.')
A2 = A2.replace(admin_end, "</section>}\n    {tab==='video'&&<HomepageVideoAdmin/>}\n    </main></div></div>;", 1)
# Render public video directly below the site header.
public_anchor = "return <><Header /><main>"
if public_anchor not in A2:
    sys.exit('Frontend patch check failed: public app header anchor not found. Backend not written.')
A2 = A2.replace(public_anchor, "return <><Header /><HomepageVideo /><main>", 1)

# Add Video icon to existing lucide import.
A2 = re.sub(r"import \{([^}]+)\} from 'lucide-react';", lambda m: "import {" + (m.group(1) if 'Video' in m.group(1) else m.group(1).rstrip() + ', Video') + "} from 'lucide-react';", A2, count=1)

# Backups then writes; fail-closed checks above ensure no partial writes.
for path in (server, app):
    backup = path.with_suffix(path.suffix + '.pre-homepage-video.bak')
    if not backup.exists(): shutil.copy2(path, backup)
server.write_text(S2)
app.write_text(A2)
component_path.write_text(component)
print('SUCCESS: Homepage video backend routes and frontend controls installed.')
print('Created: frontend/src/HomepageVideo.jsx')
print('Created backups: backend/src/server.js.pre-homepage-video.bak and frontend/src/App.jsx.pre-homepage-video.bak')
print('Next: configure Cloudinary variables in backend/.env and Netlify, then run the frontend build.')
