import * as THREE from 'three'

/**
 * Filete dourado: uma casca um pouco maior que o objeto, desenhada só por dentro
 * (BackSide), de modo que aparece apenas como borda em volta dele.
 */
export const outlineMaterial = new THREE.MeshBasicMaterial({ color: '#ffe6a8', side: THREE.BackSide })
