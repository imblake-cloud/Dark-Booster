export interface SteamGame {
  id: number;
  name: string;
}

export const PREDEFINED_GAMES: SteamGame[] = [
  { id: 730, name: "Counter-Strike 2" },
  { id: 570, name: "Dota 2" },
  { id: 440, name: "Team Fortress 2" },
  { id: 578080, name: "PUBG: BATTLEGROUNDS" },
  { id: 1172470, name: "Apex Legends" },
  { id: 252490, name: "Rust" },
  { id: 271590, name: "Grand Theft Auto V" },
  { id: 4000, name: "Garry's Mod" },
  { id: 105600, name: "Terraria" },
  { id: 431960, name: "Wallpaper Engine" },
  { id: 252950, name: "Rocket League" },
  { id: 359550, name: "Tom Clancy's Rainbow Six Siege" },
  { id: 381210, name: "Dead by Daylight" },
  { id: 292030, name: "The Witcher 3: Wild Hunt" },
  { id: 1085660, name: "Destiny 2" },
  { id: 230410, name: "Warframe" },
  { id: 322330, name: "Don't Starve Together" },
  { id: 394360, name: "Hearts of Iron IV" },
  { id: 289070, name: "Civilization VI" },
  { id: 218620, name: "PAYDAY 2" },
  { id: 1366800, name: "Crosshair X" },
  { id: 1621690, name: "Core Keeper" },
].sort((a, b) => a.name.localeCompare(b.name));
