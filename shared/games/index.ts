/** Replay-verified engines: run on the client for play and on the server for verification. */
import type { Engine } from '../engine';
import { mindMaze } from './mindMaze';
import { patternHunter } from './patternHunter';
import { numberRush } from './numberRush';
import { logicLock } from './logicLock';
import { sequenceMaster } from './sequenceMaster';
import { gridGenius } from './gridGenius';
import { blockBattle } from './blockBattle';
import { towerTactics } from './towerTactics';
import { reflexArena } from './reflexArena';
import { colorDash } from './colorDash';
import { rhythmRush } from './rhythmRush';
import { obstacleSprint } from './obstacleSprint';

export const REPLAY_ENGINES: Record<string, Engine> = Object.fromEntries(
  [mindMaze, patternHunter, numberRush, logicLock, sequenceMaster, gridGenius, blockBattle, towerTactics, reflexArena, colorDash, rhythmRush, obstacleSprint].map((e) => [e.id, e as Engine]),
);
