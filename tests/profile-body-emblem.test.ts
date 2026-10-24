import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { bodyEmblemPath, decodeBodyEmblem, playerPixelProgram } from "../lib/profile-body-emblem.ts";
import { profileAppearance } from "../lib/profile-appearance.ts";
import type { Player } from "../lib/types.ts";

const appearance = (bytes: string) => profileAppearance({ format: "halo2-profile-appearance-v1", bytes } as Player["appearance"])!;
const reference = JSON.parse(await readFile("tests/fixtures/body-emblem/original-draw.json", "utf8"));

for (const species of ["spartan", "elite"]) {
  test(`${species} body emblem keeps the original draw program, colors and foreground toggle`, async () => {
    const model = JSON.parse(await readFile(`public/profile/${species}.json`, "utf8"));
    const material = model.materials.find((m: {emblem:boolean}) => m.emblem);
    const pass = material.passes[0];
    assert.ok(pass.name.endsWith("emblem_overlay_simple"));
    assert.deepEqual(pass.emblemInputs, [
      { word: 12, input: "foreground_enabled", mask: 0xff000000 },
      { word: 14, input: "enabled", mask: 0xff000000 },
    ]);
    const selected = appearance(reference.appearance);
    const baseline = playerPixelProgram(pass, selected, true);
    assert.deepEqual(baseline, reference.program, "all 60 words must match the independently captured original draw");
    assert.equal(bodyEmblemPath(selected), "body-emblems/26.bin");
    for (let flags = 0; flags < 256; flags++) {
      const changed = { ...selected, flags, background: 31, colors: [[1,0,0],[0,1,0],selected.colors[2],selected.colors[3]] };
      const expected = [...baseline]; expected[12] = flags & 1 ? 0 : 0xff000000;
      assert.deepEqual(playerPixelProgram(pass, changed, true), expected, `flags ${flags}: armor must not consume UI background, body colors or flip/opacity inputs`);
    }
    assert.deepEqual(pass.pixel, baseline, "binding one player must not mutate the shared source bank");
  });
}

test("all 64 foregrounds retain their eight authored mips; page26 matches the original GPU upload", async () => {
  const bank = JSON.parse(await readFile("public/profile/body-emblem.json", "utf8"));
  assert.equal(bank.width, 128); assert.equal(bank.height, 128); assert.equal(bank.mip_count, 8);
  for (let page = 0; page < 64; page++) {
    const bytes = await readFile(`public/profile/body-emblems/${page}.bin`);
    const levels = decodeBodyEmblem(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), bank);
    assert.deepEqual(levels.map(({width,height}) => [width,height]), [128,64,32,16,8,4,2,1].map((n) => [n,n]));
    const hash = createHash("sha256"); levels.forEach(({data}) => hash.update(data));
    const actual = hash.digest("hex");
    assert.equal(actual, bank.pages[page].rgba_sha256, `source pixels changed on page ${page}`);
    if (page === 26) assert.equal(actual, reference.rgba_sha256, "decoded bytes must match the original uploaded texture including all mips");
  }
  for (let foreground = 0; foreground < 256; foreground++) {
    const selected = appearance(`080c090100${foreground.toString(16).padStart(2,"0")}090000`);
    assert.equal(bodyEmblemPath(selected), `body-emblems/${foreground < 64 ? foreground : 0}.bin`);
  }
});
