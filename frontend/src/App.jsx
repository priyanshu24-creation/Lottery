import React, { useEffect, useState } from 'react';
import { api, expectArray, expectObject } from './api';
import AccountPage from './Account.jsx';
import GamesPage from './Games.jsx';
import GamingAdmin from './GamingAdmin.jsx';
import { ArrowUpRight, CalendarDays, CheckCircle2, ChevronRight, CircleHelp, Clock3, Eye, EyeOff, FileText, LayoutDashboard, LogOut, Menu, Search, ShieldCheck, Sparkles, Trophy, X } from 'lucide-react';

const fmtDate = (v) => v ? new Date(`${String(v).slice(0,10)}T12:00:00`).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : 'Date pending';
const validateResults = (value, label) => expectArray(value, label).map((result, index) => {
  const item = expectObject(result, `${label} item ${index + 1}`);
  return {
    ...item,
    winning_numbers: expectArray(item.winning_numbers, `${label} winning numbers`),
    prize_info: expectArray(item.prize_info, `${label} prize information`)
  };
});
const validateAdminOverview = (value) => {
  const overview = expectObject(value, 'admin overview');
  return { ...overview, recent: expectArray(overview.recent, 'admin recent results') };
};

function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const links = <><a href="/">Home</a><a href="/#latest">Latest Results</a><a href="/#schedule">Lottery Schedule</a><a href="/games">Games</a><a href="/#about">About</a><a href="/account">My Account</a></>;
  return <><header className="topbar"><a className="brand" href="/"><span className="brand-mark">D</span><span>Drawline<small>LOTTERY RESULTS</small></span></a><nav>{links}</nav><button className="mobile-menu-button" onClick={()=>setMenuOpen((open)=>!open)} aria-label={menuOpen?'Close navigation':'Open navigation'}>{menuOpen?<X size={20}/>:<Menu size={20}/>}</button>{menuOpen&&<nav className="mobile-nav" onClick={()=>setMenuOpen(false)}>{links}</nav>}</header><div className="announcement-bar" role="status"><marquee behavior="scroll" direction="left" scrollAmount="6">LOTTERY DRAW TIMINGS: 1:00 PM | 6:00 PM | 8:00 PM DAILY — CHECK THE LATEST RESULTS AFTER EACH DRAW</marquee></div></>;
}

function SiteFooter() {
  return <footer className="simple-footer"><div><strong>Drawline</strong><span>Lottery results and schedule information.</span></div><nav><a href="/">Home</a><a href="/#latest">Latest Results</a><a href="/#schedule">Schedule</a><a href="/#about">About</a></nav><p>For information only. Always verify results with the official lottery source.</p></footer>;
}

const drawTimes = [
  { label: '1:00 PM', hour: 13 },
  { label: '6:00 PM', hour: 18 },
  { label: '8:00 PM', hour: 20 }
];

const localDateKey = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(`${String(value).slice(0, 10)}T12:00:00`);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

function getScheduleStatus(drawTime, results) {
  const today = localDateKey();
  const published = results.find((result) => localDateKey(result.draw_date) === today && String(result.draw_label || '').toLowerCase().includes(`${drawTime.hour} pm`));
  if (published) return { label: 'Result published', className: 'published' };
  const now = new Date();
  const drawAt = new Date(now);
  drawAt.setHours(drawTime.hour, 0, 0, 0);
  return now < drawAt ? { label: 'Upcoming', className: 'upcoming' } : { label: 'Awaiting result', className: 'pending' };
}

function ResultsTable({ results, onView }) {
  return <div className="table-scroll"><table className="results-table"><thead><tr><th>Lottery Name</th><th>Draw Date</th><th>Draw Time</th><th>Winning Numbers</th><th>Result Status</th><th>View Details</th></tr></thead><tbody>{results.length === 0 ? <tr><td colSpan="6" className="empty-cell">No published lottery results found.</td></tr> : results.map((result) => <tr key={result.id}><td><strong>{result.lottery_name}</strong></td><td>{fmtDate(result.draw_date)}</td><td>{result.draw_label || 'Time not provided'}</td><td className="winning-number-cell">{result.winning_numbers.length ? result.winning_numbers.join(', ') : 'Not published'}</td><td><span className="status published">Published</span></td><td><button className="table-link" onClick={() => onView(result)}>View details</button></td></tr>)}</tbody></table></div>;
}

