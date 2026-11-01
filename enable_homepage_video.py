from pathlib import Path
import re, sys
root = Path.cwd()
server = root/'backend/src/server.js'
app = root/'frontend/src/App.jsx'
if not server.exists() or not app.exists():
    sys.exit('Run this script from the dear-results-portal project root.')
s = server.read_text()
a = app.read_text()
if "from 'cloudinary'" not in s:
    # Insert import alongside existing imports.
    s = "import { v2 as cloudinary } from 'cloudinary';\n" + s
if "HOMEPAGE VIDEO MANAGEMENT" not in s:
    routes = r'''
// HOMEPAGE VIDEO MANAGEMENT (Cloudinary signed uploads)
async function ensureHomepageVideoTable() {
  await pool.query(`CREATE TABLE IF NOT EXISTS homepage_video (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    video_url TEXT NOT NULL,
    public_id TEXT NOT NULL,
    original_filename TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
}

app.get('/api/admin/homepage-video', requireAdmin, asyncRoute(async (_req, res) => {
  await ensureHomepageVideoTable();
  const { rows } = await pool.query('SELECT video_url, public_id, original_filename, updated_at FROM homepage_video WHERE id=1');
  res.json(rows[0] || null);
}));

app.get('/api/settings/homepage-video', asyncRoute(async (_req, res) => {
  await ensureHomepageVideoTable();
  const { rows } = await pool.query('SELECT video_url, updated_at FROM homepage_video WHERE id=1');
  res.set('Cache-Control', 'no-store');
  res.json(rows[0] || null);
}));

app.post('/api/admin/homepage-video/signature', requireAdmin, asyncRoute(async (_req, res) => {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) return res.status(503).json({ error: 'Cloudinary is not configured on the server.' });
  const timestamp = Math.floor(Date.now() / 1000);
  const params = { folder: 'bhotan-homepage', resource_type: 'video', timestamp };
  const signature = cloudinary.utils.api_sign_request(params, apiSecret);
  res.json({ cloud_name: cloudName, api_key: apiKey, timestamp, folder: params.folder, signature });
}));

app.put('/api/admin/homepage-video', requireAdmin, asyncRoute(async (req, res) => {
  const { secure_url, public_id, version, signature, original_filename } = req.body || {};
  if (typeof secure_url !== 'string' || !secure_url.startsWith('https://res.cloudinary.com/') ||
      typeof public_id !== 'string' || !public_id.startsWith('bhotan-homepage/') ||
      !Number.isInteger(Number(version)) || typeof signature !== 'string') {
    return res.status(400).json({ error: 'Invalid Cloudinary upload response.' });
  }
  const expected = cloudinary.utils.api_sign_request({ public_id, version: Number(version) }, process.env.CLOUDINARY_API_SECRET || '');
  if (!process.env.CLOUDINARY_API_SECRET || expected !== signature) return res.status(400).json({ error: 'Cloudinary upload signature verification failed.' });
  await ensureHomepageVideoTable();
  const { rows } = await pool.query(`INSERT INTO homepage_video (id, video_url, public_id, original_filename, updated_at)
    VALUES (1,$1,$2,$3,NOW()) ON CONFLICT (id) DO UPDATE SET video_url=EXCLUDED.video_url,
    public_id=EXCLUDED.public_id, original_filename=EXCLUDED.original_filename, updated_at=NOW()
    RETURNING video_url, updated_at`, [secure_url, public_id, String(original_filename || '').slice(0,255)]);
  res.json(rows[0]);
}));

app.delete('/api/admin/homepage-video', requireAdmin, asyncRoute(async (_req, res) => {
  await ensureHomepageVideoTable();
  const { rows } = await pool.query('SELECT public_id FROM homepage_video WHERE id=1');
  if (rows[0]?.public_id) await cloudinary.uploader.destroy(rows[0].public_id, { resource_type: 'video' });
  await pool.query('DELETE FROM homepage_video WHERE id=1');
  res.json({ ok: true });
}));

'''
    marker = "app.use((req, res) => res.status(404).json({ error: 'Endpoint not found.' }));"
    if marker not in s: sys.exit('Could not find backend 404 route marker; no backend changes written.')
    s = s.replace(marker, routes + marker, 1)

