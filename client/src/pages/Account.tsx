import { FormEvent, useEffect, useState } from 'react';
import { SecuritySettings, SoundSettings, ProfileSettings } from './Engage';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, trackEvent } from '../lib/api';
import { useAsync, useStore } from '../lib/store';
import { Logo, Chip, useTitle, Modal, Avatar } from '../components/ui';
import { PREF_CATEGORIES } from '@shared/preferences';
import { Icon } from '../components/Icon';

function AuthCard({ title, children, sub }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div style={{ maxWidth: 460, margin: '4vh auto 0' }} className="fade-up">
      <div className="center" style={{ marginBottom: 18 }}><Logo size={34} /></div>
      <div className="panel" style={{ padding: 28 }}>
        <h2 style={{ fontSize: 'var(--fs-xl)' }}>{title}</h2>
        {sub && <p className="muted" style={{ marginTop: 6, fontSize: 14 }}>{sub}</p>}
        <div style={{ marginTop: 20 }}>{children}</div>
      </div>
    </div>
  );
}

function OAuthButtons() {
  const { providers, toast } = useStore();
  const go = async (p: string) => { try { await api.get(`/api/auth/oauth/${p}`); } catch (e: any) { toast(e.message, 'bad'); } };
  return (
    <div className="col" style={{ gap: 8 }}>
      <button type="button" className="btn btn-block" onClick={() => go('google')} disabled={!providers.google} title={providers.google ? '' : 'Not configured on this server'}>Continue with Google{!providers.google && ' (not configured)'}</button>
      <button type="button" className="btn btn-block" onClick={() => go('apple')} disabled={!providers.apple} title={providers.apple ? '' : 'Not configured on this server'}>Continue with Apple{!providers.apple && ' (not configured)'}</button>
    </div>
  );
}

export function Login() {
  useTitle('Sign in');
  const { setMe, ensureSession, providers } = useStore();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const [f, setF] = useState({ identifier: '', password: '' });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(null); setBusy(true);
    try { const r = await api.post('/api/auth/login', f); setMe(r.user); nav(sp.get('next') ?? '/'); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <AuthCard title="Welcome back" sub="Sign in to sync your progress, friends and rewards.">
      <form className="col" onSubmit={submit}>
        {err && <div className="form-error" role="alert">{err}</div>}
        <div className="field"><label htmlFor="id">Email or username</label><input id="id" className="input" autoComplete="username" value={f.identifier} onChange={(e) => setF({ ...f, identifier: e.target.value })} required /></div>
        <div className="field"><label htmlFor="pw">Password</label><input id="pw" type="password" className="input" autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required /></div>
        <button className="btn btn-primary btn-lg btn-block" disabled={busy}>Sign in</button>
        <Link to="/forgot" className="dim" style={{ fontSize: 13, textAlign: 'center' }}>Forgot password?</Link>
      </form>
      <div className="divider" />
      <OAuthButtons />
      <div className="divider" />
      <div className="col" style={{ gap: 8 }}>
        <Link to="/register" className="btn btn-block">Create an account</Link>
        <button className="btn btn-ghost btn-block" onClick={async () => { await ensureSession(); trackEvent('onboarding_step', { step: 'guest' }); nav('/'); }}>Play as guest (no sign-up)</button>
      </div>
      {providers.devMode && <p className="dim" style={{ fontSize: 12, marginTop: 12 }}>Local development build: emails go to the <Link to="/dev/outbox" style={{ color: 'var(--zo-cyan)' }}>dev outbox</Link>.</p>}
    </AuthCard>
  );
}

