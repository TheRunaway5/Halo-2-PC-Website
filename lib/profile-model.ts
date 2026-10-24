import * as THREE from "three";
import type { ProfileAppearance } from "./profile-appearance";

type ImageBinding = { type: "2d" | "cube"; images: string[] };
type RetailPass = {
  name: string; pixel: number[]; attributes: number[]; constants: number[];
  instructions: number[]; stages: (ImageBinding | null)[]; accumulation: number;
  pixelColors: { word: number; slot: number; signed: boolean }[];
  vertexColors: { bank: number; register: number; slot: number }[];
  states: Record<number, number>;
  samplers: { flags: number[]; bump: number[] }[];
};
type ModelData = {
  positions: number[]; normals: number[]; tangents: number[]; binormals: number[]; uvs: number[];
  origin: number[]; camera: number[]; actor: string;
  groups: { start: number; count: number; material: number }[];
  materials: { name: string; body: boolean; emblem: boolean; passes: RetailPass[] }[];
};
const read = async (name: string, signal: AbortSignal) => {
  const response = await fetch(`/profile/${name}`, { signal });
  if (!response.ok) throw new Error("Player artwork could not be loaded.");
  return response;
};
const vectors = (values: number[]) => Array.from({ length: values.length / 4 }, (_, i) => new THREE.Vector4(...values.slice(i * 4, i * 4 + 4) as [number, number, number, number]));
const rgbWord = (rgb: number[]) => (Math.round(rgb[0] * 255) << 16) | (Math.round(rgb[1] * 255) << 8) | Math.round(rgb[2] * 255);
const wrapping = (mode: number) => mode === 1 ? THREE.RepeatWrapping : mode === 2 ? THREE.MirroredRepeatWrapping : THREE.ClampToEdgeWrapping;
const blendFactor = (value: number): THREE.BlendingDstFactor => {
  switch (value) {
    case 0: return THREE.ZeroFactor;
    case 1: return THREE.OneFactor;
    case 0x302: return THREE.SrcAlphaFactor;
    case 0x303: return THREE.OneMinusSrcAlphaFactor;
    case 0x300: return THREE.SrcColorFactor;
    case 0x301: return THREE.OneMinusSrcColorFactor;
    default: throw new Error("Unsupported character shader blend state.");
  }
};

// This executes the retained NV2A programs. Only the final clip projection is
// fitted to the web panel; shader coordinates stay in the authored Z-up world.
const vertexHeader = `precision highp float; precision highp int;
  uniform mat4 projectionMatrix, modelViewMatrix, modelMatrix;
  uniform vec3 cameraPosition; uniform vec3 viewRight, viewUp, viewBack;
  uniform mat4 viewProjection; uniform vec2 screenSize;
  uniform uvec4 vertexInstructions[32]; uniform uint instructionCount;
  uniform vec4 vertexAttributes[16], vertexConstants[16];
  in vec3 position, normal, tangent, binormal; in vec2 uv;
  out vec4 stageCoordinates[4]; out vec4 primaryColor, secondaryColor;
  #define H2_VERTEX_REFERENCE_CONSTANTS
  #define texcoord uv
  #define incident vec3(0)
  #define lightmapCoord vec2(0)
  vec4 vpConstant(uint i) {
    if(i<4u)return vec4(viewProjection[0][i],viewProjection[1][i],viewProjection[2][i],viewProjection[3][i]);
    if(i==8u)return vec4(screenSize.x*.5,0,0,(screenSize.x+1.)*.5+.03125);
    if(i==9u)return vec4(0,screenSize.y*-.5,0,(screenSize.y+1.)*.5+.03125);
    if(i==10u)return vec4(screenSize.x*.5,screenSize.y*-.5,16777215,0);
    if(i==11u)return vec4(screenSize*.5+.5,0,0);
    if(i==4u)return vec4(viewRight,1); if(i==5u)return vec4(viewUp,.5);
    if(i==6u)return vec4(viewBack,2); if(i==7u)return vec4(cameraPosition,767.8125);
    if(i>=18u && i<34u)return vertexConstants[i-18u];
    if(i==172u)return vec4(1,1,0,0);
    return vec4(0);
  }
`;

