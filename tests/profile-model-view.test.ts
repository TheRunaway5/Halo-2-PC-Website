import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { profileModelFrame } from "../lib/profile-model-view.ts";

for (const species of ["spartan", "elite"]) {
  test(`${species} stays centered on its actual rotation pivot and fits at every view angle`, async () => {
    const data = JSON.parse(await readFile(`public/profile/${species}.json`, "utf8"));
    const positions = new Float32Array(data.positions);
    const frame = profileModelFrame(positions, data.origin);
    const { pivot, model } = frame.createPivot();
    const base = frame.createPivot();
    const bounds = new THREE.Box3().setFromBufferAttribute(new THREE.BufferAttribute(positions, 3));
    const localCenter = bounds.getCenter(new THREE.Vector3());
    const original = new THREE.Vector3().fromArray(positions).add(new THREE.Vector3(...data.origin as [number, number, number]));
    pivot.updateMatrixWorld(true);
    assert.ok(new THREE.Vector3().fromArray(positions).applyMatrix4(model.matrixWorld).distanceTo(original) < 1e-6, "initial source world pose must not change");
    for (let angle = 0; angle < 360; angle += 10) {
      pivot.rotation.z = base.pivot.rotation.z = THREE.MathUtils.degToRad(angle);
      pivot.updateMatrixWorld(true); base.pivot.updateMatrixWorld(true);
      assert.ok(localCenter.clone().applyMatrix4(model.matrixWorld).distanceTo(frame.center) < 1e-6, `model center drifted at ${angle} degrees`);
      assert.deepEqual(model.matrixWorld.elements, base.model.matrixWorld.elements, "color and depth passes must share the same pivot");
      for (const aspect of [.4, .7, 1, 1.6]) {
        const camera = new THREE.PerspectiveCamera(35, aspect, .01, 100);
        camera.up.set(0, 0, 1);
        camera.position.copy(frame.center); camera.position.y -= frame.distance(aspect, camera.fov);
        camera.lookAt(frame.center); camera.updateMatrixWorld(true);
        const projectedCenter = frame.center.clone().project(camera);
        assert.ok(Math.abs(projectedCenter.x) < 1e-6 && Math.abs(projectedCenter.y) < 1e-6, "pivot must project to the viewport center");
        const transform = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(model.matrixWorld);
        const point = new THREE.Vector3();
        for (let i = 0; i < positions.length; i += 3) {
          point.fromArray(positions, i).applyMatrix4(transform);
          assert.ok(Math.abs(point.x) < 1 && Math.abs(point.y) < 1 && Math.abs(point.z) < 1, `figure clipped at ${angle} degrees, aspect ${aspect}`);
        }
      }
    }
  });
}
