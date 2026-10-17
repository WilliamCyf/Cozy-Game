// All Thai translations, gathered from each part of the game.
import data from './data.js';
import panels from './panels.js';
import ui from './ui.js';
import game from './game.js';
import host from './host.js';

export const PARTS = { data, panels, ui, game, host };
export default { ...data, ...host, ...game, ...ui, ...panels };