# Public homepage video state + fetch.
if 'const [homepageVideo, setHomepageVideo]' not in a:
    old = "const [results,setResults]=useState([]),[lotteries,setLotteries]=useState([]),[query,setQuery]=useState(''),[loading,setLoading]=useState(true),[error,setError]=useState(''),[selected,setSelected]=useState(null),[adminOpen,setAdminOpen]=useState(false);"
    new = old + "\n  const [homepageVideo, setHomepageVideo] = useState(null);\n  useEffect(() => { api('/settings/homepage-video').then(setHomepageVideo).catch(() => setHomepageVideo(null)); }, []);"
    if old not in a: sys.exit('Could not find App state declaration; no frontend changes written.')
    a = a.replace(old, new, 1)

# Admin video state, upload, publish, remove functions.
if 'function Admin({ onClose, onVideoPublished })' not in a:
    a = a.replace('function Admin({ onClose }) {', 'function Admin({ onClose, onVideoPublished }) {', 1)

if 'async function uploadHomepageVideo' not in a:
    anchor = "  const nav=[['overview','Overview',LayoutDashboard]"
    code = r'''  const [videoInfo, setVideoInfo] = useState(null);
  const [videoFile, setVideoFile] = useState(null);
  const [videoBusy, setVideoBusy] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  useEffect(() => { api('/admin/homepage-video').then(setVideoInfo).catch(() => {}); }, []);
  async function uploadHomepageVideo() {
    if (!videoFile) { setError('Choose a video first.'); return; }
    if (!videoFile.type.startsWith('video/')) { setError('Choose a valid video file.'); return; }
    if (videoFile.size > 100 * 1024 * 1024) { setError('Video must be 100 MB or smaller.'); return; }
    setVideoBusy(true); setError(''); setNotice(''); setVideoProgress(0);
    try {
      const signed = await api('/admin/homepage-video/signature', { method: 'POST', body: JSON.stringify({}) });
      const form = new FormData();
      form.append('file', videoFile); form.append('api_key', signed.api_key);
      form.append('timestamp', String(signed.timestamp)); form.append('folder', signed.folder);
      form.append('resource_type', 'video'); form.append('signature', signed.signature);
      const uploaded = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `https://api.cloudinary.com/v1_1/${signed.cloud_name}/video/upload`);
        xhr.upload.onprogress = (event) => { if (event.lengthComputable) setVideoProgress(Math.round(event.loaded / event.total * 100)); };
        xhr.onload = () => { let data; try { data = JSON.parse(xhr.responseText); } catch { return reject(new Error('Cloudinary returned an invalid response.')); }
          if (xhr.status < 200 || xhr.status >= 300) return reject(new Error(data.error?.message || 'Cloudinary upload failed.'));
          resolve(data);
        };
        xhr.onerror = () => reject(new Error('Video upload failed. Check your connection.'));
        xhr.send(form);
      });
      const saved = await api('/admin/homepage-video', { method: 'PUT', body: JSON.stringify({ secure_url: uploaded.secure_url, public_id: uploaded.public_id, version: uploaded.version, signature: uploaded.signature, original_filename: videoFile.name }) });
      setVideoInfo(saved); onVideoPublished?.(saved); setVideoFile(null); setVideoProgress(100);
      setNotice('Video published. It is now visible on the public homepage.');
    } catch (uploadError) { setError(uploadError.message); }
    finally { setVideoBusy(false); }
  }
  async function removeHomepageVideo() {
    if (!confirm('Remove the currently published homepage video?')) return;
    setVideoBusy(true); setError('');
    try { await api('/admin/homepage-video', { method: 'DELETE' }); setVideoInfo(null); onVideoPublished?.(null); setNotice('Homepage video removed.'); }
    catch (removeError) { setError(removeError.message); }
    finally { setVideoBusy(false); }
  }
'''
    if anchor not in a: sys.exit('Could not find Admin navigation anchor; no frontend changes written.')
    a = a.replace(anchor, code + "  const nav=[['video','Homepage video',Play],['overview','Overview',LayoutDashboard]", 1)

