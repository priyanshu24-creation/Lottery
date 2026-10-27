import React, { useEffect, useState } from 'react';
import { CalendarDays, Lock, Play, Plus, Save, UsersRound } from 'lucide-react';
import { api } from './api';

const initialGame = { name: '', slug: '', description: '', number_min: 1, number_max: 30, selection_count: 5, entry_cost: 10, prize_info: '[{"matches":5,"points":500},{"matches":4,"points":100},{"matches":3,"points":25}]', is_active: true };
const formatDate = (value) => value ? new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

export default function GamingAdmin({ tab }) {
  const [games, setGames] = useState([]);
  const [draws, setDraws] = useState([]);
  const [entries, setEntries] = useState([]);
  const [users, setUsers] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [gameForm, setGameForm] = useState(initialGame);
  const [editingGame, setEditingGame] = useState(null);
  const [drawForm, setDrawForm] = useState({ game_id: '', draw_at: '', entry_closes_at: '' });
  const [announcementForm, setAnnouncementForm] = useState({ title: '', body: '', is_published: false });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    setLoading(true);
    setError('');
    const endpoint = { games: '/admin/games', draws: '/admin/draws', entries: '/admin/entries', users: '/admin/users', announcements: '/admin/announcements', audit: '/admin/audit-logs' }[tab];
    const request = tab === 'draws' ? Promise.all([api('/admin/draws'), api('/admin/games')]) : api(endpoint);
    request.then((data) => {
      if (tab === 'draws') { setDraws(data[0]); setGames(data[1]); return; }
      if (tab === 'games') setGames(data);
      if (tab === 'draws') setDraws(data);
      if (tab === 'entries') setEntries(data);
      if (tab === 'users') setUsers(data);
      if (tab === 'announcements') setAnnouncements(data);
      if (tab === 'audit') setAuditLogs(data);
    }).catch((loadError) => setError(loadError.message)).finally(() => setLoading(false));
  }, [tab, reload]);

  const updateGame = (field, value) => setGameForm((current) => ({ ...current, [field]: ['number_min', 'number_max', 'selection_count', 'entry_cost'].includes(field) ? Number(value) : value }));
  async function saveGame(event) {
    event.preventDefault();
    setError('');
    try {
      const body = { ...gameForm, rules: { selection: 'unique', match_direction: 'any' }, prize_info: JSON.parse(gameForm.prize_info) };
      await api(`/admin/games${editingGame ? `/${editingGame}` : ''}`, { method: editingGame ? 'PUT' : 'POST', body: JSON.stringify(body) });
      setGameForm(initialGame); setEditingGame(null); setNotice('Game saved.'); setReload((value) => value + 1);
    } catch (saveError) { setError(saveError.message.includes('JSON') ? 'Prize guide must be valid JSON.' : saveError.message); }
  }
  async function deactivateGame(id) {
    if (!confirm('Deactivate this game? Existing entries and draws will remain available.')) return;
    try { await api(`/admin/games/${id}`, { method: 'DELETE' }); setNotice('Game deactivated.'); setReload((value) => value + 1); } catch (actionError) { setError(actionError.message); }
  }
  async function scheduleDraw(event) {
    event.preventDefault();
    setError('');
    try { await api('/admin/draws', { method: 'POST', body: JSON.stringify({ ...drawForm, draw_at: new Date(drawForm.draw_at).toISOString(), entry_closes_at: new Date(drawForm.entry_closes_at).toISOString() }) }); setDrawForm({ game_id: '', draw_at: '', entry_closes_at: '' }); setNotice('Draw scheduled.'); setReload((value) => value + 1); } catch (scheduleError) { setError(scheduleError.message); }
  }
  async function drawAction(id, action) {
    if (action === 'run' && !confirm('Execute this draw now? This cannot be undone.')) return;
    try { const result = await api(`/admin/draws/${id}/${action}`, { method: 'POST' }); setNotice(action === 'run' ? `Draw completed: ${result.winning_numbers?.join(', ') || 'results saved'}.` : 'Entries closed.'); setReload((value) => value + 1); } catch (actionError) { setError(actionError.message); }
  }
  async function saveAnnouncement(event) {
    event.preventDefault();
    try { await api('/admin/announcements', { method: 'POST', body: JSON.stringify(announcementForm) }); setAnnouncementForm({ title: '', body: '', is_published: false }); setNotice('Announcement saved.'); setReload((value) => value + 1); } catch (announcementError) { setError(announcementError.message); }
  }
  if (loading) return <section className="panel loading">Loading gaming workspace…</section>;
  return <div className="gaming-admin">{error&&<div className="alert error-text">{error}</div>}{notice&&<div className="alert success-text">{notice}</div>}
    {tab === 'games'&&<><section className="panel form-panel"><div className="panel-heading"><div><span className="eyebrow">GAME CONFIGURATION</span><h3>{editingGame ? 'Edit game' : 'Create game'}</h3></div><Save size={18}/></div><form className="stack-form" onSubmit={saveGame}><div className="form-grid"><label>Name<input required value={gameForm.name} onChange={(event)=>updateGame('name', event.target.value)}/></label><label>Slug<input required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={gameForm.slug} onChange={(event)=>updateGame('slug', event.target.value)}/></label></div><label>Description<textarea rows="2" value={gameForm.description} onChange={(event)=>updateGame('description', event.target.value)}/></label><div className="form-grid"><label>Minimum number<input type="number" min="0" value={gameForm.number_min} onChange={(event)=>updateGame('number_min', event.target.value)}/></label><label>Maximum number<input type="number" min="1" value={gameForm.number_max} onChange={(event)=>updateGame('number_max', event.target.value)}/></label><label>Numbers to select<input type="number" min="1" value={gameForm.selection_count} onChange={(event)=>updateGame('selection_count', event.target.value)}/></label><label>Entry cost (points)<input type="number" min="1" value={gameForm.entry_cost} onChange={(event)=>updateGame('entry_cost', event.target.value)}/></label></div><label>Prize guide JSON<textarea rows="3" value={gameForm.prize_info} onChange={(event)=>updateGame('prize_info', event.target.value)}/></label><div className="form-actions">{editingGame&&<button type="button" className="secondary-button" onClick={()=>{setEditingGame(null);setGameForm(initialGame)}}>Cancel</button>}<button className="primary-button"><Save size={15}/> Save game</button></div></form></section><section className="panel"><div className="panel-heading"><h3>Games</h3><span className="muted">{games.length} configured</span></div><div className="admin-list">{games.map((game)=><div className="admin-list-row" key={game.id}><div><strong>{game.name}</strong><small>{game.slug} · Pick {game.selection_count} from {game.number_min}–{game.number_max} · {game.entry_count} entries</small></div><div className="row-actions"><button onClick={()=>{setEditingGame(game.id);setGameForm({...game, prize_info: JSON.stringify(game.prize_info)})}}>Edit</button>{game.is_active&&<button className="danger-link" onClick={()=>deactivateGame(game.id)}>Deactivate</button>}</div></div>)}</div></section></>}
    {tab === 'draws'&&<><section className="panel form-panel"><div className="panel-heading"><div><span className="eyebrow">DRAW SCHEDULER</span><h3>Schedule a draw</h3></div><CalendarDays size={18}/></div><form className="stack-form" onSubmit={scheduleDraw}><label>Game<select required value={drawForm.game_id} onChange={(event)=>setDrawForm({...drawForm, game_id:event.target.value})}><option value="">Choose a game</option>{games.map((game)=><option key={game.id} value={game.id}>{game.name}</option>)}</select></label><div className="form-grid"><label>Entry closes<input type="datetime-local" required value={drawForm.entry_closes_at} onChange={(event)=>setDrawForm({...drawForm, entry_closes_at:event.target.value})}/></label><label>Draw time<input type="datetime-local" required value={drawForm.draw_at} onChange={(event)=>setDrawForm({...drawForm, draw_at:event.target.value})}/></label></div><button className="primary-button">Schedule draw</button></form></section><section className="panel"><div className="panel-heading"><h3>Scheduled draws</h3><span className="muted">{draws.length} total</span></div><div className="admin-list">{draws.map((draw)=><div className="admin-list-row" key={draw.id}><div><strong>{draw.game_name}</strong><small>{formatDate(draw.draw_at)} · {draw.entry_count} entries · {draw.status}</small>{draw.winning_numbers&&<small>Winning numbers: {draw.winning_numbers.join(', ')}</small>}</div><div className="row-actions">{draw.status === 'open'&&<button onClick={()=>drawAction(draw.id,'close')}><Lock size={13}/> Close</button>}{draw.status !== 'drawn'&&<button className="primary-button compact-button" onClick={()=>drawAction(draw.id,'run')}><Play size={13}/> Run draw</button>}</div></div>)}</div></section></>}
    {tab === 'entries'&&<section className="panel"><div className="panel-heading"><div><span className="eyebrow">ENTRY REVIEW</span><h3>Submitted entries</h3></div></div><div className="table-wrap"><table><thead><tr><th>User</th><th>Game</th><th>Numbers</th><th>Draw</th><th>Status</th></tr></thead><tbody>{entries.map((entry)=><tr key={entry.id}><td><strong>{entry.user_name}</strong><small>{entry.user_email}</small></td><td>{entry.game_name}</td><td>{entry.numbers.join(', ')}</td><td>{formatDate(entry.draw_at)}</td><td><span className={`status ${entry.status}`}>{entry.status}{entry.prize_points ? ` · +${entry.prize_points}` : ''}</span></td></tr>)}</tbody></table></div></section>}
    {tab === 'users'&&<section className="panel"><div className="panel-heading"><div><span className="eyebrow">PLAYER ACCOUNTS</span><h3>Users</h3></div><UsersRound size={18}/></div><div className="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Points</th><th>Entries</th><th>Joined</th></tr></thead><tbody>{users.map((user)=><tr key={user.id}><td><strong>{user.name}</strong></td><td>{user.email}</td><td>{user.points_balance}</td><td>{user.entry_count}</td><td>{formatDate(user.created_at)}</td></tr>)}</tbody></table></div></section>}
    {tab === 'announcements'&&<><section className="panel form-panel"><div className="panel-heading"><div><span className="eyebrow">PUBLIC UPDATES</span><h3>Publish announcement</h3></div><Plus size={18}/></div><form className="stack-form" onSubmit={saveAnnouncement}><label>Title<input required value={announcementForm.title} onChange={(event)=>setAnnouncementForm({...announcementForm,title:event.target.value})}/></label><label>Message<textarea rows="4" required value={announcementForm.body} onChange={(event)=>setAnnouncementForm({...announcementForm,body:event.target.value})}/></label><label className="checkbox-label"><input type="checkbox" checked={announcementForm.is_published} onChange={(event)=>setAnnouncementForm({...announcementForm,is_published:event.target.checked})}/> Publish publicly now</label><button className="primary-button">Save announcement</button></form></section><section className="panel"><div className="panel-heading"><h3>Announcements</h3></div><div className="admin-list">{announcements.map((announcement)=><div className="admin-list-row" key={announcement.id}><div><strong>{announcement.title}</strong><small>{announcement.body}</small></div><span className={`status ${announcement.is_published ? 'published' : 'draft'}`}>{announcement.is_published ? 'Published' : 'Draft'}</span></div>)}</div></section></>}
    {tab === 'audit'&&<section className="panel"><div className="panel-heading"><div><span className="eyebrow">ACCOUNTABILITY</span><h3>Audit log</h3></div></div><div className="table-wrap"><table><thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead><tbody>{auditLogs.map((log)=><tr key={log.id}><td>{formatDate(log.created_at)}</td><td>{log.admin_email || log.user_email || 'System'}</td><td>{log.action}</td><td>{log.entity_type}</td><td>{JSON.stringify(log.details)}</td></tr>)}</tbody></table></div></section>}
  </div>;
}
