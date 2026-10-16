// The island "blueprint": every landmark position lives here (single source of truth).
// World units ~ metres. x = east, z = south (towards the camera), y = up.

export const WORLD_HALF = 110; // world spans -110..110 on x and z
export const WORLD_SIZE = WORLD_HALF * 2;
export const SEA_LEVEL = 0;
export const POND_LEVEL = 4.2;
export const PLATEAU_RISE = 3.8;

// Direction *towards* the sun used for the painted (baked) shadows.
// Shadows fall to the south-east, like in the reference pictures.
export const SUN_DIR = (() => {
  const x = -0.42, y = 1.0, z = -0.5;
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
})();
// How far a shadow moves sideways for each metre of height.
export const SHADOW_SHIFT = [-SUN_DIR[0] / SUN_DIR[1], -SUN_DIR[2] / SUN_DIR[1]];

// Island shape = several overlapping ovals.
export const LAND_ELLIPSES = [
  { x: -2, z: -6, rx: 50, rz: 34 }, // main body
  { x: -42, z: 4, rx: 20, rz: 24 }, // Palm Beach (west)
  { x: -40, z: -36, rx: 13, rz: 11 }, // Lighthouse Point (north-west)
  { x: 28, z: -26, rx: 27, rz: 21 }, // forest plateau base (north-east)
  { x: 4, z: 16, rx: 28, rz: 16 }, // home shore (south)
  { x: 62, z: 16, rx: 10, rz: 9.5 }, // Turtle Islet (east)
];
// Water carved out of the land
export const WATER_CUTS = [
  { x: 57, z: -22, rx: 8, rz: 7.5 }, // waterfall lagoon
  { x: 45, z: 3, rx: 8, rz: 7 }, // east bay between islet and plateau
];

export const PLATEAU = { x: 28, z: -27, rx: 21, rz: 14.5 };
export const RAMP = { ax: 3.5, az: -4.5, bx: 12.5, bz: -16.5, width: 4.2 };
export const POND = { x: 28, z: -29, rx: 7.5, rz: 5.5, bottom: 3.0 };
export const RIVER = { pts: [[33, -28.5], [36.5, -27.1], [40, -27.9], [43.5, -26.4], [46.5, -26.9], [50.5, -26.2]], width: 2.4, bottom: 3.45 };
export const WATERFALL = { x: 49.6, z: -26.2, top: POND_LEVEL, width: 3.2 };
export const LIGHTHOUSE_POINT = { x: -40, z: -36, rx: 12, rz: 10, rise: 1.5 };

export const SPAWN = { x: 0.6, z: 34.4 };

export const COTTAGE = { x: -1, z: 27.5, w: 8, d: 6, deck: { x0: -7, x1: 9, z0: 24.5, z1: 36, y: 0.78 } };
export const PIER = { x: 24, z0: 23, z1: 58, w: 3, y: 0.78, end: { x0: 19.5, x1: 28.5, z0: 51, z1: 58 } };
export const BOAT = { x: 30.4, z: 49, rot: 0.08 };
export const BRIDGE = { x0: 33.5, x1: 55, z: 15.5, w: 2.6, y: 0.85, gap0: 40, gap1: 48 };
export const GARDEN = { x: -5, z: 14.5, cols: 4, rows: 2, plot: 2.2, gap: 0.7, extraRows: 1 };
export const SHOP = { x: 15, z: 13, rot: -0.3 };
export const BOARD = { x: 8.5, z: 20.5, rot: -0.15 };
export const CRATE = { x: 6.2, z: 30.8 };
export const CAMPFIRE = { x: -7, z: -3 };
export const PICNIC = { x: -0.5, z: -6.5 };
export const LIGHTHOUSE = { x: -42, z: -39 };
export const LOGS_BLOCK = { x: 8.2, z: -10.6, rot: 0.85 }; // fallen logs on the ramp (project 1)
export const MAILBOX = { x: 9.5, z: 24.2 };

export const ORANGE_BUSHES = [[-18, -9], [-23, 1], [-14, -17], [-27, -11], [-11, -22]];
export const BERRY_BUSHES = [[9, 2], [15, -2], [-14, 6], [19, 4]];

// Dirt paths (polylines) painted onto the ground.
export const PATHS = [
  { w: 2.2, pts: [[0, 23], [-2, 19.5], [-5, 11], [-6, 4], [-7, -1]] },
  { w: 2.0, pts: [[4, 23], [9, 18], [14, 15.5], [20, 17], [24, 22]] },
  { w: 1.8, pts: [[-6, 2], [-1, -2], [3.5, -4.5]] },
  { w: 2.0, pts: [[3.5, -4.5], [8, -10.5], [12.5, -16.5], [17, -21], [22, -24.5]] },
  { w: 1.8, pts: [[-8, -5], [-17, -14], [-26, -24], [-34, -31], [-40, -36]] },
  { w: 1.8, pts: [[16, 15], [24, 15.2], [33, 15.5]] },
  { w: 1.6, pts: [[-9, 0], [-20, 1], [-30, 3]] },
  { w: 1.5, pts: [[56, 15.5], [60, 15], [63, 17]] },
];

// Where trees go. Palms lean; pines live in the forest.
export const PALMS = [
  // Palm Beach
  [-52, -6], [-55, 4], [-49, 14], [-57, 16], [-44, 22], [-50, 25], [-36, 18], [-58, -2], [-46, -12],
  // home shore
  [-14, 26], [-20, 20], [12, 27], [17, 23], [-11, 31],
  // east / lagoon
  [40, 9], [36, 1], [44, -10],
  // islet
  [60, 10], [66, 21], [57, 20], [67, 12],
  // meadow edge & north
  [-30, -20], [-8, -30], [2, -36], [-20, -32],
];
export const PINES = [
  [14, -30], [18, -36], [22, -38], [36, -38], [39, -33], [37, -31], [16, -24], [38, -20], [41, -19],
  [21, -19], [33, -36], [10, -26], [26, -39], [42, -38], [43, -34.5],
];
export const ROUND_TREES = [[-2, -18], [-25, -2], [6, 6], [-33, -8], [24, 5]];
export const ROCKS = [
  // [x, z, size]
  [-46, -42, 2.2], [-36, -45, 1.6], [-50, -30, 1.8], [-33, -40, 1.2],
  [-59, 9, 1.3], [-40, 26, 1.1], [-26, 27, 1.4], [30, 26, 1.2], [-17, 33, 1.0],
  [50, -15, 1.6], [53, -32, 2.0], [36, -10, 1.0], [13, -38, 1.4], [5, -33, 1.2],
  [69, 16, 1.4], [62, 7, 1.0], [-61, -10, 1.6], [-12, -36, 1.3],
];

// Underwater decoration (coral & seaweed) - placed near coasts.
export const CORAL_SPOTS = [
  [8, 41], [-8, 40], [16, 44], [30, 40], [33, 58], [17, 60], [-30, 33], [-62, 22],
  [-67, 0], [70, 26], [72, 8], [64, 27], [-44, -50], [52, 32], [-20, 40], [40, 44],
];

// Fishing zones (decided by where the bobber lands)
export const ISLET_CENTER = { x: 62, z: 16 };
