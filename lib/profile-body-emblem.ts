import type { ProfileAppearance } from "./profile-appearance";

export type PlayerPixelBindings = {
  pixel: number[];
  pixelColors: { word: number; slot: number; signed: boolean }[];
  emblemInputs?: { word: number; input: "foreground_enabled" | "enabled"; mask: number }[];
};
export type BodyEmblemBank = {
  format: "halo2-body-emblem-argb4444-v1";
  width: number; height: number; mip_count: number;
};

export function bodyEmblemPath(appearance: ProfileAppearance) {
  // BC970 clamps the foreground fraction to1; the authored frame curve
  // maps that to64, which 1B0A0 wraps to page0. UI selection is separate.
  const foreground = parseInt(appearance.bytes.slice(10, 12), 16);
  return `body-emblems/${foreground < 64 ? foreground : 0}.bin`;
}

export function playerPixelProgram(pass: PlayerPixelBindings, appearance: ProfileAppearance, bodyEmblem: boolean) {
  const program = [...pass.pixel];
  for (const binding of pass.pixelColors) {
    const rgb = appearance.colors[binding.slot].map((v) => Math.round((binding.signed ? (v + 1) / 2 : v) * 255));
    program[binding.word] = ((program[binding.word] & 0xff000000) | (rgb[0] << 16) | (rgb[1] << 8) | rgb[2]) >>> 0;
  }
  if (bodyEmblem) {
    if (!pass.emblemInputs?.length) throw new Error("The body emblem is missing its original input bindings.");
    for (const binding of pass.emblemInputs) {
      const value = binding.input === "enabled" || !(appearance.flags & 1) ? 0xff000000 : 0;
      program[binding.word] = ((program[binding.word] & ~binding.mask) | (value & binding.mask)) >>> 0;
    }
  }
  return program;
}

export function decodeBodyEmblem(buffer: ArrayBuffer, bank: BodyEmblemBank) {
  if (bank.format !== "halo2-body-emblem-argb4444-v1") throw new Error("Unsupported body emblem artwork.");
  const view = new DataView(buffer), levels = [];
  let width = bank.width, height = bank.height, offset = 0;
  for (let level = 0; level < bank.mip_count; level++) {
    const data = new Uint8Array(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      const word = view.getUint16(offset, true); offset += 2;
      data.set([((word >> 8) & 15) * 17, ((word >> 4) & 15) * 17, (word & 15) * 17, ((word >> 12) & 15) * 17], i * 4);
    }
    levels.push({ data, width, height }); width = Math.max(1, width >> 1); height = Math.max(1, height >> 1);
  }
  if (offset !== buffer.byteLength) throw new Error("Body emblem artwork has an invalid mip chain.");
  return levels;
}

// WebGL2 has no CLAMP_TO_BORDER sampler. Preserve the original transparent
// border at each authored mip, including bilinear taps crossing the edge.
export const bodyEmblemSampler = `
vec4 emblemTexel(sampler2D source,ivec2 p,int level){
  ivec2 extent=textureSize(source,level);
  if(any(lessThan(p,ivec2(0)))||any(greaterThanEqual(p,extent)))return vec4(0);
  return texelFetch(source,p,level);
}
vec4 emblemLevel(sampler2D source,vec2 uv,int level){
  vec2 p=uv*vec2(textureSize(source,level))-.5;
  ivec2 base=ivec2(floor(p));vec2 weight=fract(p);
  return mix(mix(emblemTexel(source,base,level),emblemTexel(source,base+ivec2(1,0),level),weight.x),
             mix(emblemTexel(source,base+ivec2(0,1),level),emblemTexel(source,base+ivec2(1,1),level),weight.x),weight.y);
}
vec4 sampleBodyEmblem(sampler2D source,vec2 uv){
  vec2 size=vec2(textureSize(source,0));
  float footprint=max(length(dFdx(uv)*size),length(dFdy(uv)*size));
  float level=clamp(log2(max(footprint,1.)),0.,7.);
  int lower=int(floor(level));
  return mix(emblemLevel(source,uv,lower),emblemLevel(source,uv,min(lower+1,7)),fract(level));
}`;
