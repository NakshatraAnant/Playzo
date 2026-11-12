import { NavLink, Link, Outlet, useLocation } from 'react-router-dom';
import { Suspense, useEffect } from 'react';
import { Icon } from './Icon';
import { Logo, Avatar, Coins, Toasts } from './ui';
import { useStore } from '../lib/store';
import { setMuted as setAudioMuted, sfx } from '../lib/sound';
import { trackEvent } from '../lib/api';

export function Shell() {
  const { me, muted, setMuted } = useStore();
  const loc = useLocation();
  const inGame = /^\/(play|lounge\/play|room)\//.test(loc.pathname);
  useEffect(() => { window.scrollTo(0, 0); trackEvent('page_view', { path: loc.pathname.replace(/\/[A-Za-z0-9_-]{12,}$/, '/:id'), source: new URLSearchParams(loc.search).get('utm_source') ?? undefined }); }, [loc.pathname, loc.search]);
  const toggleSound = () => { const m = !muted; setMuted(m); setAudioMuted(m); if (!m) sfx.select(); };
  const nav = [
    { to: '/', icon: 'home', label: 'Home' },
    { to: '/games', icon: 'compass', label: 'Discover' },
    { to: '/rooms', icon: 'users', label: 'Rooms' },
    { to: '/missions', icon: 'target', label: 'Missions' },
    { to: '/me', icon: 'user', label: 'Profile' },
  ];
  return (
    <div className={`shell ${inGame ? 'no-rail' : ''}`}>
      <a href="#main" className="sr-only">Skip to content</a>
      <header className="topbar">
        <Link to="/" aria-label="PLAYZO home"><Logo size={21} /></Link>
        <span className="spacer" />
        {me && <Coins n={me.balances.ZO} />}
        <button className="btn btn-ghost icon-btn" onClick={toggleSound} aria-label={muted ? 'Unmute sound' : 'Mute sound'}><Icon name={muted ? 'mute' : 'sound'} /></button>
        {me ? (
          <Link to="/me" aria-label="Your profile" className="row" style={{ gap: 8 }}>
            <Avatar id={me.avatar} frame={me.frame} size={34} name={me.displayName} />
            <span className="hide-mobile" style={{ fontWeight: 700, fontSize: 14 }}>Lv {me.level}</span>
          </Link>
        ) : (
          <Link to="/login" className="btn btn-sm btn-primary">Sign in</Link>
        )}
      </header>
      {!inGame && (
        <nav className="rail" aria-label="Main">
          {nav.map((n) => <NavLink key={n.to} to={n.to} end={n.to === '/'}><Icon name={n.icon} />{n.label}</NavLink>)}
          <div className="rail-sep" />
          <NavLink to="/daily"><Icon name="calendar" />Daily Puzzle</NavLink>
          <NavLink to="/leaderboards"><Icon name="trophy" />Leaderboards</NavLink>
          <NavLink to="/friends"><Icon name="heart" />Friends</NavLink>
          <NavLink to="/shop"><Icon name="bag" />Shop</NavLink>
          {me?.lounge?.visible && <NavLink to="/lounge"><Icon name="crown" />Lounge 18+</NavLink>}
          {(me?.role === 'admin' || me?.role === 'support') && <NavLink to="/admin"><Icon name="admin" />Admin</NavLink>}
          <div className="spacer" />
          <NavLink to="/settings"><Icon name="gear" />Settings</NavLink>
          <Link to="/legal/fair-play" className="dim" style={{ fontSize: 12 }}>Fair play · Privacy · Terms</Link>
        </nav>
      )}
      <main id="main" className="main">
        <Suspense fallback={<div className="center" style={{ minHeight: '50vh' }}><div className="spinner" /></div>}>
          <Outlet />
        </Suspense>
      </main>
      {!inGame && (
        <nav className="tabbar" aria-label="Main">
          {nav.map((n, i) => i === 2 ? (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => `tab tab-play ${isActive ? 'active' : ''}`}><span className="play-fab"><Icon name="play" size={22} /></span>Play</NavLink>
          ) : (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}><Icon name={n.icon} />{n.label}</NavLink>
          ))}
        </nav>
      )}
      <Toasts />
    </div>
  );
}
