// All the game's content in one place: fish, crops, recipes, shop, family projects.
// (Keeping content separate from logic means new fish or recipes are one line each.)

export const RARITY = {
  common: { label: 'Common', stars: 1, weight: 60, diff: 0.6, color: '#8bbf6a' },
  uncommon: { label: 'Uncommon', stars: 2, weight: 26, diff: 0.82, color: '#4fa7d8' },
  rare: { label: 'Rare', stars: 3, weight: 9, diff: 1.05, color: '#a77be0' },
  legendary: { label: 'Legendary', stars: 4, weight: 2.2, diff: 1.3, color: '#f2b53a' },
  junk: { label: 'Oops', stars: 0, weight: 0, diff: 0.3, color: '#b0a08a' },
};

// habitats: shore (shallow sea), deep (far out / pier end), pond (forest pond), reef (Turtle Islet)
// time: any | day | night | dawn | dusk | rain
// art: shape + colours used to draw the fish picture in the journal
export const FISH = [
  { id: 'sardine', name: 'Sunny Sardine', hab: ['shore', 'deep'], time: 'any', rar: 'common', size: [10, 18], value: 12, art: { shape: 'slim', body: '#9fc3d9', belly: '#eef6fa', fin: '#7aa6c4', pat: 'stripe1', patc: '#5b8fb3' } },
  { id: 'goby', name: 'Coral Goby', hab: ['shore'], time: 'day', rar: 'common', size: [6, 12], value: 10, art: { shape: 'round', body: '#f39c4a', belly: '#ffd7a8', fin: '#e57a2a', pat: 'bands', patc: '#ffffff' } },
  { id: 'bream', name: 'Sea Bream', hab: ['shore'], time: 'any', rar: 'common', size: [20, 35], value: 18, art: { shape: 'tall', body: '#e9a9a4', belly: '#fbe7e3', fin: '#d98a85', pat: 'none' } },
  { id: 'puffer', name: 'Puffy Pufferfish', hab: ['shore'], time: 'day', rar: 'uncommon', size: [15, 25], value: 35, art: { shape: 'puffer', body: '#f5d35a', belly: '#fff3c2', fin: '#e6b93a', pat: 'spots', patc: '#a9772e' } },
  { id: 'flounder', name: 'Starry Flounder', hab: ['shore'], time: 'night', rar: 'uncommon', size: [25, 45], value: 40, art: { shape: 'flat', body: '#b08a62', belly: '#e9d5b8', fin: '#8f6c49', pat: 'spots', patc: '#f4e3a0' } },
  { id: 'jelly', name: 'Moon Jelly', hab: ['shore', 'deep'], time: 'night', rar: 'uncommon', size: [15, 30], value: 30, art: { shape: 'jelly', body: '#f7c6dc', belly: '#fde8f1', fin: '#e9a3c4', pat: 'none' } },
  { id: 'seahorse', name: 'Little Seahorse', hab: ['shore', 'reef'], time: 'day', rar: 'rare', size: [8, 15], value: 90, art: { shape: 'seahorse', body: '#f5b942', belly: '#ffe29a', fin: '#e89a2a', pat: 'none' } },
  { id: 'mackerel', name: 'Blue Mackerel', hab: ['deep'], time: 'any', rar: 'common', size: [30, 45], value: 22, art: { shape: 'slim', body: '#4f86c6', belly: '#e3eef8', fin: '#3d6ea8', pat: 'waves', patc: '#2a4f80' } },
  { id: 'squid', name: 'Spotted Squid', hab: ['deep'], time: 'night', rar: 'uncommon', size: [20, 40], value: 45, art: { shape: 'squid', body: '#f2a07b', belly: '#ffd9c4', fin: '#e2835a', pat: 'spots', patc: '#c45e3a' } },
  { id: 'octopus', name: 'Ollie Octopus', hab: ['deep', 'reef'], time: 'any', rar: 'uncommon', size: [30, 60], value: 60, art: { shape: 'octopus', body: '#e8746a', belly: '#f7b3a8', fin: '#c95a50', pat: 'spots', patc: '#f9c9b9' } },
  { id: 'tuna', name: 'Golden Tuna', hab: ['deep'], time: 'day', rar: 'rare', size: [60, 120], value: 140, art: { shape: 'big', body: '#e8b84a', belly: '#fff0c4', fin: '#d49a28', pat: 'none' } },
  { id: 'swordfish', name: 'Swordfish', hab: ['deep'], time: 'any', rar: 'rare', size: [100, 200], value: 180, art: { shape: 'sword', body: '#5f7fa8', belly: '#dfe8f2', fin: '#4a6a92', pat: 'none' } },
  { id: 'moonfish', name: 'Moonfish', hab: ['deep'], time: 'night', rar: 'rare', size: [50, 90], value: 160, art: { shape: 'round', body: '#d7dde8', belly: '#f6f8fc', fin: '#b3bccc', pat: 'glow', patc: '#ffffff' } },
  { id: 'grouper', name: 'Gentle Grouper', hab: ['deep'], time: 'any', rar: 'legendary', size: [120, 180], value: 400, art: { shape: 'big', body: '#8f6b4f', belly: '#d9c2a5', fin: '#755540', pat: 'spots', patc: '#5d4330' } },
  { id: 'carp', name: 'Pond Carp', hab: ['pond'], time: 'any', rar: 'common', size: [25, 45], value: 15, art: { shape: 'tall', body: '#a5a35a', belly: '#e5e2b0', fin: '#87853f', pat: 'scales', patc: '#7d7b3a' } },
  { id: 'trout', name: 'Rainbow Trout', hab: ['pond'], time: 'day', rar: 'uncommon', size: [25, 50], value: 40, art: { shape: 'slim', body: '#9fb08f', belly: '#f3e6e0', fin: '#7f9070', pat: 'rainbow', patc: '#f59aa8' } },
  { id: 'frog', name: 'Froggy', hab: ['pond'], time: 'rain', rar: 'uncommon', size: [6, 10], value: 25, art: { shape: 'frog', body: '#7cc95a', belly: '#e9f7c9', fin: '#5aa83c', pat: 'none' } },
  { id: 'catfish', name: 'Whisker Catfish', hab: ['pond'], time: 'night', rar: 'uncommon', size: [40, 70], value: 55, art: { shape: 'catfish', body: '#7d6a5a', belly: '#d8cbb8', fin: '#625244', pat: 'none' } },
  { id: 'koi', name: 'Lucky Koi', hab: ['pond'], time: 'any', rar: 'rare', size: [30, 60], value: 120, art: { shape: 'slim', body: '#fbf6ee', belly: '#ffffff', fin: '#f3e6d6', pat: 'patches', patc: '#f2793a' } },
  { id: 'goldkoi', name: 'Golden Koi', hab: ['pond'], time: 'dusk', rar: 'legendary', size: [40, 70], value: 450, art: { shape: 'slim', body: '#f5c542', belly: '#fff0b0', fin: '#e8a92a', pat: 'glow', patc: '#fff8d0' } },
  { id: 'clown', name: 'Clownfish', hab: ['reef'], time: 'any', rar: 'common', size: [7, 11], value: 30, art: { shape: 'round', body: '#f5893a', belly: '#ffc690', fin: '#e06a20', pat: 'bands', patc: '#ffffff' } },
  { id: 'tang', name: 'Blue Tang', hab: ['reef'], time: 'day', rar: 'common', size: [15, 25], value: 35, art: { shape: 'tall', body: '#3f7fe0', belly: '#6fa3f0', fin: '#f5d35a', pat: 'none' } },
  { id: 'angel', name: 'Angelfish', hab: ['reef'], time: 'day', rar: 'uncommon', size: [15, 30], value: 60, art: { shape: 'angel', body: '#f5d35a', belly: '#fff0a8', fin: '#4f86c6', pat: 'stripes', patc: '#4f86c6' } },
  { id: 'parrot', name: 'Parrotfish', hab: ['reef'], time: 'any', rar: 'uncommon', size: [30, 60], value: 70, art: { shape: 'tall', body: '#4fc4a0', belly: '#c5f0e0', fin: '#f58fb5', pat: 'scales', patc: '#2f9a7a' } },
  { id: 'lion', name: 'Lionfish', hab: ['reef'], time: 'night', rar: 'rare', size: [20, 35], value: 150, art: { shape: 'lion', body: '#f3e3d3', belly: '#fff6ee', fin: '#d9534a', pat: 'stripes', patc: '#c9473d' } },
  { id: 'manta', name: 'Manta Ray', hab: ['reef', 'deep'], time: 'any', rar: 'legendary', size: [150, 300], value: 500, art: { shape: 'ray', body: '#3d4f6e', belly: '#e8eef6', fin: '#2e3d57', pat: 'none' } },
  { id: 'pearl', name: 'Pearl Oyster', hab: ['reef', 'deep'], time: 'any', rar: 'rare', size: [8, 14], value: 200, art: { shape: 'oyster', body: '#b9a99a', belly: '#f6f0ff', fin: '#988776', pat: 'none' } },
  { id: 'boot', name: 'Old Boot', hab: ['any'], time: 'any', rar: 'junk', size: [25, 30], value: 2, junk: true, art: { shape: 'boot', body: '#7a5a42', belly: '#5d4330', fin: '#e6cf9a', pat: 'none' } },
];
export const FISH_BY_ID = Object.fromEntries(FISH.map((f) => [f.id, f]));
export const JOURNAL_FISH = FISH.filter((f) => !f.junk); // what counts towards the collection

