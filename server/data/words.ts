/**
 * Word data. The full dictionary (an-array-of-english-words, MIT, ~275k words) validates
 * player input on the server only. Curated common lists drive puzzle generation so
 * starting letters and ladders use familiar words. A blocklist keeps offensive words out.
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ALL: string[] = require('an-array-of-english-words');

/** Words never accepted or shown (kept short and generic on purpose). */
const BLOCK = new Set([
  'damn', 'hell', 'crap', 'piss', 'shit', 'fuck', 'bitch', 'bastard', 'slut', 'whore', 'cunt', 'dick', 'cock', 'twat', 'arse', 'ass',
  'tits', 'boob', 'boobs', 'porn', 'sexy', 'sex', 'nude', 'rape', 'kill', 'drug', 'drugs', 'nazi', 'fag', 'dyke', 'wank', 'turd', 'piss',
  'butt', 'puke', 'spic', 'kike', 'chink', 'gook', 'homo', 'tranny', 'retard', 'negro', 'nigga', 'nigger', 'pussy', 'penis', 'vagina', 'anal', 'anus',
]);
const STRONG = ['fuck', 'shit', 'cunt', 'nigg', 'whore', 'porn', 'bitch'];
export const isBlocked = (w: string) => BLOCK.has(w) || STRONG.some((x) => w.includes(x));

const DICT = new Set<string>();
for (const w of ALL) if (/^[a-z]{3,12}$/.test(w) && !isBlocked(w)) DICT.add(w);
export const isWord = (w: string) => DICT.has(w.toLowerCase());
export const dictionarySize = () => DICT.size;

/** Common seven-distinct-letter words used to build Word Duel honeycombs. */
export const PANGRAM_SEEDS = [
  'pianist', 'thunder', 'jumping', 'kingdom', 'blanket', 'chapter', 'quickly', 'machine', 'fortune', 'garbled', 'magnets', 'parcels',
  'monster', 'lantern', 'cabinet', 'pilgrim', 'dolphin', 'workday', 'paintbox', 'bracelet', 'clothing', 'captured', 'triangle', 'ponytail',
  'tropical', 'marching', 'symphony', 'blousing', 'wildcard', 'sparkle', 'cobwebs', 'harvest', 'teaming', 'stripe', 'factory', 'campfire',
  'farming', 'balcony', 'dynamic', 'outside', 'garden', 'planets', 'notebook', 'climbers', 'raindrops', 'hospital', 'trumpets', 'cupboard',
  'graphics', 'brushing', 'complain', 'midnight', 'squirmed', 'blacken', 'workshop', 'sunlight', 'reaching', 'monkeys', 'question', 'pumpkins',
  'imported', 'stampede', 'dragonfly', 'chipmunk', 'wizards', 'pancakes', 'shipyard', 'chalkier', 'whistle', 'brightly',
];

/** Seeds with exactly seven distinct letters (the honeycomb needs seven). */
export const PANGRAMS = PANGRAM_SEEDS.filter((w) => new Set(w).size === 7 && isWord(w));

/** Common 3- and 4-letter words for Word Ladder generation. */
export const LADDER3 = `cat cot cog dog dig big bag bat bit hit hat hot pot pit pin pan man men ten tan can cap cup pup pig peg leg log lot
let net nut cut cub rub rug bug bun sun son ton top tip tap map mop hop hip lip lap lab cab cob cod god nod not dot dut bad bed bud mud
mad sad sat set sit fit fat fan fun gun gum hum ham jam ram rat red rod rid lid kid kit wit win wig fig fog hog jog job rob rot row cow
how now new few dew den hen pen pet pat vat van ban bin tin fin fix six sip dip din dim him hid had has his hug mug jug tug tag rag wag wet
web wed fed led lad pad paw raw jaw law low bow box fox for far car bar jar tar war was wax tax tab tub sub sum gas`.split(/\s+/);

export const LADDER4 = `cold cord card ward warm worm word wore core care dare dart part pert port post most mist mint mind wind wine mine mile male mole
hole hold bold bolt boat coat cost cast last mast mash wash wish fish dish disk desk dusk husk hunk hung sung sing ring rang hang hand band
bend bond pond fond find fine line lane cane cone bone tone tune dune dine pine pane pale tale tall ball bell belt melt meet feet feel peel
heel heal head heat beat bean mean meat seat sent tent tend lend land sand said paid pail mail main rain gain grin grit grip trip trap tram
team tear year near neat nest best rest test text vest west went want wand bird bard hard harm farm form foam roam road load lord lore more
mare make made fade fame game gate late lake bake cake came come home hope rope rose nose note vote vole sole sold gold good food fool pool
poll pole pile tile time tame same sale safe sage page pace race rice ride hide wide wade wake bike like lime lice nice mice mace face fact
pact pack back bark dark dirk dirt dart cart curt hurt hunt hint lint list lost lose love live give dive dove move mode node nods rods rows
cows owls bowl howl fowl foul four pour sour soup soap snap slap slip ship shop stop step stem stew slew slow blow glow grow crow crew drew
draw drab drop prop prom from frog flog flag flat that than then them hem`.split(/\s+/).filter((w) => w.length === 4);
