import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, Clock3, Dices, LogIn, Sparkles, Trophy } from 'lucide-react';
import { api, expectArray, expectObject } from './api';

const formatDate = (value) => value ? new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'Schedule pending';

function Countdown({ target }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const remaining = Math.max(0, new Date(target).getTime() - now);
  const totalSeconds = Math.floor(remaining / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return <strong className="countdown">{days > 0 ? `${days}d ` : ''}{String(hours).padStart(2, '0')}:{String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}</strong>;
}

function GameCard({ game }) {
  return <article className="game-card">
    <div className="game-card-icon"><Sparkles size={20}/></div>
    <span className="eyebrow">VIRTUAL POINTS GAME</span>
    <h2>{game.name}</h2>
    <p>{game.description}</p>
    <div className="game-meta"><span>Pick {game.selection_count}</span><span>{game.number_min}–{game.number_max}</span><span>{game.entry_cost} points</span></div>
    {game.draw_at ? <div className="game-next-draw"><Clock3 size={16}/><span>Next draw <strong>{formatDate(game.draw_at)}</strong></span></div> : <div className="game-next-draw"><Clock3 size={16}/><span>Next draw <strong>Schedule pending</strong></span></div>}
    <a className="primary-button" href={`/games/${game.slug}`}>Play this game <ArrowLeft size={16} className="flip-icon"/></a>
  </article>;
}

function GameDetails({ game, user }) {
  const [selected, setSelected] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const draws = game.draws;
  const upcomingDraw = useMemo(() => draws.find((draw) => draw.status === 'open' && new Date(draw.draw_at) > new Date()), [draws]);
  const numbers = Array.from({ length: game.number_max - game.number_min + 1 }, (_, index) => game.number_min + index);
  const toggleNumber = (number) => {
    setError('');
    setMessage('');
    setSelected((current) => current.includes(number) ? current.filter((value) => value !== number) : current.length < game.selection_count ? [...current, number] : current);
  };
  const randomize = () => {
    const pool = [...numbers];
    const result = [];
    while (result.length < game.selection_count) result.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    setSelected(result.sort((a, b) => a - b));
    setError('');
    setMessage('Random selection ready.');
  };
  async function submitEntry() {
    setError('');
    setMessage('');
    if (!user) return setError('Sign in to submit a virtual-points entry.');
    if (!upcomingDraw) return setError('There is no open draw available right now.');
    if (selected.length !== game.selection_count) return setError(`Choose exactly ${game.selection_count} numbers.`);
    try {
      await api(`/games/${game.id}/entries`, { method: 'POST', body: JSON.stringify({ draw_id: upcomingDraw.id, numbers: selected }) });
      setMessage('Entry submitted. Good luck! Your virtual points were deducted securely.');
      setSelected([]);
    } catch (submissionError) {
      setError(submissionError.message);
    }
  }
  return <>
    <a className="back-link" href="/games"><ArrowLeft size={15}/> All games</a>
    <div className="game-detail-heading"><div><span className="eyebrow">DRAWLINE GAME</span><h1>{game.name}</h1><p>{game.description}</p></div><div className="game-cost"><span>Entry cost</span><strong>{game.entry_cost} points</strong></div></div>
    <div className="game-detail-grid">
      <section className="panel selection-panel"><div className="panel-heading"><div><span className="eyebrow">NUMBER SELECTION</span><h2>Choose your numbers</h2></div><button className="secondary-button" onClick={randomize}><Dices size={15}/> Random pick</button></div><p className="muted">Select {game.selection_count} unique numbers from {game.number_min} to {game.number_max}.</p><div className="number-picker">{numbers.map((number) => <button key={number} className={selected.includes(number) ? 'number-choice selected' : 'number-choice'} onClick={() => toggleNumber(number)}>{number}</button>)}</div><div className="selection-summary"><span>{selected.length} / {game.selection_count} selected</span><div className="selected-numbers">{selected.map((number) => <span key={number}>{number}</span>)}</div></div>{error&&<div className="alert error-text" role="alert">{error}</div>}{message&&<div className="alert success-text" role="status">{message}</div>}{user ? <button className="primary-button full" onClick={submitEntry} disabled={!upcomingDraw}>Submit entry <CheckCircle2 size={16}/></button> : <a className="primary-button full" href="/account"><LogIn size={16}/> Sign in to play</a>}</section>
      <aside className="game-side-column"><section className="panel draw-panel"><span className="eyebrow">NEXT DRAW</span>{upcomingDraw ? <><h3>Entries close before the draw</h3><div className="draw-time"><Clock3 size={18}/><strong>{formatDate(upcomingDraw.draw_at)}</strong></div><Countdown target={upcomingDraw.draw_at}/><p className="muted">Entry closes {formatDate(upcomingDraw.entry_closes_at)}.</p></> : <><h3>Schedule pending</h3><p className="muted">An administrator will open the next draw when the schedule is verified.</p></>}</section><section className="panel prize-panel"><span className="eyebrow">PRIZE GUIDE</span><h3>Virtual points only</h3>{(game.prize_info || []).sort((a, b) => b.matches - a.matches).map((prize) => <div className="prize-row" key={`${prize.matches}-${prize.points}`}><span>{prize.matches} matches</span><strong>{prize.points} points</strong></div>)}<p className="fine-print">Points have no monetary value and cannot be deposited, withdrawn, or exchanged.</p></section></aside>
    </div>
    <section className="section compact-section"><div className="section-heading"><div><span className="eyebrow">DRAW HISTORY</span><h2>Previous results</h2></div></div>{draws.filter((draw) => draw.status === 'drawn').length === 0 ? <div className="empty-state"><div className="empty-icon"><Trophy/></div><h3>No results yet</h3><p>Completed draws will appear here.</p></div> : <div className="draw-history">{draws.filter((draw) => draw.status === 'drawn').map((draw) => <div className="draw-history-row" key={draw.id}><div><strong>{formatDate(draw.draw_at)}</strong><small>Completed draw</small></div><div className="winning-numbers">{(draw.winning_numbers || []).map((number) => <span key={number}>{number}</span>)}</div></div>)}</div>}</section>
  </>;
}

export default function GamesPage({ slug = '' }) {
  const [games, setGames] = useState([]);
  const [game, setGame] = useState(null);
  const [announcements, setAnnouncements] = useState([]);
  const [user, setUser] = useState(null);
  const [error, setError] = useState('');
  const [detailError, setDetailError] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(Boolean(slug));
  useEffect(() => {
    setLoading(true);
    Promise.all([api('/games'), api('/announcements')])
      .then(([gamesResponse, announcementsResponse]) => {
        setGames(expectArray(gamesResponse, 'games'));
        setAnnouncements(expectArray(announcementsResponse, 'announcements'));
      })
      .catch((loadError) => setError(loadError.message))
      .finally(() => setLoading(false));
    api('/auth/me').then((data) => setUser(expectObject(data.user, 'account session'))).catch(() => setUser(null));
  }, []);
  useEffect(() => {
    if (!slug) {
      setGame(null);
      setDetailError('');
      setDetailLoading(false);
      return;
    }
    setDetailLoading(true);
    setDetailError('');
    api(`/games/${encodeURIComponent(slug)}`)
      .then((data) => {
        const nextGame = expectObject(data, 'game details');
        setGame({ ...nextGame, draws: expectArray(nextGame.draws, 'game draws'), prize_info: expectArray(nextGame.prize_info, 'game prize information') });
      })
      .catch((loadError) => setDetailError(loadError.message))
      .finally(() => setDetailLoading(false));
  }, [slug]);
  const announcementSection = announcements.length > 0 && <section className="section announcements-section"><div className="section-heading"><div><span className="eyebrow">DRAWLINE NEWS</span><h2>Announcements</h2></div></div><div className="announcement-list">{announcements.map((announcement) => <article className="announcement-card" key={announcement.id}><span className="eyebrow">{new Date(announcement.published_at).toLocaleDateString('en-IN', { dateStyle: 'medium' })}</span><h3>{announcement.title}</h3><p>{announcement.body}</p></article>)}</div></section>;
  if (slug) {
    if (detailLoading) return <main className="games-page"><section className="panel loading">Loading game details…</section></main>;
    if (detailError) return <main className="games-page"><section className="panel"><p className="error-text" role="alert">{detailError}</p><a className="secondary-button" href="/games">Back to games</a></section></main>;
    if (game) return <main className="games-page"><GameDetails game={game} user={user}/>{announcementSection}</main>;
  }
  return <main className="games-page"><section className="games-hero"><span className="eyebrow">DRAWLINE PLAY</span><h1>Play with points.<br/><em>Keep it light.</em></h1><p>Explore number games, make virtual-points entries, and follow every draw. No deposits, cash prizes, or withdrawals.</p><div className="games-hero-note"><Trophy size={18}/><span>Every entry and result is tied to your account history.</span></div></section><section className="section games-list-section"><div className="section-heading"><div><span className="eyebrow">AVAILABLE GAMES</span><h2>Choose your game</h2><p>Each game explains its range, selection count, draw schedule, and virtual prize guide.</p></div><a className="quiet-link light-link" href="/account">My account <ArrowLeft size={15} className="flip-icon"/></a></div>{error&&<div className="alert error-text">{error}</div>}{loading?<div className="loading">Loading available games…</div>:games.length === 0 ? <div className="empty-state"><div className="empty-icon"><Sparkles/></div><h3>No games are open yet</h3><p>Check back when the next game schedule is published.</p></div> : <div className="games-grid">{games.map((availableGame) => <GameCard game={availableGame} key={availableGame.id}/>)}</div>}</section>{announcementSection}</main>;
}
