/**
 * Games shown as box art on the phone Live page, most watched first.
 * `match` lists the category names a stream may carry for that game.
 * Art is the official cover (logo included); Steam's portrait library art
 * where the game is on Steam, our own copies otherwise.
 */
import apexCategory from '@/assets/apex-category.png';
import codCategory from '@/assets/cod-category.png';
import fortniteCategory from '@/assets/fortnite-category.png';
import gtaCategory from '@/assets/gta-category.png';
import valorantCategory from '@/assets/valorant-category.png';
import leagueCategory from '@/assets/league-category.png';
import minecraftCategory from '@/assets/minecraft-category.png';
import lcsCategory from '@/assets/lcs-category.png';

export interface LiveGame {
  id: string;
  name: string;
  image: string;
  match: string[];
}

const steam = (appId: number) =>
  `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_600x900_2x.jpg`;

export const LIVE_GAMES: LiveGame[] = [
  { id: 'lcs', name: 'Last Chad Standing', image: lcsCategory, match: ['last chad standing', 'lcs'] },
  { id: 'gta', name: 'Grand Theft Auto V', image: gtaCategory, match: ['grand theft auto', 'gta'] },
  { id: 'league', name: 'League of Legends', image: leagueCategory, match: ['league of legends', 'lol'] },
  { id: 'valorant', name: 'VALORANT', image: valorantCategory, match: ['valorant'] },
  { id: 'cs2', name: 'Counter-Strike 2', image: steam(730), match: ['counter-strike', 'cs2', 'csgo', 'cs:go'] },
  { id: 'fortnite', name: 'Fortnite', image: fortniteCategory, match: ['fortnite'] },
  { id: 'minecraft', name: 'Minecraft', image: minecraftCategory, match: ['minecraft'] },
  { id: 'apex', name: 'Apex Legends', image: apexCategory, match: ['apex'] },
  { id: 'cod', name: 'Call of Duty', image: codCategory, match: ['call of duty', 'warzone', 'cod'] },
  { id: 'dota2', name: 'Dota 2', image: steam(570), match: ['dota'] },
  { id: 'marvel-rivals', name: 'Marvel Rivals', image: steam(2767030), match: ['marvel rivals'] },
  { id: 'rust', name: 'Rust', image: steam(252490), match: ['rust'] },
  { id: 'overwatch', name: 'Overwatch 2', image: steam(2357570), match: ['overwatch'] },
  { id: 'eafc', name: 'EA SPORTS FC 25', image: steam(2669320), match: ['ea sports fc', 'ea fc', 'fifa'] },
  { id: 'rocket-league', name: 'Rocket League', image: steam(252950), match: ['rocket league'] },
  { id: 'pubg', name: 'PUBG: BATTLEGROUNDS', image: steam(578080), match: ['pubg', 'battlegrounds'] },
  { id: 'dbd', name: 'Dead by Daylight', image: steam(381210), match: ['dead by daylight'] },
  { id: 'r6', name: 'Rainbow Six Siege', image: steam(359550), match: ['rainbow six', 'r6'] },
  { id: 'elden-ring', name: 'ELDEN RING', image: steam(1245620), match: ['elden ring'] },
  { id: 'bg3', name: "Baldur's Gate 3", image: steam(1086940), match: ["baldur's gate", 'baldurs gate', 'bg3'] },
  { id: 'helldivers', name: 'HELLDIVERS 2', image: steam(553850), match: ['helldivers'] },
];

export function streamMatchesGame(category: string | undefined, game: LiveGame): boolean {
  const c = (category || '').toLowerCase();
  return !!c && game.match.some((m) => c.includes(m));
}
