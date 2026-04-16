/**
 * Initialize regl for browser use.
 * Import this at app startup to enable WebGL instanced rendering.
 */
import createREGL from 'regl';
import { initRegl } from './webgl/regl-scatter';

initRegl(createREGL);