export async function mountRetailModel(host: HTMLElement, appearance: ProfileAppearance, signal: AbortSignal, emblem: string) {
  const [data, vertexProgram, textureProgram, combiner] = await Promise.all([
    read(`${appearance.species}.json`, signal).then((r) => r.json() as Promise<ModelData>),
    read("vertex_program.glsl", signal).then((r) => r.text()),
    read("texture_program.glsl", signal).then((r) => r.text()),
    read("combiner.glsl", signal).then((r) => r.text()),
  ]);
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  let shaderError = "";
  renderer.debug.onShaderError = (gl, _program, vertex, fragment) => {
    shaderError = `${gl.getShaderInfoLog(vertex) || ""} ${gl.getShaderInfoLog(fragment) || ""}`;
  };
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setClearColor(0, 0);
  renderer.autoClear = false; renderer.sortObjects = true;
  renderer.domElement.setAttribute("role", "img");
  renderer.domElement.setAttribute("aria-label", "Player in saved armor colors, posed as in the character editor");
  const accumulation = new THREE.WebGLRenderTarget(1, 1);
  const screenSize = new THREE.Vector2(1, 1);
  const geometry = new THREE.BufferGeometry();
  const groupGeometries: THREE.BufferGeometry[] = [];
  const materials: THREE.RawShaderMaterial[] = [];
  const textures = new Set<THREE.Texture>();
  const images = new Map<string, Promise<THREE.Texture>>();
  let observer: ResizeObserver | undefined;
  let disposed = false;
  const viewProjection = new THREE.Matrix4();
  const dispose = () => {
    disposed = true; observer?.disconnect(); groupGeometries.forEach((g) => g.dispose()); geometry.dispose();
    materials.forEach((m) => m.dispose()); textures.forEach((t) => t.dispose()); accumulation.dispose();
    renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
  };
  try {
    const load = (binding: ImageBinding) => {
      const key = binding.images.join(",");
      if (!images.has(key)) images.set(key, (async () => {
        const texture = binding.type === "cube"
          ? await new THREE.CubeTextureLoader().loadAsync(binding.images.map((name) => `/profile/${name}`))
          : await new THREE.TextureLoader().loadAsync(binding.images[0] === emblem ? emblem : `/profile/${binding.images[0]}`);
        if (disposed) { texture.dispose(); throw new DOMException("Aborted", "AbortError"); }
        texture.flipY = false; texture.colorSpace = THREE.NoColorSpace; textures.add(texture);
        return texture;
      })());
      return images.get(key)!;
    };
    await Promise.all(data.materials.flatMap((m) => m.passes.flatMap((p) => p.stages.filter((s): s is ImageBinding => !!s))).map(load));
    const emblemTexture = await load({ type: "2d", images: [emblem] });
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    for (const [name, values, size] of [
      ["position", data.positions, 3], ["normal", data.normals, 3], ["uv", data.uvs, 2],
      ["tangent", data.tangents, 3], ["binormal", data.binormals, 3],
    ] as const) geometry.setAttribute(name, new THREE.Float32BufferAttribute(values, size));
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox!, center = bounds.getCenter(new THREE.Vector3()).add(new THREE.Vector3(...data.origin as [number, number, number]));
    const scene = new THREE.Scene(), baseScene = new THREE.Scene();
    const model = new THREE.Group(), baseModel = new THREE.Group();
    model.position.fromArray(data.origin); baseModel.position.copy(model.position);
    scene.add(model); baseScene.add(baseModel);
    const camera = new THREE.PerspectiveCamera(35, 1, .01, 30);
    camera.up.set(0, 0, 1);
    const viewRight = new THREE.Vector3(1, 0, 0), viewUp = new THREE.Vector3(0, 0, 1), viewBack = new THREE.Vector3(0, -1, 0);
    for (const group of data.groups) {
      if (!group.count) continue;
      const definition = data.materials[group.material];
      if (!definition.passes.length) throw new Error("Character material is missing its original shader.");
      const part = new THREE.BufferGeometry();
      Object.entries(geometry.attributes).forEach(([name, attribute]) => part.setAttribute(name, attribute));
      part.setDrawRange(group.start, group.count); groupGeometries.push(part);
      for (const pass of definition.passes) {
        const program = [...pass.pixel], attributes = [...pass.attributes], constants = [...pass.constants];
        for (const color of pass.pixelColors) {
          const value = appearance.colors[color.slot].map((v) => color.signed ? (v + 1) / 2 : v);
          program[color.word] = ((program[color.word] & 0xff000000) | rgbWord(value)) >>> 0;
        }
        for (const color of pass.vertexColors) {
          const target = color.bank ? constants : attributes;
          target.splice(color.register * 4, 3, ...appearance.colors[color.slot]);
        }
        const uniforms: Record<string, THREE.IUniform> = {
          pixelProgram: { value: new Uint32Array(program) },
          vertexInstructions: { value: new Uint32Array([...pass.instructions, ...Array(128 - pass.instructions.length).fill(0)]) },
          instructionCount: { value: pass.instructions.length / 4 }, vertexAttributes: { value: vectors(attributes) }, vertexConstants: { value: vectors(constants) },
          accumulation: { value: accumulation.texture }, screenSize: { value: screenSize },
          viewProjection: { value: viewProjection }, viewRight: { value: viewRight }, viewUp: { value: viewUp }, viewBack: { value: viewBack },
        };
        if (pass.accumulation < 0) delete uniforms.accumulation;
        let declarations = "", lookup2d = "", lookupCube = "";
        for (let i = 0; i < 4; i++) {
          const binding = pass.stages[i];
          if (!binding && !definition.emblem) continue;
          if (definition.emblem && i !== 0) continue;
          const texture = (definition.emblem ? emblemTexture : await load(binding!)).clone();
          textures.add(texture);
          const flags = pass.samplers[i]?.flags || [32, 34, 0, 0, 1, 1, 1, 0];
          texture.wrapS = wrapping(flags[4]); texture.wrapT = wrapping(flags[5]);
          texture.magFilter = (flags[1] & 15) === 1 ? THREE.NearestFilter : THREE.LinearFilter;
          texture.minFilter = flags[1] >> 4 ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
          texture.anisotropy = Math.min(flags[3] & 15 ? 1 << ((flags[3] & 15) - 1) : 1, renderer.capabilities.getMaxAnisotropy());
          texture.needsUpdate = true;
          const cube = binding?.type === "cube";
          uniforms[`stage${i}`] = { value: texture };
          declarations += `uniform ${cube ? "samplerCube" : "sampler2D"} stage${i};\n`;
          if (cube) lookupCube += `if(i==${i}u)return texture(stage${i},p);\n`;
          else lookup2d += `if(i==${i}u){${flags[4] === 4 || flags[5] === 4 ? "if(any(lessThan(p,vec2(0)))||any(greaterThan(p,vec2(1))))return vec4(0);" : ""}return texture(stage${i},p);}\n`;
        }
        // The source emblem texture is already composed in player colors.
        const fragment = `precision highp float; precision highp int;
          uniform uint pixelProgram[60]; uniform sampler2D accumulation; uniform vec2 screenSize;
          in vec4 stageCoordinates[4]; in vec4 primaryColor, secondaryColor; out vec4 outColor;
          ${declarations}
          #define H2_COMBINER_WORD(i) pixelProgram[i]
          ${combiner}
          vec4 fetchStage2D(uint i,vec2 p){${pass.accumulation >= 0 ? `if(i==${pass.accumulation}u)return texture(accumulation,gl_FragCoord.xy/screenSize);` : ""}${lookup2d}return vec4(0);}
          vec4 fetchStageCube(uint i,vec3 p){${lookupCube}return vec4(0);}
          #define TEXTURE_REJECT() discard
          #define TEXTURE_COLOR_SIGN(i) 0u
          #define TEXTURE_BUMP_MATRIX(i) vec4(0)
          ${textureProgram}
          void main(){vec4 samples[4];runTextureStages(samples);
            outColor=${definition.emblem ? "samples[0]" : "runCombiners(samples,primaryColor,secondaryColor)"};
            ${pass.states[60] ? `if(!(${pass.states[58] === 513 ? `outColor.a<${((pass.states[61] ?? 0) / 255).toFixed(8)}` : `outColor.a>${((pass.states[61] ?? 0) / 255).toFixed(8)}`}))discard;` : ""}
            ${pass.states[59] ? "" : "outColor.a=1.;"}
          }`;
        const base = pass.name.endsWith("default_texture_four_change_color_zwrite");
        const material = new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, uniforms, vertexShader: `${vertexHeader}\n${vertexProgram}\nvoid main(){runVertexProgram();
          primaryColor=clamp(vpOut[3],0.,1.);secondaryColor=clamp(vpOut[4],0.,1.);
          for(int i=0;i<4;i++)stageCoordinates[i]=vpOut[9+i];
          gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`, fragmentShader: fragment,
          side: THREE.DoubleSide, depthWrite: pass.states[64] !== 0,
          depthFunc: pass.states[57] === 514 ? THREE.EqualDepth : THREE.LessEqualDepth,
          transparent: !!pass.states[59], toneMapped: false,
        });
        if (material.transparent) {
          material.blending = THREE.CustomBlending; material.blendEquation = THREE.AddEquation;
          material.blendSrc = blendFactor(pass.states[62] ?? 1); material.blendDst = blendFactor(pass.states[63] ?? 0);
          // Keep the page's transparent background while adding original RGB illumination.
          material.blendSrcAlpha = THREE.ZeroFactor; material.blendDstAlpha = THREE.OneFactor;
        }
        materials.push(material);
        const mesh = new THREE.Mesh(part, material); mesh.frustumCulled = false;
        mesh.renderOrder = base ? 0 : pass.accumulation >= 0 ? 1 : definition.emblem ? 3 : 2;
        model.add(mesh);
        if (base) {
          const baseMaterial = material.clone(); baseMaterial.uniforms = material.uniforms; materials.push(baseMaterial);
          baseModel.add(new THREE.Mesh(part, baseMaterial)); material.colorWrite = false;
        }
      }
    }
    host.replaceChildren(renderer.domElement);
    const render = () => {
      if (signal.aborted) return;
      renderer.setRenderTarget(accumulation); renderer.clear(); renderer.render(baseScene, camera);
      renderer.setRenderTarget(null); renderer.clear(); renderer.render(scene, camera);
    };
    const resize = () => {
      const { width, height } = host.getBoundingClientRect();
      if (width < 1 || height < 1 || signal.aborted) return;
      renderer.setSize(width, height); renderer.getDrawingBufferSize(screenSize); accumulation.setSize(screenSize.x, screenSize.y);
      camera.aspect = width / height;
      // Keep the editor's forward bearing and center the complete posed figure.
      const size = bounds.getSize(new THREE.Vector3());
      const distance = Math.max(size.z, size.x / camera.aspect) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.15 + size.y / 2;
      camera.position.set(center.x, center.y - distance, center.z); camera.lookAt(center);
      camera.updateProjectionMatrix(); camera.updateMatrixWorld(); viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); render();
    };
    resize();
    if (shaderError) throw new Error("Your browser could not display the player model.");
    observer = new ResizeObserver(resize);
    observer.observe(host);
    return { dispose, rotate: (delta: number) => { model.rotation.z += delta; baseModel.rotation.z = model.rotation.z; render(); }, reset: () => { model.rotation.z = baseModel.rotation.z = 0; render(); } };
  } catch (error) { dispose(); throw error; }
}
