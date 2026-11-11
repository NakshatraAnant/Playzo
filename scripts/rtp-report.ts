/** Prints the exact published mathematics for every Lounge simulation (used by docs/LOUNGE_MATH.md). */
import { CATALOGUE } from '../shared/catalogue';
import { loungeMath } from '../server/loungeMath';

for (const g of CATALOGUE.filter((x) => x.env === 'lounge')) {
  const m: any = loungeMath(g.id);
  let line = '';
  if (m?.kind === 'roulette') line = m.bets.map((b: any) => `${b.bet} ${b.pays} ${b.rtp}%`).join(' | ');
  else if (m?.kind === 'slot') line = `RTP ${m.rtp}% (lines ${m.breakdown.lines}%, scatter ${m.breakdown.scatter}%, jackpot ${m.breakdown.jackpot}%) ${m.layout} ${m.mode}`;
  else if (m?.kind === 'plinko') line = m.tables.map((t: any) => `${t.rows}/${t.risk} ${t.rtp}%`).join(' | ');
  else if (m?.bets) line = m.bets.map((b: any) => `${b.bet}${b.pays ? ` ${b.pays}` : ''}${b.rtp !== undefined ? ` ${b.rtp}%` : ''}`).join(' | ') + (m.totals ? ' | totals: ' + m.totals.map((t: any) => `${t.total}:${t.rtp}%`).join(' ') : '');
  else line = `${m?.rule ?? m?.rules ?? m?.note ?? ''} RTP: ${m?.rtp ?? 'n/a'}`;
  console.log(`${g.n}. ${g.title.padEnd(28)} ${line}`);
}
