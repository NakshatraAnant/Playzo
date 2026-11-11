import { useCtl, playerName } from '../runtime';
import { Icon } from '../../components/Icon';

/** Shared turn indicator + resign control for two-player strategy games. */
export function TurnBanner({ turn, colours, labels }: { turn: string | null; colours: string[]; labels?: string[] }) {
  const ctl = useCtl();
  const players: string[] = ctl.view.players;
  return (
    <div className="row wrap" style={{ justifyContent: 'center' }}>
      {players.map((p, i) => (
        <span key={p} className="chip" style={{ borderColor: turn === p ? colours[i] : undefined, background: turn === p ? `color-mix(in srgb, ${colours[i]} 22%, transparent)` : undefined, color: '#fff' }}>
          <i style={{ width: 12, height: 12, borderRadius: 6, background: colours[i], display: 'inline-block' }} />
          {playerName(ctl, p)}{labels?.[i] ? ` · ${labels[i]}` : ''}{turn === p ? ' · to move' : ''}
        </span>
      ))}
      {turn && !ctl.over && (
        <button className="btn btn-sm btn-ghost" onClick={() => { if (confirm('Resign this game?')) ctl.act({ type: 'resign' }).catch(() => undefined); }}><Icon name="flag" size={14} />Resign</button>
      )}
    </div>
  );
}
export const myTurn = (ctl: ReturnType<typeof useCtl>, turn: string | null) => !!turn && turn === ctl.me && !ctl.busy;