export function Register() {
  useTitle('Create account');
  const { me, setMe, ensureSession } = useStore();
  const nav = useNavigate();
  const [step, setStep] = useState<'age' | 'account' | 'tastes'>('age');
  const [f, setF] = useState({ email: '', username: '', password: '', dob: '', parentEmail: '', acceptTerms: false, avatar: 'orb-1' });
  const [policy, setPolicy] = useState<{ canRegister: boolean; band: string; loungeEligible: boolean; message: string } | null>(null);
  const [tastes, setTastes] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const checkAge = async (e: FormEvent) => {
    e.preventDefault(); setErr(null); setBusy(true);
    try {
      const r = await api.post('/api/auth/age-check', { dob: f.dob });
      setPolicy(r);
      trackEvent('onboarding_step', { step: 'age', ok: r.canRegister });
      if (r.canRegister) setStep('account');
    } catch (x: any) { setErr(x.message); } finally { setBusy(false); }
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(null); setBusy(true);
    try {
      const ref = new URLSearchParams(location.search).get('ref') ?? undefined;
      const r = await api.post('/api/auth/register', { ...f, parentEmail: policy?.band === 'child' ? f.parentEmail : undefined, ref });
      setMe(r.user); trackEvent('onboarding_complete', { band: r.user.ageBand });
      setStep('tastes');
    } catch (x: any) { setErr(x.message); } finally { setBusy(false); }
  };
  const saveTastes = async () => {
    setBusy(true);
    try { if (tastes.length) { const r = await api.patch('/api/auth/profile', { preferences: tastes }); setMe(r.user); } trackEvent('onboarding_step', { step: 'tastes', n: tastes.length }); nav('/welcome'); }
    catch (x: any) { setErr(x.message); } finally { setBusy(false); }
  };
  const steps = ['Birthday', 'Account', 'Your games'];
  const idx = step === 'age' ? 0 : step === 'account' ? 1 : 2;
  return (
    <AuthCard title={me?.isGuest && step !== 'tastes' ? 'Save your progress' : step === 'tastes' ? 'What do you like to play?' : 'Join PLAYZO'}
      sub={step === 'tastes' ? 'Pick a few so we can recommend games. You can change this any time in Settings.' : me?.isGuest ? 'Your guest progress, XP and ZO coins carry over.' : 'Your place to play, compete and connect. Free forever.'}>
      <ol className="stepper" aria-label="Sign-up steps">{steps.map((s, i) => <li key={s} className={i === idx ? 'on' : i < idx ? 'done' : ''} aria-current={i === idx ? 'step' : undefined}><span>{i < idx ? '✓' : i + 1}</span>{s}</li>)}</ol>
      {err && <div className="form-error" role="alert">{err}</div>}
      {step === 'age' && (
        <form className="col" onSubmit={checkAge}>
          <div className="field"><label htmlFor="dob">Date of birth</label><input id="dob" type="date" className="input" value={f.dob} onChange={(e) => { setF({ ...f, dob: e.target.value }); setPolicy(null); }} required max={new Date().toISOString().slice(0, 10)} autoFocus /><span className="hint">We ask first so you get the right games and features. Never shown publicly.</span></div>
          {policy && !policy.canRegister && (
            <div className="panel" role="status" style={{ background: 'rgba(124,77,255,.12)' }}>
              <p>{policy.message}</p>
              <button type="button" className="btn btn-primary" style={{ marginTop: 10 }} onClick={async () => { await ensureSession(); nav('/games'); }}>Play as a guest</button>
            </div>
          )}
          <button className="btn btn-primary btn-lg btn-block" disabled={busy || !f.dob}>Continue</button>
        </form>
      )}
      {step === 'account' && (
        <form className="col" onSubmit={submit}>
          {policy && <p className="muted" style={{ fontSize: 14 }}>{policy.message}</p>}
          <div className="field"><label htmlFor="em">Email</label><input id="em" type="email" className="input" autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required /></div>
          <div className="field"><label htmlFor="un">Username</label><input id="un" className="input" autoComplete="username" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value.replace(/[^A-Za-z0-9_]/g, '') })} minLength={3} maxLength={20} required /><span className="hint">Letters, numbers and _ . Don't use your real name.</span></div>
          <div className="field"><label htmlFor="pw">Password</label><input id="pw" type="password" className="input" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} minLength={8} required /><span className="hint">At least 8 characters.</span></div>
          <div className="field"><span className="label-text">Choose your avatar</span>
            <div className="row wrap" role="radiogroup" aria-label="Avatar" style={{ gap: 8 }}>
              {['orb-1', 'orb-2', 'orb-3', 'orb-4', 'orb-5', 'orb-6'].map((a) => (
                <button type="button" key={a} role="radio" aria-checked={f.avatar === a} aria-label={`Avatar ${a.slice(4)}`} className={`avatar-pick ${f.avatar === a ? 'on' : ''}`} onClick={() => setF({ ...f, avatar: a })}><Avatar id={a} size={44} name={f.username || 'You'} /></button>
              ))}
            </div>
          </div>
          {policy?.band === 'child' && (
            <div className="field"><label htmlFor="pe">Parent or guardian email</label><input id="pe" type="email" className="input" value={f.parentEmail} onChange={(e) => setF({ ...f, parentEmail: e.target.value })} required /><span className="hint">Under-13 accounts can play solo straight away. Friends and multiplayer unlock once a parent approves.</span></div>
          )}
          <label className="check"><input type="checkbox" checked={f.acceptTerms} onChange={(e) => setF({ ...f, acceptTerms: e.target.checked })} required />I agree to the <Link to="/legal/terms" target="_blank" style={{ color: 'var(--zo-cyan)' }}>Terms</Link> and <Link to="/legal/privacy" target="_blank" style={{ color: 'var(--zo-cyan)' }}>Privacy Policy</Link>.</label>
          <div className="row"><button type="button" className="btn btn-ghost" onClick={() => setStep('age')}>Back</button><button className="btn btn-primary btn-lg" style={{ flex: 1 }} disabled={busy}>Create account</button></div>
        </form>
      )}
      {step === 'tastes' && (
        <div className="col">
          <div className="taste-grid" role="group" aria-label="Game categories">
            {PREF_CATEGORIES.map((c) => (
              <button type="button" key={c.key} aria-pressed={tastes.includes(c.key)} className={`taste ${tastes.includes(c.key) ? 'on' : ''}`} onClick={() => setTastes((t) => (t.includes(c.key) ? t.filter((x) => x !== c.key) : [...t, c.key]))}>
                <Icon name={c.icon} />{c.label}
              </button>
            ))}
          </div>
          <button className="btn btn-primary btn-lg btn-block" disabled={busy} onClick={saveTastes}>{tastes.length ? 'Save and start playing' : 'Skip for now'}</button>
        </div>
      )}
      {step !== 'tastes' && <><div className="divider" /><OAuthButtons /><p className="dim" style={{ fontSize: 13, marginTop: 12, textAlign: 'center' }}>Have an account? <Link to="/login" style={{ color: 'var(--zo-cyan)' }}>Sign in</Link></p></>}
    </AuthCard>
  );
}

