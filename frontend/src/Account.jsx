import React, { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, LogOut, UserRound } from 'lucide-react';
import { api, expectArray, expectObject } from './api';

const formatDate = (value) => value ? new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

function AuthForm({ onAuthenticated }) {
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const data = await api(mode === 'login' ? '/auth/login' : '/auth/register', {
        method: 'POST',
        body: JSON.stringify(mode === 'login' ? { email, password } : { name, email, password })
      });
      onAuthenticated(expectObject(data.user, 'account sign-in'));
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setLoading(false);
    }
  }
  return <section className="account-auth panel"><div className="login-mark"><UserRound size={23}/></div><span className="eyebrow">BHOTAN GOLDEN LOTTERY ACCOUNT</span><h1>{mode === 'login' ? 'Welcome back.' : 'Create your account.'}</h1><p className="muted">Use virtual points to enter games and keep your personal draw history in one place.</p><div className="auth-switch"><button className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setError(''); }}>Sign in</button><button className={mode === 'register' ? 'active' : ''} onClick={() => { setMode('register'); setError(''); }}>Register</button></div><form className="stack-form" onSubmit={submit}>{mode === 'register'&&<label>Name<input value={name} onChange={(event)=>setName(event.target.value)} autoComplete="name" required/></label>}<label>Email address<input type="email" value={email} onChange={(event)=>setEmail(event.target.value)} autoComplete="email" required/></label><label>Password<input type="password" value={password} onChange={(event)=>setPassword(event.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength="12" required/></label>{mode === 'register'&&<p className="form-hint">Use at least 12 characters. New accounts start with 1,000 virtual points.</p>}{error&&<p className="error-text" role="alert">{error}</p>}<button className="primary-button full" disabled={loading}>{loading ? 'Working…' : mode === 'login' ? 'Sign in' : 'Create account'} <ArrowRight size={16}/></button></form></section>;
}

function UserDashboard({ user, onLogout }) {
  const [dashboard, setDashboard] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api('/me/dashboard').then((data) => {
      const nextDashboard = expectObject(data, 'account dashboard');
      const entries = expectArray(nextDashboard.entries, 'account entries');
      const transactions = expectArray(nextDashboard.transactions, 'point transactions');
      if (!entries.every((entry) => Array.isArray(entry.numbers))) throw new Error('Invalid account entries response. Entry numbers must be an array.');
      setDashboard({ ...nextDashboard, user: expectObject(nextDashboard.user, 'account user'), entries, transactions });
    }).catch((loadError) => setError(loadError.message));
  }, []);
  if (error) return <section className="panel account-panel"><p className="error-text">{error}</p><button className="secondary-button" onClick={onLogout}>Return to sign in</button></section>;
  if (!dashboard) return <section className="panel loading">Loading your account…</section>;
  return <>
    <section className="account-welcome"><div><span className="eyebrow">YOUR BHOTAN GOLDEN LOTTERY ACCOUNT</span><h1>Hello, {dashboard.user.name}.</h1><p>Track your virtual points, entries, and completed draw results.</p></div><button className="secondary-button" onClick={onLogout}><LogOut size={15}/> Sign out</button></section>
    <div className="account-stats"><div className="account-stat"><span>Virtual points</span><strong>{dashboard.user.points_balance.toLocaleString()}</strong><small>No monetary value</small></div><div className="account-stat"><span>Total entries</span><strong>{dashboard.entries.length}</strong><small>Personal history</small></div><div className="account-stat"><span>Member since</span><strong>{new Date(dashboard.user.created_at).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</strong><small>{dashboard.user.email}</small></div></div>
    <section className="panel account-panel"><div className="panel-heading"><div><span className="eyebrow">MY ENTRIES</span><h2>Game history</h2></div><a className="quiet-link" href="/games">Play a game <ArrowRight size={15}/></a></div>{dashboard.entries.length === 0 ? <div className="empty-state"><h3>No entries yet</h3><p>Choose a game to make your first virtual-points entry.</p></div> : <div className="history-table">{dashboard.entries.map((entry) => <div className="history-row" key={entry.id}><div><strong>{entry.game_name}</strong><small>{formatDate(entry.draw_at)} · {entry.numbers.join(', ')}</small></div><div className="history-result"><span className={`status ${entry.status}`}>{entry.status}</span>{entry.prize_points ? <strong>+{entry.prize_points} pts</strong> : null}</div></div>)}</div>}</section>
    <section className="panel account-panel"><div className="panel-heading"><div><span className="eyebrow">POINTS LEDGER</span><h2>Recent activity</h2></div></div><div className="history-table">{dashboard.transactions.map((transaction) => <div className="history-row" key={transaction.id}><div><strong>{transaction.reason}</strong><small>{formatDate(transaction.created_at)}</small></div><div className={transaction.amount > 0 ? 'ledger-positive' : 'ledger-negative'}>{transaction.amount > 0 ? '+' : ''}{transaction.amount} <small>balance {transaction.balance_after}</small></div></div>)}</div></section>
    <div className="account-safety"><CheckCircle2 size={18}/><span>Virtual points cannot be purchased, withdrawn, transferred, or exchanged for money.</span></div>
  </>;
}

export default function AccountPage() {
  const [user, setUser] = useState(null);
  const [checked, setChecked] = useState(false);
  useEffect(() => { api('/auth/me').then((data) => setUser(expectObject(data.user, 'account session'))).catch(() => setUser(null)).finally(() => setChecked(true)); }, []);
  async function logout() {
    try { await api('/auth/logout', { method: 'POST' }); } finally { setUser(null); }
  }
  return <main className="account-page">{!checked ? <section className="panel loading">Loading account…</section> : user ? <UserDashboard user={user} onLogout={logout}/> : <AuthForm onAuthenticated={setUser}/>}</main>;
}
