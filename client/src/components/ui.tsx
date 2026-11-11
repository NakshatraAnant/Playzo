import { ReactNode, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from './Icon';
import { GameCover } from '../art/covers';
import { COSMETIC_BY_ID } from '@shared/cosmetics';
import { useStore } from '../lib/store';
import { api } from '../lib/api';
import { sfx } from '../lib/sound';

export function Logo({ size = 22 }: { size?: number }) {
  return <span className="logo" style={{ fontSize: size }} aria-label="PLAYZO">PLAYZ<span className="o" aria-hidden /></span>;
}

export function Avatar({ id, frame, size = 40, name }: { id: string; frame?: string | null; size?: number; name?: string }) {
  const c = COSMETIC_BY_ID[id]?.colors ?? ['#ff3d8b', '#ffb02e'];
  const f = frame ? COSMETIC_BY_ID[frame]?.colors : null;
  return (
    <span className="avatar" style={{ width: size, height: size, background: `radial-gradient(circle at 30% 28%, rgba(255,255,255,.55), transparent 32%), linear-gradient(135deg, ${c[0]}, ${c[1]})`, fontSize: size * 0.4 }} aria-label={name ? `${name} avatar` : undefined}>
      {name ? name.slice(0, 1).toUpperCase() : null}
      {f && <span className="ring" style={{ background: `conic-gradient(${[...f, f[0]].join(',')})` }} />}
    </span>
  );
}

export function Chip({ children, tone, icon }: { children: ReactNode; tone?: 'on' | 'ok' | 'warn' | 'bad' | 'gold'; icon?: string }) {
  return <span className={`chip ${tone ?? ''}`}>{icon && <Icon name={icon} size={14} />}{children}</span>;
}

export interface GameCardData { id: string; title: string; category: string; age: string; env: string; multiplayer?: boolean; me?: { plays: number; best: number; favourite: boolean } | null; gate?: string; live?: boolean; tagline?: string }

export function GameTile({ g, to, wide, showFav }: { g: GameCardData; to?: string; wide?: boolean; showFav?: boolean }) {
  const { me, toast } = useStore();
  const href = to ?? (g.env === 'lounge' ? `/lounge/${g.id}` : `/games/${g.id}`);
  const fav = async (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (!me) return toast('Sign in or play as guest to save favourites');
    try { await api.post(`/api/games/${g.id}/favourite`, { on: !g.me?.favourite }); if (g.me) g.me.favourite = !g.me.favourite; sfx.select(); toast(g.me?.favourite ? 'Added to favourites' : 'Removed from favourites', 'ok'); } catch (err: any) { toast(err.message, 'bad'); }
  };
  return (
    <Link to={href} className={`tile ${wide ? 'wide' : ''}`} onClick={() => sfx.tap()} aria-label={`${g.title}, ${g.category}`}>
      <GameCover id={g.id} className="cover" />
      <div className="shade" />
      <div className="badges">
        {g.multiplayer && <Chip icon="users">Live</Chip>}
        {g.env === 'lounge' && <Chip tone="gold">18+</Chip>}
        {g.gate === 'pending_legal_review' && <Chip tone="warn" icon="lock">Legal review</Chip>}
        {g.live === false && <Chip tone="warn">Maintenance</Chip>}
      </div>
      {showFav && g.me && (
        <button className="btn btn-ghost icon-btn btn-sm fav" onClick={fav} aria-label={g.me.favourite ? 'Remove favourite' : 'Add favourite'} aria-pressed={g.me.favourite}>
          <svg viewBox="0 0 24 24" width={18} height={18} fill={g.me.favourite ? '#ff3d8b' : 'none'} stroke="#fff" strokeWidth={2}><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" /></svg>
        </button>
      )}
      <div className="meta">
        <b>{g.title}</b>
        <span>{g.category}{g.me?.best ? ` · Best ${g.me.best.toLocaleString()}` : ''}</span>
      </div>
    </Link>
  );
}

export function SectionHead({ eyebrow, title, to, action }: { eyebrow?: string; title: string; to?: string; action?: string }) {
  return (
    <div className="section-head">
      <div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div>
      {to && <Link to={to}>{action ?? 'See all'} →</Link>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title?: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    ref.current?.focus();
    const ov = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ov; prev?.focus?.(); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal fade-up" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref} style={wide ? { width: 'min(100%, 760px)' } : undefined}>
        <div className="modal-head">
          {title && <h3>{title}</h3>}
          <span className="spacer" />
          <button className="btn btn-ghost icon-btn" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Toasts() {
  const { toasts } = useStore();
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => <div key={t.id} className={`toast pop-in ${t.kind ?? ''}`}>{t.kind === 'reward' ? <Icon name="sparkle" /> : t.kind === 'ok' ? <Icon name="check" /> : t.kind === 'bad' ? <Icon name="info" /> : null}{t.text}</div>)}
    </div>
  );
}

export function Skeleton({ h = 160, w = '100%', r }: { h?: number | string; w?: number | string; r?: number }) {
  return <div className="skel" style={{ height: h, width: w, borderRadius: r }} aria-hidden />;
}
export function TileSkeletons({ n = 6 }: { n?: number }) {
  return <div className="grid-games">{Array.from({ length: n }, (_, i) => <div key={i} className="skel" style={{ aspectRatio: '4/5' }} />)}</div>;
}

export function ErrorBox({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="empty panel">
      <Icon name="info" />
      <p style={{ marginBottom: 12 }}>{message}</p>
      {retry && <button className="btn" onClick={retry}><Icon name="refresh" />Try again</button>}
    </div>
  );
}

export function Empty({ icon = 'sparkle', title, children }: { icon?: string; title: string; children?: ReactNode }) {
  return <div className="empty"><Icon name={icon} /><h4 style={{ marginBottom: 6 }}>{title}</h4>{children && <div className="muted">{children}</div>}</div>;
}

export function Coins({ n, kind = 'ZO' }: { n: number; kind?: 'ZO' | 'CHIPS' }) {
  return (
    <span className="chip" style={kind === 'CHIPS' ? { borderColor: 'rgba(216,180,90,.5)', color: '#f6e3a6' } : { borderColor: 'rgba(255,176,46,.45)', color: '#ffd99c' }} aria-label={`${n} ${kind === 'ZO' ? 'ZO coins' : 'Fun Chips'}`}>
      <span style={{ width: 14, height: 14, borderRadius: '50%', background: kind === 'CHIPS' ? 'repeating-conic-gradient(#d8b45a 0 30deg,#fff 30deg 60deg)' : 'var(--grad-zo)', display: 'inline-block' }} />
      <span className="mono">{n.toLocaleString()}</span>{kind === 'ZO' ? ' ZO' : ''}
    </span>
  );
}

export function useTitle(title: string, description?: string) {
  useEffect(() => {
    document.title = title ? `${title} · PLAYZO` : 'PLAYZO - Aaja PLAYZO pe khelte hain!';
    if (description) document.querySelector('meta[name="description"]')?.setAttribute('content', description);
  }, [title, description]);
}