// Extra things that can come up on the hook
export const HOOK_EXTRAS = [
  { id: 'seaglass', chance: 0.06 },
  { id: 'bottle', chance: 0.022 },
  { id: 'chest', chance: 0.009 },
];

export const CROPS = {
  carrot: { name: 'Carrot', emoji: '🥕', stage: 40, yield: [2, 3], seed: 8, value: 20, color: '#f2822f', leaf: '#5fae45' },
  strawberry: { name: 'Strawberry', emoji: '🍓', stage: 55, yield: [3, 4], seed: 14, value: 14, color: '#e8384f', leaf: '#4f9e3c' },
  potato: { name: 'Potato', emoji: '🥔', stage: 50, yield: [3, 4], seed: 10, value: 14, color: '#c9a06a', leaf: '#6fb050' },
  tomato: { name: 'Tomato', emoji: '🍅', stage: 65, yield: [2, 3], seed: 18, value: 28, color: '#e8463a', leaf: '#4f9e3c' },
  corn: { name: 'Corn', emoji: '🌽', stage: 75, yield: [2, 3], seed: 22, value: 32, color: '#f5cf4a', leaf: '#7cb64a' },
  sunflower: { name: 'Sunflower', emoji: '🌻', stage: 60, yield: [1, 2], seed: 15, value: 40, color: '#f5c542', leaf: '#5fae45' },
  pumpkin: { name: 'Pumpkin', emoji: '🎃', stage: 110, yield: [1, 1], seed: 40, value: 130, color: '#f28c28', leaf: '#5fae45' },
};