export function Welcome() {
  useTitle('Welcome');
  const { me, providers } = useStore();
  if (!me) return null;
  return (
    <AuthCard title={`Welcome, ${me.displayName}!`} sub="Aaja PLAYZO pe khelte hain! Here's how to get going:">
      <ol className="col" style={{ paddingLeft: 18, margin: 0 }}>
        <li>Try the <b>Daily Puzzle</b>: everyone gets the same one.</li>
        <li>Finish games to earn <b>XP</b> and <b>ZO coins</b> for cosmetic avatars, frames and themes.</li>
        <li>{me.ageBand === 'child' && !me.parentalConsent ? (providers.email ? 'Ask a parent to approve friends & multiplayer using the email we sent them.' : 'A parent approval link was created. Email delivery is not configured on this server yet, so it is in the local outbox.') : 'Add friends and challenge them on the exact same puzzle.'}</li>
        {!me.emailVerified && <li>{providers.email ? <>Verify your email (check your inbox{me.email ? ` at ${me.email}` : ''}).</> : <>Verify your email: this server has no email provider yet, so the link is in the <Link to="/dev/outbox" style={{ color: 'var(--zo-cyan)' }}>local outbox</Link>.</>}</li>}
      </ol>
      <div className="row" style={{ marginTop: 18 }}><Link className="btn btn-primary btn-lg" to="/">Start playing</Link><Link className="btn" to="/settings">Settings</Link></div>
    </AuthCard>
  );
}

