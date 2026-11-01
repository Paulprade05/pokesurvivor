/* (Ultra 3D) Carga three.js (copia local, r160, licencia MIT en LICENSE) y avisa a js/world/ultra3d.js.
 * Es un módulo: ultra3d.js lo pide sólo con la calidad Ultra 3D activada. */
import * as THREE from './three.module.min.js';
window.PS_THREE = THREE;
window.dispatchEvent(new Event('ps-three'));