// Every item that can sit in the family basket
export const ITEMS = {
  shell: { name: 'Scallop Shell', emoji: '🐚', value: 6, kind: 'forage' },
  starfish: { name: 'Starfish', emoji: '⭐', value: 10, kind: 'forage' },
  coral: { name: 'Coral Bit', emoji: '🪸', value: 14, kind: 'forage' },
  driftwood: { name: 'Driftwood', emoji: '🪵', value: 4, kind: 'material' },
  seaglass: { name: 'Sea Glass', emoji: '💎', value: 25, kind: 'material' },
  coconut: { name: 'Coconut', emoji: '🥥', value: 12, kind: 'food' },
  orange: { name: 'Orange', emoji: '🍊', value: 8, kind: 'food' },
  berry: { name: 'Blueberries', emoji: '🫐', value: 6, kind: 'food' },
  mushroom: { name: 'Mushroom', emoji: '🍄', value: 9, kind: 'food' },
  flower: { name: 'Wildflower', emoji: '🌸', value: 5, kind: 'forage' },
  bottle: { name: 'Message in a Bottle', emoji: '🍾', value: 0, kind: 'special' },
  chest: { name: 'Treasure Chest', emoji: '🧰', value: 0, kind: 'special' },
  shrimp: { name: 'Shrimp Bait', emoji: '🦐', value: 0, kind: 'bait' },
  lure: { name: 'Golden Lure', emoji: '✨', value: 0, kind: 'bait' },
};
for (const [id, c] of Object.entries(CROPS)) {
  ITEMS[id] = { name: c.name, emoji: c.emoji, value: c.value, kind: 'crop' };
  ITEMS['seed:' + id] = { name: c.name + ' Seeds', emoji: '🌱', value: 0, kind: 'seed', crop: id, cropEmoji: c.emoji };
}
for (const f of FISH) ITEMS['fish:' + f.id] = { name: f.name, emoji: f.junk ? '🥾' : '🐟', value: f.value, kind: f.junk ? 'junk' : 'fish', fish: f.id };

