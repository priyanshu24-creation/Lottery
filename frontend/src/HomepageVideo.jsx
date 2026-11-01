import React, { useEffect, useState } from 'react';
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