export function Forgot() {
  useTitle('Reset password');
  const { providers } = useStore();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  return (
    <AuthCard title="Reset your password" sub="We'll email you a link that's valid for one hour.">
      {sent ? <p className="muted">{providers.email ? 'If an account exists for that email, a reset link is on its way.' : 'If an account exists for that email, a reset link was created. Email delivery is not configured on this server yet, so nothing was emailed: in development the link is in the local outbox.'}</p> : (
        <form className="col" onSubmit={async (e) => { e.preventDefault(); await api.post('/api/auth/forgot', { email }).catch(() => undefined); setSent(true); }}>
          <div className="field"><label htmlFor="em">Email</label><input id="em" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
          <button className="btn btn-primary btn-block">Send link</button>
        </form>
      )}
    </AuthCard>
  );
}

export function Reset() {
  const [sp] = useSearchParams();
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  return (
    <AuthCard title="Choose a new password">
      {msg ? <><p className="muted">{msg}</p><Link className="btn btn-primary" to="/login" style={{ marginTop: 12 }}>Sign in</Link></> : (
        <form className="col" onSubmit={async (e) => { e.preventDefault(); try { await api.post('/api/auth/reset', { token: sp.get('token'), password: pw }); setMsg('Password updated. All other sessions were signed out.'); } catch (x: any) { setErr(x.message); } }}>
          {err && <div className="form-error">{err}</div>}
          <div className="field"><label htmlFor="pw">New password</label><input id="pw" type="password" className="input" minLength={8} value={pw} onChange={(e) => setPw(e.target.value)} required autoComplete="new-password" /></div>
          <button className="btn btn-primary btn-block">Update password</button>
        </form>
      )}
    </AuthCard>
  );
}