export const RECIPES = [
  { id: 'grilled', name: 'Grilled Fish', emoji: '🍢', needs: { anyFish: 1 }, value: 40, time: 3 },
  { id: 'smoothie', name: 'Coconut Smoothie', emoji: '🥤', needs: { coconut: 1, berry: 1 }, value: 45, time: 3 },
  { id: 'jam', name: 'Berry Jam', emoji: '🍯', needs: { berry: 3 }, value: 45, time: 3 },
  { id: 'skewer', name: 'Mushroom Skewer', emoji: '🍡', needs: { mushroom: 2 }, value: 45, time: 3 },
  { id: 'salad', name: 'Fruit Salad', emoji: '🥗', needs: { orange: 1, berry: 1, strawberry: 1 }, value: 70, time: 3 },
  { id: 'soup', name: 'Fish Soup', emoji: '🍲', needs: { anyFish: 2, carrot: 1 }, value: 95, time: 4 },
  { id: 'stew', name: 'Veggie Stew', emoji: '🍛', needs: { carrot: 1, tomato: 1, potato: 1 }, value: 110, time: 4 },
  { id: 'tacos', name: 'Fish Tacos', emoji: '🌮', needs: { anyFish: 1, corn: 1, tomato: 1 }, value: 125, time: 4 },
  { id: 'cake', name: 'Coconut Cake', emoji: '🍰', needs: { coconut: 2, strawberry: 2 }, value: 150, time: 4 },
  { id: 'pie', name: 'Pumpkin Pie', emoji: '🥧', needs: { pumpkin: 1, coconut: 1 }, value: 230, time: 5 },
  { id: 'feast', name: 'Family Feast', emoji: '🍱', needs: { soup: 1, salad: 1, stew: 1 }, value: 600, time: 6, special: true },
];
for (const r of RECIPES) ITEMS[r.id] = { name: r.name, emoji: r.emoji, value: r.value, kind: 'dish' };

export const SHOP = [
  { item: 'seed:carrot', n: 3, price: 8 * 3 },
  { item: 'seed:potato', n: 3, price: 10 * 3 },
  { item: 'seed:strawberry', n: 3, price: 14 * 3 },
  { item: 'seed:tomato', n: 3, price: 18 * 3 },
  { item: 'seed:corn', n: 3, price: 22 * 3 },
  { item: 'seed:sunflower', n: 3, price: 15 * 3 },
  { item: 'seed:pumpkin', n: 1, price: 40 },
  { item: 'shrimp', n: 5, price: 30 },
  { item: 'lure', n: 1, price: 90 },
];

export const BAITS = [
  { id: 'worm', name: 'Worm', emoji: '🪱', free: true, desc: 'Free & friendly. Fish like it!' },
  { id: 'bread', name: 'Bread', emoji: '🍞', free: true, desc: 'Fish bite a little faster.' },
  { id: 'shrimp', name: 'Shrimp', emoji: '🦐', item: 'shrimp', desc: 'Rare fish come more often.' },
  { id: 'lure', name: 'Golden Lure', emoji: '✨', item: 'lure', desc: 'Best chance for legendary fish!' },
];