function TraditionalPublicSite() {
  const [results, setResults] = useState([]), [lotteries, setLotteries] = useState([]), [games, setGames] = useState([]), [query, setQuery] = useState(''), [loading, setLoading] = useState(true), [error, setError] = useState(''), [selected, setSelected] = useState(null), [videoFailed, setVideoFailed] = useState(false);

  async function load(search = '') {
    setLoading(true);
    setError('');
    try {
      const [resultResponse, lotteryResponse, gameResponse] = await Promise.all([api(`/results?limit=50&search=${encodeURIComponent(search)}`), api('/lotteries'), api('/games')]);
      const availableGames = expectArray(gameResponse, 'games');
      const gamesWithHistory = await Promise.all(availableGames.map(async (game) => {
        try {
          const details = expectObject(await api(`/games/${encodeURIComponent(game.slug)}`), `${game.name} game details`);
          const draws = expectArray(details.draws, `${game.name} game draws`);
          return { ...game, latestResult: draws.find((draw) => draw.status === 'drawn') || null };
        } catch {
          return { ...game, latestResult: null };
        }
      }));
      setResults(validateResults(resultResponse, 'published results'));
      setLotteries(expectArray(lotteryResponse, 'lotteries'));
      setGames(gamesWithHistory);
    } catch (loadError) {
      setError(`${loadError.message} Start the backend locally or redeploy the unified Vercel application.`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return <main className="traditional-page">
    <section className="poster-video-section" aria-label="Drawline lottery video"><div className="poster-video-frame">{videoFailed ? <div className="poster-video-fallback">Lottery draw video is temporarily unavailable.</div> : <video autoPlay muted defaultMuted loop playsInline preload="auto" aria-label="Drawline lottery draw video" onError={() => setVideoFailed(true)}><source src="/assets/lottery-draw.mp4" type="video/mp4"/>Your browser does not support this video.</video>}</div></section>
    <section className="portal-intro"><h1>Welcome to Drawline Lottery Results</h1><p>Check published lottery results, winning numbers, draw dates, and upcoming draw schedules in one place.</p></section>
    <section id="latest" className="portal-section"><div className="section-heading"><div><h2>Latest Lottery Results</h2><p>Only verified and published results are shown.</p></div><form className="simple-search" onSubmit={(event) => { event.preventDefault(); load(query); }}><label htmlFor="result-search">Search results</label><div><input id="result-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Lottery name, date or draw time"/><button type="submit">Search</button></div></form></div>{error && <div className="alert error-text" role="alert">{error}</div>}{loading ? <div className="loading">Loading lottery results…</div> : <ResultsTable results={results} onView={setSelected}/>}</section>
    <section id="schedule" className="portal-section"><h2>Today's Lottery Schedule</h2><p>Results are shown only after the draw is complete and the official result is published.</p><div className="table-scroll"><table className="schedule-table"><thead><tr><th>Draw Time</th><th>Status</th><th>Information</th></tr></thead><tbody>{drawTimes.map((drawTime) => { const status = getScheduleStatus(drawTime, results); return <tr key={drawTime.label}><td><strong>{drawTime.label}</strong></td><td><span className={`status ${status.className}`}>{status.label}</span></td><td>{status.className === 'published' ? 'Published results are available above.' : status.className === 'upcoming' ? 'Please check again after the draw.' : 'Waiting for a verified result.'}</td></tr>; })}</tbody></table></div></section>
    <section id="games" className="portal-section"><h2>Lottery Games</h2><p>Available games and their latest information from Drawline.</p><div className="table-scroll"><table className="games-table"><thead><tr><th>Game Name</th><th>Draw Schedule</th><th>Latest Available Result</th><th>History</th></tr></thead><tbody>{games.length === 0 ? <tr><td colSpan="4" className="empty-cell">No games are available right now.</td></tr> : games.map((game) => <tr key={game.id}><td><strong>{game.name}</strong><small>{game.description || 'Drawline game'}</small></td><td>{game.draw_at ? new Date(game.draw_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'Schedule pending'}</td><td>{game.latestResult?.winning_numbers?.length ? game.latestResult.winning_numbers.join(', ') : 'No result yet'}</td><td><a className="table-link" href={`/games/${game.slug}`}>View history</a></td></tr>)}</tbody></table></div></section>
    <section id="about" className="portal-section about-simple"><h2>About Drawline</h2><p>Drawline is an information portal. It does not sell tickets or accept bets. Please check every result with the authorized lottery source before making any decision.</p></section>
    <section className="simple-disclaimer"><strong>Important:</strong> Lottery results can change. Use the official published result as the final source of information.</section>
    <ResultModal result={selected} close={() => setSelected(null)}/>
  </main>;
}

function ResultCard({ result, onClick }) {
  return <button className="result-card" onClick={() => onClick(result)}>
    <div className="card-top"><span className="pill"><CheckCircle2 size={13}/> Published</span><span className="card-date">{fmtDate(result.draw_date)}</span></div>
    <h3>{result.lottery_name}</h3><p className="draw-label">{result.draw_label || 'Official draw result'}</p>
    <div className="numbers">{result.winning_numbers.slice(0,5).map((n,i)=><span key={`${n}-${i}`}>{n}</span>)}{result.winning_numbers.length===0&&<span className="empty-number">Numbers unavailable</span>}</div>
    <div className="card-bottom"><span>View result details</span><ArrowUpRight size={17}/></div>
  </button>;
}

function ResultModal({ result, close }) {
  if (!result) return null;
  return <div className="modal-backdrop" onClick={close}><section className="modal" onClick={e=>e.stopPropagation()}><button className="icon-button modal-close" onClick={close}><X/></button><span className="eyebrow">PUBLISHED RESULT</span><h2>{result.lottery_name}</h2><p className="muted">{fmtDate(result.draw_date)} {result.draw_label ? `· ${result.draw_label}` : ''}</p><h4>Winning numbers</h4><div className="numbers modal-numbers">{result.winning_numbers.map((n,i)=><span key={`${n}-${i}`}>{n}</span>)}</div>{result.prize_info.length>0&&<><h4>Prize information</h4><div className="prize-list">{result.prize_info.map((p,i)=><div key={i}><span>{p.label}</span><strong>{p.value}</strong></div>)}</div></>}{result.source_name&&<p className="source">Source: {result.source_url?<a href={result.source_url} target="_blank" rel="noreferrer">{result.source_name}</a>:result.source_name}</p>}<p className="fine-print">Always confirm important information with the original authorized source. This portal is informational.</p></section></div>;
}

function Admin({ onClose, onAuthenticated, onUnauthenticated }) {
  const [admin,setAdmin]=useState(null), [email,setEmail]=useState(''), [password,setPassword]=useState('');
  const [error,setError]=useState(''), [loading,setLoading]=useState(false), [showPassword,setShowPassword]=useState(false), [tab,setTab]=useState('overview');
  const [overview,setOverview]=useState(null), [lotteries,setLotteries]=useState([]), [results,setResults]=useState([]);
  const [editing,setEditing]=useState(null), [lotteryForm,setLotteryForm]=useState({name:'',slug:'',description:'',draw_schedule:'',is_active:true});
  const [resultForm,setResultForm]=useState({lottery_id:'',draw_date:new Date().toISOString().slice(0,10),draw_label:'',winning_numbers:'',prize_info:'',status:'draft',source_name:'',source_url:'',verification_notes:''});
  const [notice,setNotice]=useState('');
  async function loadAdmin() {
    try { const me=expectObject(await api('/admin/me'),'admin session');const [o,l,r]=await Promise.all([api('/admin/overview'),api('/admin/lotteries'),api('/admin/results')]);setAdmin(expectObject(me.admin,'admin session'));setOverview(validateAdminOverview(o));setLotteries(expectArray(l,'admin lotteries'));setResults(validateResults(r,'admin results'));onAuthenticated?.(); }
    catch { setAdmin(null);onUnauthenticated?.(); }
  }
  useEffect(()=>{loadAdmin()},[]);
  async function login(e){e.preventDefault();setLoading(true);setError('');setAdmin(null);try{const d=expectObject(await api('/admin/login',{method:'POST',body:JSON.stringify({email,password})}),'admin login');const [o,l,r]=await Promise.all([api('/admin/overview'),api('/admin/lotteries'),api('/admin/results')]);setAdmin(expectObject(d.admin,'admin login'));setOverview(validateAdminOverview(o));setLotteries(expectArray(l,'admin lotteries'));setResults(validateResults(r,'admin results'));onAuthenticated?.()}catch(e){setError(e.message)}finally{setLoading(false)}}
  async function logout(){try{await api('/admin/logout',{method:'POST'})}finally{setAdmin(null);setOverview(null);onUnauthenticated?.()}}
  function resetResult(){setEditing(null);setResultForm({lottery_id:lotteries[0]?.id||'',draw_date:new Date().toISOString().slice(0,10),draw_label:'',winning_numbers:'',prize_info:'',status:'draft',source_name:'',source_url:'',verification_notes:''})}
  function editResult(r){setEditing(r.id);setResultForm({lottery_id:r.lottery_id,draw_date:String(r.draw_date).slice(0,10),draw_label:r.draw_label||'',winning_numbers:r.winning_numbers.join(', '),prize_info:r.prize_info.map(p=>`${p.label}: ${p.value}`).join('\n'),status:r.status,source_name:r.source_name||'',source_url:r.source_url||'',verification_notes:r.verification_notes||''});setTab('result-form')}
  async function saveResult(e){e.preventDefault();setError('');setNotice('');try{
    const winning_numbers=resultForm.winning_numbers.split(',').map(s=>s.trim()).filter(Boolean);
    const prize_info=resultForm.prize_info.split('\n').map(s=>s.trim()).filter(Boolean).map(line=>{const i=line.indexOf(':');return {label:i<0?line:line.slice(0,i).trim(),value:i<0?'':line.slice(i+1).trim()}});
    const body={...resultForm,winning_numbers,prize_info};
    await api(`/admin/results${editing?`/${editing}`:''}`,{method:editing?'PUT':'POST',body:JSON.stringify(body)});
    const [o,r]=await Promise.all([api('/admin/overview'),api('/admin/results')]);setOverview(validateAdminOverview(o));setResults(validateResults(r,'admin results'));resetResult();setTab('results');setNotice('Result saved. Published results are visible on the public site.');}
    catch(e){setError(e.message)}}
  async function saveLottery(e){e.preventDefault();setError('');try{const body=lotteryForm;await api(`/admin/lotteries${editing?`/${editing}`:''}`,{method:editing?'PUT':'POST',body:JSON.stringify(body)});const l=await api('/admin/lotteries');setLotteries(expectArray(l,'admin lotteries'));setEditing(null);setLotteryForm({name:'',slug:'',description:'',draw_schedule:'',is_active:true});setNotice('Lottery category saved.');setTab('lotteries')}catch(e){setError(e.message)}}
  async function deleteResult(id){if(!confirm('Permanently delete this result? This cannot be undone.'))return;try{await api(`/admin/results/${id}`,{method:'DELETE'});setResults(validateResults(await api('/admin/results'),'admin results'));setOverview(validateAdminOverview(await api('/admin/overview')));setNotice('Result deleted.')}catch(e){setError(e.message)}}
  async function deactivateLottery(id){if(!confirm('Deactivate this category? It will no longer appear publicly.'))return;try{await api(`/admin/lotteries/${id}`,{method:'DELETE'});setLotteries(expectArray(await api('/admin/lotteries'),'admin lotteries'));setNotice('Category deactivated.')}catch(e){setError(e.message)}}
  const nav=[['overview','Overview',LayoutDashboard],['results','Results',Trophy],['result-form','Add result',FileText],['lotteries','Categories',Sparkles],['lottery-form','Add category',CalendarDays],['games','Games',Sparkles],['draws','Draws',CalendarDays],['entries','Entries',FileText],['users','Users',CircleHelp],['announcements','Announcements',FileText],['audit','Audit log',FileText]];
  if(!admin) return <div className="admin-overlay"><section className="login-box"><button className="icon-button close-admin" onClick={onClose} aria-label="Return to public site"><X/></button><div className="login-mark"><ShieldCheck size={25}/></div><span className="eyebrow">SECURE ACCESS</span><h2>Admin sign in</h2><p className="muted">Manage published results and draw information.</p><form onSubmit={login} className="stack-form"><label>Email address<input type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} required/></label><label>Password<div className="password-field"><input type={showPassword?'text':'password'} autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required/><button type="button" onClick={()=>setShowPassword(value=>!value)} aria-label={showPassword?'Hide password':'Show password'}>{showPassword?<EyeOff size={17}/>:<Eye size={17}/>}</button></div></label>{error&&<p className="error-text" role="alert">{error}</p>}<button className="primary-button full" disabled={loading} aria-busy={loading}>{loading?<><span className="button-spinner" aria-hidden="true"/> Signing in…</>:'Sign in securely'}</button></form><p className="login-hint">Initial credentials are configured by the site operator on the server.</p></section></div>;
  return <div className="admin-overlay admin-mode"><div className="admin-shell"><aside className="admin-sidebar"><a className="brand admin-brand" href="#"><span className="brand-mark">D</span><span>drawline<small>ADMIN CONSOLE</small></span></a><div className="admin-welcome"><span className="avatar">{String(admin.email || '?').slice(0,1).toUpperCase()}</span><div><strong>Administrator</strong><small>{admin.email}</small></div></div><nav className="side-nav">{nav.map(([id,label,Icon])=><button key={id} className={tab===id?'active':''} onClick={()=>{setTab(id);setError('');setNotice('');if(id==='result-form')resetResult();if(id==='lottery-form'){setEditing(null);setLotteryForm({name:'',slug:'',description:'',draw_schedule:'',is_active:true})}}}><Icon size={17}/>{label}</button>)}</nav><button className="side-logout" onClick={logout}><LogOut size={17}/> Sign out</button></aside>
    <main className="admin-main"><div className="admin-top"><div><span className="eyebrow">WORKSPACE / {tab.replace('-',' ').toUpperCase()}</span><h1>{nav.find(n=>n[0]===tab)?.[1]||'Admin'}</h1></div><button className="icon-button" onClick={onClose} aria-label="Close admin"><X/></button></div>
    {error&&<div className="alert error-text">{error}</div>}{notice&&<div className="alert success-text">{notice}</div>}
    {['games','draws','entries','users','announcements','audit'].includes(tab)&&<GamingAdmin tab={tab}/>} 
    {tab==='overview'&&<>{overview&&<div className="stats-grid"><div className="stat"><span>Categories</span><strong>{overview.lotteries}</strong><small>Lottery categories</small></div><div className="stat"><span>Published results</span><strong>{overview.published}</strong><small>Visible to the public</small></div><div className="stat"><span>Draft results</span><strong>{overview.drafts}</strong><small>Not visible publicly</small></div></div>}<section className="panel"><div className="panel-heading"><h3>Recently updated</h3><button className="text-button" onClick={()=>setTab('results')}>All results <ChevronRight size={15}/></button></div><AdminResults rows={overview?.recent||[]} compact onEdit={id=>{const r=results.find(x=>x.id===id);if(r)editResult(r)}}/></section><div className="notice-box"><ShieldCheck size={20}/><div><strong>Publishing checklist</strong><p>Confirm the draw date, winning numbers, and official source before changing a result to Published.</p></div></div></>}
    {tab==='results'&&<section className="panel"><div className="panel-heading"><h3>All results</h3><button className="primary-button" onClick={()=>{resetResult();setTab('result-form')}}>+ Add result</button></div><AdminResults rows={results} onEdit={editResult} onDelete={deleteResult}/></section>}
    {tab==='result-form'&&<section className="panel form-panel"><h3>{editing?'Edit result':'Create result'}</h3><p className="muted">Only publish data after checking an official source.</p><form className="stack-form" onSubmit={saveResult}><div className="form-grid"><label>Lottery category<select required value={resultForm.lottery_id} onChange={e=>setResultForm({...resultForm,lottery_id:e.target.value})}><option value="">Choose category</option>{lotteries.filter(l=>l.is_active).map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select></label><label>Draw date<input type="date" required value={resultForm.draw_date} onChange={e=>setResultForm({...resultForm,draw_date:e.target.value})}/></label></div><label>Draw label<input value={resultForm.draw_label} onChange={e=>setResultForm({...resultForm,draw_label:e.target.value})} placeholder="e.g. 1 PM draw"/></label><label>Winning numbers <small className="muted">(comma-separated; exact official format)</small><input value={resultForm.winning_numbers} onChange={e=>setResultForm({...resultForm,winning_numbers:e.target.value})} placeholder="e.g. 123456, 789012" required/></label><label>Prize information <small className="muted">(one entry per line: Prize label: value)</small><textarea rows="3" value={resultForm.prize_info} onChange={e=>setResultForm({...resultForm,prize_info:e.target.value})} placeholder={'First prize: Verify official notice\\nSecond prize: Verify official notice'}/></label><div className="form-grid"><label>Source name<input value={resultForm.source_name} onChange={e=>setResultForm({...resultForm,source_name:e.target.value})} placeholder="Official publisher"/></label><label>Source URL<input type="url" value={resultForm.source_url} onChange={e=>setResultForm({...resultForm,source_url:e.target.value})} placeholder="https://…"/></label></div><label>Verification notes<textarea rows="2" value={resultForm.verification_notes} onChange={e=>setResultForm({...resultForm,verification_notes:e.target.value})}/></label><label>Status<select value={resultForm.status} onChange={e=>setResultForm({...resultForm,status:e.target.value})}><option value="draft">Draft — hidden from public</option><option value="published">Published — visible publicly</option></select></label><div className="form-actions"><button type="button" className="secondary-button" onClick={()=>{resetResult();setTab('results')}}>Cancel</button><button className="primary-button">Save result</button></div></form></section>}
    {tab==='lotteries'&&<section className="panel"><div className="panel-heading"><h3>Categories</h3><button className="primary-button" onClick={()=>{setEditing(null);setLotteryForm({name:'',slug:'',description:'',draw_schedule:'',is_active:true});setTab('lottery-form')}}>+ Add category</button></div><div className="table-wrap"><table><thead><tr><th>Name</th><th>Slug</th><th>Schedule</th><th>Status</th><th>Action</th></tr></thead><tbody>{lotteries.map(l=><tr key={l.id}><td><strong>{l.name}</strong><small>{l.description}</small></td><td>{l.slug}</td><td>{l.draw_schedule||'—'}</td><td><span className={`status ${l.is_active?'published':'draft'}`}>{l.is_active?'Active':'Inactive'}</span></td><td><div className="row-actions"><button onClick={()=>{setEditing(l.id);setLotteryForm({name:l.name,slug:l.slug,description:l.description||'',draw_schedule:l.draw_schedule||'',is_active:l.is_active});setTab('lottery-form')}}>Edit</button>{l.is_active&&<button className="danger-link" onClick={()=>deactivateLottery(l.id)}>Deactivate</button>}</div></td></tr>)}</tbody></table></div></section>}
    {tab==='lottery-form'&&<section className="panel form-panel"><h3>{editing?'Edit category':'Create category'}</h3><form className="stack-form" onSubmit={saveLottery}><label>Category name<input required value={lotteryForm.name} onChange={e=>setLotteryForm({...lotteryForm,name:e.target.value,slug:editing?lotteryForm.slug:e.target.value.toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')})}/></label><label>URL slug<input required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={lotteryForm.slug} onChange={e=>setLotteryForm({...lotteryForm,slug:e.target.value})}/></label><label>Description<textarea rows="3" value={lotteryForm.description} onChange={e=>setLotteryForm({...lotteryForm,description:e.target.value})}/></label><label>Draw schedule<input value={lotteryForm.draw_schedule} onChange={e=>setLotteryForm({...lotteryForm,draw_schedule:e.target.value})} placeholder="Only enter a verified schedule"/></label><label className="checkbox-label"><input type="checkbox" checked={lotteryForm.is_active} onChange={e=>setLotteryForm({...lotteryForm,is_active:e.target.checked})}/> Active and visible publicly</label><div className="form-actions"><button type="button" className="secondary-button" onClick={()=>setTab('lotteries')}>Cancel</button><button className="primary-button">Save category</button></div></form></section>}
    </main></div></div>;
}

function AdminResults({rows,onEdit,onDelete,compact=false}) {
  return <div className="table-wrap"><table><thead><tr><th>Lottery / Draw</th><th>Date</th><th>Status</th>{!compact&&<th>Action</th>}</tr></thead><tbody>{rows.length===0?<tr><td colSpan={compact?3:4} className="empty-cell">No results yet. Add a result after verifying the source.</td></tr>:rows.map(r=><tr key={r.id}><td><strong>{r.lottery_name}</strong><small>{r.draw_label||'Draw result'}</small></td><td>{fmtDate(r.draw_date)}</td><td><span className={`status ${r.status}`}>{r.status}</span></td>{!compact&&<td><div className="row-actions"><button onClick={()=>onEdit(r)}>Edit</button><button className="danger-link" onClick={()=>onDelete(r.id)}>Delete</button></div></td>}</tr>)}</tbody></table></div>;
}

function PublicSite() {
  const [results,setResults]=useState([]),[lotteries,setLotteries]=useState([]),[query,setQuery]=useState(''),[loading,setLoading]=useState(true),[error,setError]=useState(''),[selected,setSelected]=useState(null),[videoFailed,setVideoFailed]=useState(false);
  async function load(q=''){setLoading(true);setError('');try{const [r,l]=await Promise.all([api(`/results?limit=50&search=${encodeURIComponent(q)}`),api('/lotteries')]);setResults(validateResults(r,'published results'));setLotteries(expectArray(l,'lotteries'));}catch(e){setError(`${e.message} Start the backend locally or redeploy the unified Vercel application.`)}finally{setLoading(false)}}
  useEffect(()=>{load()},[]);
  return <><Header/><main>
    <section className="hero"><div className="hero-copy"><span className="hero-kicker"><span/> CHECK LOTTERY RESULTS</span><h1>Check results.<br/><em>Simply and clearly.</em></h1><p>Find the latest lottery results, winning numbers, and draw dates in one simple place.</p><div className="hero-actions"><a className="primary-button" href="#latest">See latest results <ArrowUpRight size={17}/></a><a className="quiet-link" href="#about">How to use <ChevronRight size={16}/></a></div><div className="hero-trust"><ShieldCheck size={17}/><span>Clear information from verified sources.</span></div></div><div className={`hero-art ${videoFailed?'video-fallback-art':''}`}><div className="art-orbit orbit-one"></div><div className="art-orbit orbit-two"></div>{videoFailed?<div className="hero-video-frame hero-video-fallback"><div className="ticket-illustration"><div className="ticket-brand"><span className="brand-mark">D</span><span>DRAWLINE</span><span className="ticket-check"><CheckCircle2 size={18}/></span></div><div className="ticket-line"></div><div className="ticket-caption">RESULT SNAPSHOT</div><div className="ticket-balls"><span>08</span><span>14</span><span>27</span><span>36</span></div><div className="ticket-footer"><span>Verified source required</span><Sparkles size={15}/></div></div></div>:<div className="hero-video-frame"><video autoPlay muted defaultMuted loop playsInline preload="auto" aria-label="Lottery draw video" onError={()=>setVideoFailed(true)}><source src="/assets/lottery-draw.mp4" type="video/mp4"/>Your browser does not support the lottery draw video.</video><span className="video-label">LOTTERY DRAW</span><span className="video-sound">SOUND OFF</span></div>}<div className="floating-note"><CheckCircle2 size={17}/><div><strong>Clarity first</strong><small>Results with context</small></div></div><div className="floating-date"><CalendarDays size={17}/><div><small>ARCHIVE</small><strong>By draw date</strong></div></div></div><div className="hero-index">INFORMATION PORTAL <span>—</span> 01 / 03</div></section>
    <section className="trust-strip"><div><ShieldCheck/><span><strong>Source-aware</strong><small>Look for official references</small></span></div><div><Clock3/><span><strong>Easy to scan</strong><small>Dates and numbers in view</small></span></div><div><FileText/><span><strong>Result archive</strong><small>Past published records</small></span></div><div><CircleHelp/><span><strong>Informational</strong><small>No ticket sales on this site</small></span></div></section>
    <section id="latest" className="section latest-section"><div className="section-heading"><div><span className="eyebrow">THE LATEST</span><h2>Recently published</h2><p>Browse the most recent results available in the portal.</p></div><div className="search-box"><Search size={17}/><input aria-label="Search results" value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>e.key==='Enter'&&load(query)} placeholder="Search results"/><button onClick={()=>load(query)}>Search</button></div></div>{error&&<div className="alert error-text">{error}</div>}{loading?<div className="loading">Loading published results…</div>:results.length===0?<div className="empty-state"><div className="empty-icon"><Trophy/></div><h3>No published results yet</h3><p>When an administrator verifies and publishes a result, it will appear here.</p></div>:<div className="results-grid">{results.slice(0,6).map(r=><ResultCard key={r.id} result={r} onClick={setSelected}/>)}</div>}<div className="section-footer"><span>Showing published records only</span><span className="status published"><CheckCircle2 size={13}/> PUBLIC VIEW</span></div></section>
    <section id="schedule" className="section schedule-section"><div className="schedule-intro"><span className="eyebrow">PLAN YOUR LOOKUP</span><h2>Know where to look.</h2><p>Schedules can change. Confirm draw timings with the official organizer before relying on them.</p><div className="schedule-note"><Clock3 size={18}/><span>Only administrator-verified schedules should be shown as current.</span></div></div><div className="schedule-list">{lotteries.length===0?<div className="schedule-row"><span className="schedule-icon"><CalendarDays/></span><div><strong>Schedule information pending</strong><small>Verified categories will appear here.</small></div><span className="muted">—</span></div>:lotteries.map(l=><div className="schedule-row" key={l.id}><span className="schedule-icon"><CalendarDays/></span><div><strong>{l.name}</strong><small>{l.description||'Check the official source for details.'}</small></div><span className="schedule-time">{l.draw_schedule||'Check official source'}</span></div>)}</div></section>
    <section id="about" className="about-section"><div className="about-mark"><span className="brand-mark">D</span></div><div><span className="eyebrow">OUR APPROACH</span><h2>Useful information, without the noise.</h2><p>Drawline is designed as a results information portal. Published numbers should be checked against the authorized source, and corrections should be clearly handled. This website does not sell tickets, accept wagers, or guarantee outcomes.</p></div><div className="about-aside"><ShieldCheck size={22}/><strong>Check the source.</strong><span>Never treat a third-party listing as the final authority.</span></div></section>
    <section className="disclaimer"><strong>Important information</strong><p>This is a website starter template. Sample artwork numbers are decorative and are not lottery results. No actual draw results are included. The operator must verify all published information, confirm legal requirements for the relevant jurisdiction, and provide accurate privacy, contact and disclaimer pages before launch.</p></section>
  </main><footer className="footer"><a className="brand footer-brand" href="#"><span className="brand-mark">D</span><span>drawline<span className="brand-dot">.</span><small>RESULTS, CLEARLY</small></span></a><span>© {new Date().getFullYear()} Drawline. Informational use only.</span><div><a href="#about">About</a><a href="#about">Privacy</a><a href="#about">Disclaimer</a></div></footer><ResultModal result={selected} close={()=>setSelected(null)}/></>;
}

const currentPath = () => window.location.pathname.replace(/\/+$/, '') || '/';

export default function App() {
  const [path, setPath] = useState(currentPath);

  useEffect(() => {
    const handlePopState = () => setPath(currentPath());
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  function navigate(nextPath) {
    if (currentPath() === nextPath) return;
    window.history.pushState({}, '', nextPath);
    setPath(nextPath);
  }

  if (path === '/admin' || path === '/admin/dashboard') return <Admin onClose={() => navigate('/')} onAuthenticated={() => navigate('/admin/dashboard')} onUnauthenticated={() => navigate('/admin')}/>;
  if (path === '/games' || path.startsWith('/games/')) return <><Header/><GamesPage slug={path.startsWith('/games/') ? decodeURIComponent(path.slice('/games/'.length)) : ''}/><SiteFooter/></>;
  if (path === '/account') return <><Header/><AccountPage/><SiteFooter/></>;
  return <><Header/><TraditionalPublicSite/><SiteFooter/></>;
}