export function TokenAction({ kind }: { kind: 'verify' | 'parent' }) {
  const [sp] = useSearchParams();
  const [state, setState] = useState<'idle' | 'ok' | 'err'>('idle');
  const [msg, setMsg] = useState('');
  const { refresh } = useStore();
  useEffect(() => {
    api.post(kind === 'verify' ? '/api/auth/verify-email' : '/api/auth/parent-consent', { token: sp.get('token') })
      .then(() => { setState('ok'); refresh(); }).catch((e) => { setState('err'); setMsg(e.message); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <AuthCard title={kind === 'verify' ? 'Email verification' : 'Parental approval'}>
      {state === 'idle' && <div className="spinner" />}
      {state === 'ok' && <p>{kind === 'verify' ? 'Your email is verified. Thank you!' : 'Thank you. Friends and multiplayer are now enabled for this child account. Chat stays emotes-only, and you can contact support to withdraw consent at any time.'}</p>}
      {state === 'err' && <div className="form-error">{msg}</div>}
      <Link className="btn" to="/" style={{ marginTop: 14 }}>Go to PLAYZO</Link>
    </AuthCard>
  );
}

export function DevOutbox() {
  useTitle('Dev outbox');
  const { data, error } = useAsync(() => api.get('/api/dev/outbox'), []);
  return (
    <div className="stack">
      <h1 style={{ fontSize: 'var(--fs-2xl)' }}>Dev email outbox</h1>
      <p className="muted">Local development only. {data?.delivery?.note ?? "No email provider is configured"}. Verification, reset and parental-consent messages are stored here instead of being sent.</p>
      {error && <div className="form-error">{error}</div>}
      {data?.messages?.map((m: any) => {
        const link = m.body.match(/https?:\/\/\S+/)?.[0];
        const path = link ? link.replace(/^https?:\/\/[^/]+/, '') : null;
        return (
          <div key={m.id} className="panel panel-tight">
            <div className="row"><b style={{ flex: 1 }}>{m.subject}</b><Chip tone={m.status === "sent" ? "ok" : "warn"}>{m.status === "outbox_only" ? "Not delivered (local outbox)" : m.status}</Chip><span className="dim" style={{ fontSize: 12 }}>{new Date(m.created_at).toLocaleString()}</span></div>
            <div className="dim" style={{ fontSize: 13 }}>To: {m.to_email}</div>
            <p style={{ fontSize: 14, marginTop: 6, wordBreak: 'break-word' }}>{m.body}</p>
            {path && <Link className="btn btn-sm" to={path} style={{ marginTop: 8 }}>Open link</Link>}
          </div>
        );
      })}
    </div>
  );
}

export function Settings() {
  useTitle('Settings');
  const { me, setMe, refresh, toast, providers } = useStore();
  const nav = useNavigate();
  const [del, setDel] = useState(false);
  const [delForm, setDelForm] = useState({ confirm: '', password: '' });
  const [pw, setPw] = useState({ current: '', password: '' });
  if (!me) return <AuthCard title="Settings"><p className="muted">Sign in to manage your account.</p><Link className="btn btn-primary" to="/login" style={{ marginTop: 12 }}>Sign in</Link></AuthCard>;
  const patch = async (b: object) => { try { const r = await api.patch('/api/auth/profile', b); setMe(r.user); toast('Saved', 'ok'); } catch (e: any) { toast(e.message, 'bad'); } };
  return (
    <div className="stack" style={{ maxWidth: 720 }}>
      <h1 style={{ fontSize: 'var(--fs-2xl)' }}>Settings</h1>
      <div className="panel">
        <div className="panel-title"><Icon name="user" /><h3>Account</h3></div>
        <p className="muted" style={{ fontSize: 14 }}>Signed in as <b>{me.username}</b>{me.email ? ` (${me.email})` : ''} · {me.isGuest ? 'guest account' : `${me.ageBand} account`}</p>
        <div className="row wrap" style={{ marginTop: 10 }}>
          {me.isGuest && <Link className="btn btn-primary" to="/register">Create account (keep progress)</Link>}
          {!me.emailVerified && !me.isGuest && <Chip tone="warn">Email not verified</Chip>}
          {me.ageBand === 'child' && <Chip tone={me.parentalConsent ? 'ok' : 'warn'}>{me.parentalConsent ? 'Parent approved' : 'Awaiting parent approval'}</Chip>}
          <button className="btn" onClick={async () => { await api.post('/api/auth/logout'); setMe(null); nav('/'); refresh(); }}><Icon name="logout" />Sign out</button>
        </div>
      </div>
      <ProfileSettings />
      <SoundSettings />
      <SecuritySettings />
      <div className="panel">
        <div className="panel-title"><Icon name="shield" /><h3>Privacy</h3></div>
        <div className="field"><label htmlFor="pv">Who can see my profile and stats</label>
          <select id="pv" className="input" value={me.privacy} onChange={(e) => patch({ privacy: e.target.value })}>
            {me.ageBand !== 'child' && <option value="public">Everyone</option>}<option value="friends">Friends only</option><option value="private">Only me</option>
          </select></div>
        <label className="check" style={{ marginTop: 12 }}><input type="checkbox" checked={me.allowFriendRequests} onChange={(e) => patch({ allowFriendRequests: e.target.checked })} />Allow friend requests</label>
        <p className="dim" style={{ fontSize: 13, marginTop: 10 }}>PLAYZO uses first-party analytics only to improve games. We do not show behavioural ads, sell data, or fingerprint devices. Chat is emotes-only.</p>
      </div>
      {!me.isGuest && (
        <form className="panel" onSubmit={async (e) => { e.preventDefault(); try { await api.post('/api/auth/change-password', pw); toast('Password changed', 'ok'); setPw({ current: '', password: '' }); } catch (x: any) { toast(x.message, 'bad'); } }}>
          <div className="panel-title"><Icon name="lock" /><h3>Change password</h3></div>
          <div className="row wrap"><input className="input" type="password" placeholder="Current" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} style={{ flex: 1 }} autoComplete="current-password" aria-label="Current password" /><input className="input" type="password" placeholder="New (8+ characters)" value={pw.password} onChange={(e) => setPw({ ...pw, password: e.target.value })} style={{ flex: 1 }} autoComplete="new-password" aria-label="New password" /><button className="btn">Update</button></div>
        </form>
      )}
      {me.lounge?.visible && (
        <div className="panel">
          <div className="panel-title"><Icon name="clock" /><h3>Lounge play controls</h3></div>
          <div className="row wrap">
            <label className="muted" htmlFor="lim" style={{ fontSize: 14 }}>Daily Lounge time limit</label>
            <select id="lim" className="input" style={{ maxWidth: 180 }} value={me.loungeDailyLimitMin ?? ''} onChange={(e) => patch({ loungeDailyLimitMin: e.target.value ? Number(e.target.value) : null })}>
              <option value="">No limit</option>{[15, 30, 60, 120].map((m) => <option key={m} value={m}>{m} minutes</option>)}
            </select>
          </div>
          <div className="row wrap" style={{ marginTop: 12 }}>
            <span className="muted" style={{ fontSize: 14 }}>Take a break from the Lounge:</span>
            {[1, 7, 30].map((d) => <button key={d} className="btn btn-sm" onClick={() => confirm(`Lock the Lounge for ${d} day(s)? This cannot be undone early.`) && patch({ loungeCooloffDays: d })}>{d} day{d > 1 ? 's' : ''}</button>)}
          </div>
          {me.lounge.cooloffUntil && <p className="dim" style={{ fontSize: 13, marginTop: 8 }}>Cool-off active until {new Date(me.lounge.cooloffUntil).toLocaleString()}.</p>}
        </div>
      )}
      <div className="panel" style={{ borderColor: 'rgba(255,77,109,.35)' }}>
        <div className="panel-title"><Icon name="close" /><h3>Delete account</h3></div>
        <p className="muted" style={{ fontSize: 14 }}>Permanently deletes your profile, game history, friends, coins and cosmetics. This cannot be undone.</p>
        <button className="btn btn-danger" style={{ marginTop: 10 }} onClick={() => setDel(true)}>Delete my account</button>
      </div>
      {providers.devMode && <Link to="/dev/outbox" className="dim" style={{ fontSize: 13 }}>Dev email outbox →</Link>}
      <Modal open={del} onClose={() => setDel(false)} title="Delete account permanently?">
        <form className="col" onSubmit={async (e) => { e.preventDefault(); try { await api.post('/api/auth/delete-account', delForm); setMe(null); toast('Your account was deleted'); nav('/'); } catch (x: any) { toast(x.message, 'bad'); } }}>
          <p className="muted" style={{ fontSize: 14 }}>Type <b>DELETE</b> to confirm{me.isGuest ? '.' : ' and enter your password.'}</p>
          <input className="input" value={delForm.confirm} onChange={(e) => setDelForm({ ...delForm, confirm: e.target.value })} aria-label="Type DELETE" />
          {!me.isGuest && <input className="input" type="password" placeholder="Password" value={delForm.password} onChange={(e) => setDelForm({ ...delForm, password: e.target.value })} aria-label="Password" />}
          <button className="btn btn-danger btn-block" disabled={delForm.confirm !== 'DELETE'}>Delete forever</button>
        </form>
      </Modal>
    </div>
  );
}