// Family projects: everyone chips in to fix up the island.
// needs: item ids, or groups (anyCrop, anyDish), coins, journal (species caught - counted automatically)
export const PROJECTS = [
  { id: 'path', name: 'Clear the Forest Path', emoji: '🌲', desc: 'Fallen logs block the way up to the forest pond. Bring driftwood to build a ramp over them!', needs: { driftwood: 6, coins: 30 }, reward: 'Opens the Forest Pond — new fish live there!' },
  { id: 'bridge', name: 'Mend the Old Bridge', emoji: '🌉', desc: 'The rope bridge to Turtle Islet is broken. Let’s fix it together!', needs: { driftwood: 12, coins: 120 }, reward: 'Opens Turtle Islet: reef fish and buried treasure!' },
  { id: 'picnic', name: 'Cozy Picnic Spot', emoji: '🧺', desc: 'A blanket, a table and bunting by the campfire for family picnics.', needs: { flower: 8, anyDish: 2, coins: 80 }, reward: 'A picnic spot appears in the meadow.' },
  { id: 'garden', name: 'Bigger Garden', emoji: '🥕', desc: 'Grow more veggies with four new garden plots.', needs: { anyCrop: 8, coins: 150 }, reward: '+4 garden plots.' },
  { id: 'lighthouse', name: 'Light the Lighthouse', emoji: '💡', desc: 'The old crystal lighthouse needs sea glass to shine again.', needs: { seaglass: 5, coins: 250 }, reward: 'The lighthouse glows at night and night fish bite more!' },
  { id: 'festival', name: 'Lantern Festival', emoji: '🏮', desc: 'The big celebration! Finish every project, discover 20 kinds of fish and cook a Family Feast.', needs: { journal: 20, feast: 1, coins: 600 }, after: ['path', 'bridge', 'picnic', 'garden', 'lighthouse'], reward: 'Fireworks every night and a Golden Crown for everyone!' },
];
export const PROJECT_BY_ID = Object.fromEntries(PROJECTS.map((p) => [p.id, p]));

export const BOTTLE_NOTES = [
  'Why did the fish blush? Because it saw the ocean’s bottom! 🐠',
  'A wish for you: may your basket be full and your hat never blow away. 🎩',
  'Riddle: What has hands but can’t clap? (A clock!) ⏰',
  'Dear finder, today is a great day to give someone a hug. 🤗',
  'Fun fact: Seahorse dads carry the babies! 🐴',
  'What do you call a fish with no eyes? A fsh! 😄',
  'The best treasure on this island is the people you share it with. 💛',
  'Riddle: I’m full of holes but still hold water. What am I? (A sponge!) 🧽',
  'Fun fact: Octopuses have three hearts! 🐙',
  'Psst… the Golden Koi loves sunsets at the forest pond. 🌅',
  'Fun fact: Starfish can grow back their arms! ⭐',
  'Why are fish so smart? They live in schools! 🏫',
  'If you’re reading this, you deserve a snack break. 🍪',
  'Legend says the Manta Ray glides near Turtle Islet… 🌊',
  'Knock knock! Who’s there? Water. Water who? Water you doing? Go fishing! 🎣',
];

export const LETTERS = [
  { from: 'Captain Shelly', text: 'Morning, islanders! Here are some seeds to start your day.', gift: { 'seed:carrot': 3 } },
  { from: 'Grandma Gull', text: 'I saw you fishing yesterday! Have some coins for ice cream.', gift: { coins: 40 } },
  { from: 'Mochi the Cat', text: 'meow. (Mochi left you a shiny shell.)', gift: { shell: 2 } },
  { from: 'The Island', text: 'The tide brought these in overnight.', gift: { driftwood: 3 } },
  { from: 'Captain Shelly', text: 'Strawberries taste better when grown together!', gift: { 'seed:strawberry': 3 } },
  { from: 'Grandma Gull', text: 'A little something for the family jar. Love you all!', gift: { coins: 60 } },
  { from: 'Captain Shelly', text: 'These shrimp are the best bait in the sea. Shh!', gift: { shrimp: 3 } },
  { from: 'Mochi the Cat', text: 'meow meow. (A pumpkin seed? Where did Mochi find that?)', gift: { 'seed:pumpkin': 1 } },
];

export const START_STATE = {
  coins: 50,
  basket: { 'seed:carrot': 4, 'seed:strawberry': 2, shrimp: 2 },
  hats: ['straw', 'sunhat', 'cap', 'beanie'],
};

export const itemName = (id) => ITEMS[id]?.name || id;
export const itemEmoji = (id) => ITEMS[id]?.emoji || '❔';