# Admin panel section inserted before overview.
if "tab==='video'&&" not in a:
    anchor = "     {tab==='overview'&&<>"
    panel = r'''     {tab==='video'&&<section className="panel form-panel"><div className="panel-heading"><div><span className="eyebrow">HOMEPAGE MEDIA</span><h3>Video management</h3><p className="muted">Upload a video and publish it to the public homepage.</p></div><Play size={20}/></div>
       {videoInfo?.video_url?<div style={{marginBottom:16}}><video src={videoInfo.video_url} controls playsInline style={{width:'100%',maxHeight:320,background:'#111',borderRadius:10}}/><p className="muted">Currently published · {videoInfo.updated_at?new Date(videoInfo.updated_at).toLocaleString('en-IN'):''}</p></div>:<p className="muted">No homepage video is currently published.</p>}
       <div className="stack-form"><label>Select video (MP4 or WebM, maximum 100 MB)<input type="file" accept="video/mp4,video/webm,video/quicktime" onChange={e=>setVideoFile(e.target.files?.[0]||null)}/></label>
       {videoFile&&<><p className="muted">Selected: {videoFile.name} · {(videoFile.size/1024/1024).toFixed(1)} MB</p><video src={URL.createObjectURL(videoFile)} controls playsInline style={{width:'100%',maxHeight:240,background:'#111',borderRadius:10}}/></>}
       {videoBusy&&<p className="muted">Uploading… {videoProgress}%</p>}
       <div className="form-actions"><button className="primary-button" type="button" disabled={!videoFile||videoBusy} onClick={uploadHomepageVideo}>{videoBusy?'Uploading…':'Upload & publish on homepage'}</button>{videoInfo?.video_url&&<button className="danger-link" type="button" disabled={videoBusy} onClick={removeHomepageVideo}>Remove current video</button>}</div></div>
     </section>}
'''
    if anchor not in a: sys.exit('Could not find admin overview panel anchor; no frontend changes written.')
    a = a.replace(anchor, panel + anchor, 1)

if '<Admin onClose={()=>setAdminOpen(false)} onVideoPublished={setHomepageVideo}/>' not in a:
    a = a.replace('<Admin onClose={()=>setAdminOpen(false)}/>', '<Admin onClose={()=>setAdminOpen(false)} onVideoPublished={setHomepageVideo}/>', 1)

# Add public video block after hero section, before trust strip.
if 'className="homepage-video-section"' not in a:
    marker = "</section>\n     <section className=\"trust-strip\">"
    video_block = "</section>\n     {homepageVideo?.video_url&&<section className=\"section homepage-video-section\" style={{paddingTop:24,paddingBottom:24}}><div className=\"section-heading\"><div><span className=\"eyebrow\">FEATURED VIDEO</span><h2>Latest video update</h2></div></div><video key={homepageVideo.updated_at||homepageVideo.video_url} src={homepageVideo.video_url} controls playsInline preload=\"metadata\" style={{display:'block',width:'100%',maxHeight:520,background:'#111',borderRadius:12}}/></section>}\n     <section className=\"trust-strip\">"
    if marker not in a: sys.exit('Could not find homepage hero/trust-strip boundary; no public video section added.')
    a = a.replace(marker, video_block, 1)

server.write_text(s)
app.write_text(a)
print('Patched backend/src/server.js and frontend/src/App.jsx successfully.')
print('Next: install backend cloudinary package, set backend + Netlify environment variables, then build/deploy.')
