import * as THREE from "three";
import type { ProfileAppearance } from "./profile-appearance";

type ModelData = {
  positions: number[]; normals: number[]; uvs: number[];
  groups: { start: number; count: number; material: number }[];
  materials: { name: string; map: string | null; change: string | null; emblem: boolean }[];
};
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
  const data = await json<ModelData>(`${appearance.species}.json`, signal);
  const loader = new THREE.TextureLoader();
  const textures = new Map<string, THREE.Texture>();
  const loadTexture = async (name: string | null) => {
    if (!name) return null;
    if (!textures.has(name)) {
      const texture = await loader.loadAsync(`/profile/${name}`);
      // The retained model UVs use the cache's top-left texture origin.
      texture.flipY = false;
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.colorSpace = THREE.SRGBColorSpace;
      textures.set(name, texture);
    }
    return textures.get(name)!;
  };
  const materials: THREE.MeshStandardMaterial[] = [];
  let renderer: THREE.WebGLRenderer | undefined;
  const geometry = new THREE.BufferGeometry();
  let observer: ResizeObserver | undefined;
  const dispose = () => {
    observer?.disconnect(); geometry.dispose(); materials.forEach((m) => m.dispose());
    textures.forEach((texture) => texture.dispose());
    renderer?.dispose(); renderer?.forceContextLoss(); renderer?.domElement.remove();
  };
  try {
    const names = [...new Set(data.materials.flatMap((m) => [m.map, m.change]).filter((name): name is string => !!name))];
    await Promise.all(names.map(loadTexture));
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    for (const definition of data.materials) {
      const [map, change] = await Promise.all([loadTexture(definition.map), loadTexture(definition.change)]);
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      const material = new THREE.MeshStandardMaterial({ map, roughness: .63, metalness: .25, side: THREE.DoubleSide,
        transparent: definition.emblem, opacity: definition.emblem ? 0 : 1 });
      if (change) {
        change.colorSpace = THREE.NoColorSpace;
        material.onBeforeCompile = (shader) => {
          shader.uniforms.changeMap = { value: change };
          shader.uniforms.primary = { value: new THREE.Color(...appearance.colors[0] as [number, number, number]) };
          shader.uniforms.secondary = { value: new THREE.Color(...appearance.colors[1] as [number, number, number]) };
          shader.fragmentShader = "uniform sampler2D changeMap; uniform vec3 primary; uniform vec3 secondary;\n" + shader.fragmentShader;
          shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>", `#include <map_fragment>
            vec4 dye=texture2D(changeMap,vMapUv);
            diffuseColor.rgb *= mix(vec3(1.0),primary,dye.r);
            diffuseColor.rgb *= mix(vec3(1.0),secondary,dye.g);`);
        };
      }
      materials.push(material);
    }
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(data.positions, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(data.normals, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(data.uvs, 2));
    data.groups.forEach((g) => geometry.addGroup(g.start, g.count, g.material));
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox!, center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
    geometry.translate(-center.x, -bounds.min.y, -center.z);
    const scene = new THREE.Scene(), model = new THREE.Mesh(geometry, materials);
    model.rotation.y = -.3;
    scene.add(model, new THREE.HemisphereLight(0xdcefff, 0x253647, 2.5));
    const key = new THREE.DirectionalLight(0xffedd8, 3.6); key.position.set(-2, 3, 4); scene.add(key);
    const rim = new THREE.DirectionalLight(0x80caff, 2); rim.position.set(2, 2, -3); scene.add(rim);
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setClearColor(0, 0);
    renderer.domElement.setAttribute("aria-label", `${appearance.species === "elite" ? "Elite" : "Spartan"} player model in saved armor colors`);
    renderer.domElement.setAttribute("role", "img");
    const camera = new THREE.PerspectiveCamera(32, 1, .01, 20);
    camera.position.set(0, size.y*.55, size.y*2.2); camera.lookAt(0, size.y*.5, 0);
    host.replaceChildren(renderer.domElement);
    const render = () => { if (!signal.aborted) renderer!.render(scene, camera); };
    observer = new ResizeObserver(() => {
      const { width, height } = host.getBoundingClientRect();
      renderer!.setSize(width, height); camera.aspect = width / Math.max(height, 1); camera.updateProjectionMatrix(); render();
    });
    observer.observe(host);
    return { dispose, rotate: (delta: number) => { model.rotation.y += delta; render(); }, reset: () => { model.rotation.y = -.3; render(); } };
  } catch (error) { dispose(); throw error; }
}
