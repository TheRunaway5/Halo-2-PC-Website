import * as THREE from "three";
import type { ProfileAppearance } from "./profile-appearance";

const json = async <T,>(path: string, signal: AbortSignal): Promise<T> => {
  const response = await fetch(`/profile/${path}`, { signal });
  if (!response.ok) throw new Error("Player artwork could not be loaded.");
  return response.json();
};
const packed = (rgb: number[], alpha = 0) => ((alpha << 24) | (Math.round(rgb[0] * 255) << 16) | (Math.round(rgb[1] * 255) << 8) | Math.round(rgb[2] * 255)) >>> 0;

export async function emblemImage(appearance: ProfileAppearance, signal: AbortSignal): Promise<string> {
  const [program, shader, front, back] = await Promise.all([
    json<number[]>("emblem-program.json", signal),
    fetch("/profile/combiner.glsl", { signal }).then((r) => { if (!r.ok) throw new Error("Emblem artwork could not be loaded."); return r.text(); }),
    new THREE.TextureLoader().loadAsync(`/profile/foreground/${appearance.foreground}.png`),
    new THREE.TextureLoader().loadAsync(`/profile/background/${appearance.background}.png`),
  ]);
  // The captured live program's animated color slots are the four original
  // appearance channels. Preserve the remaining NV2A combiner words verbatim.
  program[11] = packed(appearance.colors[0]); program[19] = packed(appearance.colors[1]);
  program[14] = packed(appearance.colors[2], 255); program[22] = packed(appearance.colors[3]);
  program[25] = 0xff000000; // Website widget opacity is fully visible.
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(256, 256); renderer.setClearColor(0, 0);
  const scene = new THREE.Scene();
  const geometry = new THREE.PlaneGeometry(2, 2);
  const material = new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, transparent: true,
    uniforms: { pixelProgram: { value: new Uint32Array(program) }, foreground: { value: front }, background: { value: back },
      toggle: { value: (appearance.flags & 1) ? 0 : 1 }, flip: { value: new THREE.Vector2(appearance.flags & 2 ? -1 : 1, appearance.flags & 4 ? -1 : 1) } },
    vertexShader: "precision highp float; in vec3 position; in vec2 uv; out vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position,1.0);}",
    fragmentShader: `precision highp float; precision highp int;
      uniform uint pixelProgram[60]; uniform sampler2D foreground; uniform sampler2D background;
      uniform float toggle; uniform vec2 flip; in vec2 vUv; out vec4 outColor;
      #define H2_COMBINER_WORD(index) pixelProgram[index]
      ${shader}
      void main(){vec4 samples[4]; samples[0]=texture(background,vUv);
        samples[1]=texture(foreground,(vUv-.5)*flip+.5)*toggle;samples[2]=vec4(0);samples[3]=vec4(0);
        outColor=runCombiners(samples,vec4(1),vec4(0));}`,
  });
  try {
    scene.add(new THREE.Mesh(geometry, material));
    renderer.render(scene, new THREE.Camera());
    return renderer.domElement.toDataURL("image/png");
  } finally { geometry.dispose(); material.dispose(); front.dispose(); back.dispose(); renderer.dispose(); renderer.forceContextLoss(); }
}

export async function mountPlayerModel(host: HTMLElement, appearance: ProfileAppearance, signal: AbortSignal) {
  const [{ mountRetailModel }, emblem] = await Promise.all([
    import("./profile-model"), emblemImage(appearance, signal),
  ]);
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  return mountRetailModel(host, appearance, signal, emblem);
}
