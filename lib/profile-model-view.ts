import * as THREE from "three";

/** Keep the pose's source coordinates; only its presentation transform moves. */
export function profileModelFrame(positions: ArrayLike<number>, origin: readonly number[]) {
  const bounds = new THREE.Box3();
  const point = new THREE.Vector3();
  for (let i = 0; i < positions.length; i += 3) bounds.expandByPoint(point.fromArray(positions, i));
  const localCenter = bounds.getCenter(new THREE.Vector3());
  const center = localCenter.clone().add(new THREE.Vector3(...origin as [number, number, number]));
  return {
    center,
    createPivot() {
      const pivot = new THREE.Group(), model = new THREE.Group();
      pivot.position.copy(center); model.position.copy(localCenter).negate(); pivot.add(model);
      return { pivot, model };
    },
    distance(aspect: number, fieldOfView: number) {
      const verticalSlope = Math.tan(THREE.MathUtils.degToRad(fieldOfView / 2));
      const horizontalSlope = verticalSlope * aspect;
      let distance = 0;
      // For every possible Z rotation, a vertex has horizontal radius r.
      // Bound its perspective projection using its own radius and height,
      // so the weapon and extremities stay inside even in narrow viewports.
      const horizontalFactor = Math.sqrt(1 + 1 / (horizontalSlope * horizontalSlope));
      for (let i = 0; i < positions.length; i += 3) {
        const radius = Math.hypot(positions[i] - localCenter.x, positions[i + 1] - localCenter.y);
        const height = Math.abs(positions[i + 2] - localCenter.z);
        distance = Math.max(distance, radius * horizontalFactor, height / verticalSlope + radius);
      }
      return distance * 1.12;
    },
  };
}
