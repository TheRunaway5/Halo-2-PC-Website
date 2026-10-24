import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { joinedDate, profileAppearance } from "../lib/profile-appearance.ts";
import type { Player } from "../lib/types.ts";

test("saved appearance bytes select the real species, four palette colors and emblem", () => {
  const appearance = profileAppearance({ format: "halo2-profile-appearance-v1", bytes: "02020004011b000000" } as Player["appearance"])!;
  assert.equal(appearance.species, "elite");
  assert.equal(appearance.foreground, 27); assert.equal(appearance.background, 0);
  assert.deepEqual(appearance.colors[0], appearance.colors[1]);
  assert.ok(appearance.colors[0][0] > appearance.colors[0][1]);
  assert.deepEqual(profileAppearance({ format: "halo2-profile-appearance-v1", bytes: "ff0000000000000000" } as Player["appearance"])!.colors[0], [1,1,1]);
  assert.equal(profileAppearance(null), null);
  assert.equal(profileAppearance({ format: "halo2-profile-appearance-v1", bytes: "02020004021b000000" } as Player["appearance"]), null);
});

test("join date preserves real registration dates and never invents a date for legacy accounts", () => {
  assert.equal(joinedDate(1700000000), "Nov 14, 2023");
  assert.equal(joinedDate(null), null); assert.equal(joinedDate(undefined), null);
  assert.equal(joinedDate(-1), null); assert.equal(joinedDate(Infinity), null);
});

test("profile asset set retains original mesh and bitmap provenance for both species and every emblem", async () => {
  const provenance = JSON.parse(await readFile("public/profile/provenance.json", "utf8"));
  for (const [name, entry] of Object.entries(provenance.assets) as [string, {sha256:string}][]) {
    assert.equal(createHash("sha256").update(await readFile("public/profile/" + name)).digest("hex"), entry.sha256, name);
  }
  for (const species of ["spartan", "elite"]) {
    const model = JSON.parse(await readFile(`public/profile/${species}.json`, "utf8"));
    assert.ok(model.positions.length > 10000);
    assert.equal(model.actor, species === "spartan" ? "ui_player1c" : "ui_player1d");
    assert.equal(model.weapon_definition, species === "spartan" ? "e2be0120" : "e3bd01c1");
    assert.equal(model.normals.length, model.positions.length);
    assert.equal(model.tangents.length, model.positions.length);
    assert.equal(model.binormals.length, model.positions.length);
    for (const group of model.groups.filter((g: {count:number}) => g.count > 0)) {
      const material = model.materials[group.material];
      assert.ok(material.passes.length > 0, material.name);
      for (const pass of material.passes) {
        assert.equal(pass.pixel.length, 60);
        assert.equal(pass.attributes.length, 64);
        assert.equal(pass.constants.length, 64);
        assert.ok(pass.constants.every(Number.isFinite));
        assert.ok(pass.attributes.every(Number.isFinite));
        assert.ok(pass.instructions.length > 0 && pass.instructions.length <= 128 && pass.instructions.length % 4 === 0);
      }
    }
    assert.equal(model.uvs.length, model.positions.length*2/3);
    assert.ok(model.positions.every(Number.isFinite));
    assert.ok(model.groups.every((g: {start:number;count:number;material:number}) => g.start+g.count<=model.positions.length/3 && g.material<model.materials.length));
  }
  assert.equal((await readdir("public/profile/foreground")).length, 64);
  assert.equal((await readdir("public/profile/background")).length, 32);
});
