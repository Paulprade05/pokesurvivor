/* ============ firebase-config.js — conexión con tu proyecto de Firebase ============
 * Pega aquí la configuración de tu app web de Firebase (Consola de Firebase >
 * Configuración del proyecto > Tus apps > SDK setup and configuration > Config).
 * Los pasos completos están en docs/FIREBASE.md.
 *
 * Estos datos NO son secretos: Firebase los diseña para ir en la web. Lo que
 * protege las partidas son las reglas de Firestore (firestore.rules).
 *
 * Si se pone a null, el juego funciona en modo local (sólo en el navegador).
 */
// Proyecto pokesurvivor-paul (desde el 23-10-2026; plan Spark, gratis): el de esta copia,
// publicada en paulprade05.github.io/pokesurvivor. Autenticación normal de Firebase, SIN
// Identity Platform, así las cuentas son gratis sin límite. ¡No pulsar nunca
// "Actualizar a Identity Platform" en su consola! (El juego original usa pokesurvivor-free,
// que sólo acepta su web.)
G.FIREBASE_CONFIG = {
  apiKey: 'AIzaSyC7xEky_22lk37rxkiWaQ9Y4tX3af0RV1c',
  authDomain: 'pokesurvivor-paul.firebaseapp.com',
  projectId: 'pokesurvivor-paul',
  storageBucket: 'pokesurvivor-paul.firebasestorage.app',
  messagingSenderId: '370109001942',
  appId: '1:370109001942:web:8b96bce72cf6dea1391977',
  databaseURL: 'https://pokesurvivor-paul-default-rtdb.europe-west1.firebasedatabase.app'
};

// El TURN propio del juego original (ice.pokesurvivor.com) no es de esta copia: el
// cooperativo va sólo con conexión directa (STUN gratis). Ver js/net/net.js.
G.TURN_API = '';

/* Ejemplo de cómo debe quedar:
G.FIREBASE_CONFIG = {
  apiKey: 'AIza...',
  authDomain: 'tu-proyecto.firebaseapp.com',
  projectId: 'tu-proyecto',
  storageBucket: 'tu-proyecto.firebasestorage.app',
  messagingSenderId: '1234567890',
  appId: '1:1234567890:web:abc123'
};
*/
