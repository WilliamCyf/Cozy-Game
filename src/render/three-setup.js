// Must be imported before anything creates colours.
// We pick colours exactly as they should appear on screen, so turn off three.js's
// automatic colour conversion ("what you write is what you see").
import * as THREE from 'three';
THREE.ColorManagement.enabled = false;
