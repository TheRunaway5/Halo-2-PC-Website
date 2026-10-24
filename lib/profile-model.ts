import * as THREE from "three";
import { bodyEmblemPath, bodyEmblemSampler, decodeBodyEmblem, playerPixelProgram, type BodyEmblemBank, type PlayerPixelBindings } from "./profile-body-emblem";
import { profileModelFrame } from "./profile-model-view";
import type { ProfileAppearance } from "./profile-appearance";

type ImageBinding = { type: "2d" | "cube"; images: string[] };
type RetailPass = PlayerPixelBindings & {
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

export async function mountRetailModel(host: HTMLElement, appearance: ProfileAppearance, signal: AbortSignal) {
  const [data, vertexProgram, textureProgram, combiner, emblemBank, emblemBuffer] = await Promise.all([
    read(`${appearance.species}.json`, signal).then((r) => r.json() as Promise<ModelData>),
    read("vertex_program.glsl", signal).then((r) => r.text()),
    read("texture_program.glsl", signal).then((r) => r.text()),
    read("combiner.glsl", signal).then((r) => r.text()),
    read("body-emblem.json", signal).then((r) => r.json() as Promise<BodyEmblemBank>),
    read(bodyEmblemPath(appearance), signal).then((r) => r.arrayBuffer()),
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
  const interactions = new AbortController();
  const dispose = () => {
    disposed = true; interactions.abort(); observer?.disconnect(); groupGeometries.forEach((g) => g.dispose()); geometry.dispose();
    materials.forEach((m) => m.dispose()); textures.forEach((t) => t.dispose()); accumulation.dispose();
    renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
  };
  try {
    const load = (binding: ImageBinding) => {
      const key = binding.images.join(",");
      if (!images.has(key)) images.set(key, (async () => {
        const texture = binding.type === "cube"
          ? await new THREE.CubeTextureLoader().loadAsync(binding.images.map((name) => `/profile/${name}`))
          : await new THREE.TextureLoader().loadAsync(`/profile/${binding.images[0]}`);
        if (disposed) { texture.dispose(); throw new DOMException("Aborted", "AbortError"); }
        texture.flipY = false; texture.colorSpace = THREE.NoColorSpace; textures.add(texture);
        return texture;
      })());
      return images.get(key)!;
    };
    await Promise.all(data.materials.filter((m) => !m.emblem).flatMap((m) => m.passes.flatMap((p) => p.stages.filter((s): s is ImageBinding => !!s))).map(load));
    const emblemMips = decodeBodyEmblem(emblemBuffer, emblemBank);
    const emblemTexture = new THREE.DataTexture(emblemMips[0].data, emblemBank.width, emblemBank.height);
    emblemTexture.mipmaps = emblemMips; emblemTexture.generateMipmaps = false;
    emblemTexture.flipY = false; emblemTexture.colorSpace = THREE.NoColorSpace;
    emblemTexture.premultiplyAlpha = false; emblemTexture.needsUpdate = true; textures.add(emblemTexture);
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    for (const [name, values, size] of [
      ["position", data.positions, 3], ["normal", data.normals, 3], ["uv", data.uvs, 2],
      ["tangent", data.tangents, 3], ["binormal", data.binormals, 3],
    ] as const) geometry.setAttribute(name, new THREE.Float32BufferAttribute(values, size));
    const frame = profileModelFrame(geometry.getAttribute("position").array, data.origin);
    const scene = new THREE.Scene(), baseScene = new THREE.Scene();
    const { pivot, model } = frame.createPivot();
    const { pivot: basePivot, model: baseModel } = frame.createPivot();
    scene.add(pivot); baseScene.add(basePivot);
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
        const program = playerPixelProgram(pass, appearance, definition.emblem), attributes = [...pass.attributes], constants = [...pass.constants];
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
          else lookup2d += definition.emblem ? `if(i==${i}u)return sampleBodyEmblem(stage${i},p);\n` : `if(i==${i}u){${flags[4] === 4 || flags[5] === 4 ? "if(any(lessThan(p,vec2(0)))||any(greaterThan(p,vec2(1))))return vec4(0);" : ""}return texture(stage${i},p);}\n`;
        }
        // Armor emblems retain their own foreground-only combiner pass.
        const fragment = `precision highp float; precision highp int;
          uniform uint pixelProgram[60]; uniform sampler2D accumulation; uniform vec2 screenSize;
          in vec4 stageCoordinates[4]; in vec4 primaryColor, secondaryColor; out vec4 outColor;
          ${declarations}
          #define H2_COMBINER_WORD(i) pixelProgram[i]
          ${combiner}
          ${definition.emblem ? bodyEmblemSampler : ""}
          vec4 fetchStage2D(uint i,vec2 p){${pass.accumulation >= 0 ? `if(i==${pass.accumulation}u)return texture(accumulation,gl_FragCoord.xy/screenSize);` : ""}${lookup2d}return vec4(0);}
          vec4 fetchStageCube(uint i,vec3 p){${lookupCube}return vec4(0);}
          #define TEXTURE_REJECT() discard
          #define TEXTURE_COLOR_SIGN(i) 0u
          #define TEXTURE_BUMP_MATRIX(i) vec4(0)
          ${textureProgram}
          void main(){vec4 samples[4];runTextureStages(samples);
            outColor=runCombiners(samples,primaryColor,secondaryColor);
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
      const distance = frame.distance(camera.aspect, camera.fov);
      camera.position.copy(frame.center); camera.position.y -= distance; camera.lookAt(frame.center);
      camera.far = Math.max(30, distance * 2);
      camera.updateProjectionMatrix(); camera.updateMatrixWorld(); viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); render();
    };
    resize();
    if (shaderError) throw new Error("Your browser could not display the player model.");
    observer = new ResizeObserver(resize);
    observer.observe(host);
    const canvas = renderer.domElement;
    canvas.tabIndex = 0;
    canvas.setAttribute("aria-label", "Player model. Drag left or right to rotate, or use the arrow keys. Press Home to reset the view.");
    const options = { signal: interactions.signal };
    const rotate = (delta: number) => { pivot.rotation.z += delta; basePivot.rotation.z = pivot.rotation.z; render(); };
    const reset = () => { pivot.rotation.z = basePivot.rotation.z = 0; render(); };
    let pointer: number | null = null, previousX = 0;
    canvas.addEventListener("pointerdown", (event) => {
      if (!event.isPrimary || event.button !== 0 || pointer !== null) return;
      pointer = event.pointerId; previousX = event.clientX;
      canvas.setPointerCapture(pointer); canvas.classList.add("is-dragging");
      canvas.focus({ preventScroll: true });
    }, options);
    canvas.addEventListener("pointermove", (event) => {
      if (event.pointerId !== pointer) return;
      const delta = event.clientX - previousX; previousX = event.clientX;
      rotate(delta / Math.max(canvas.clientWidth, 1) * Math.PI * 2);
    }, options);
    const stopDrag = (event: PointerEvent) => {
      if (event.pointerId !== pointer) return;
      pointer = null; canvas.classList.remove("is-dragging");
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    };
    for (const name of ["pointerup", "pointercancel", "lostpointercapture"] as const) canvas.addEventListener(name, stopDrag, options);
    canvas.addEventListener("dblclick", reset, options);
    canvas.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault(); rotate(event.key === "ArrowLeft" ? -.2 : .2);
      } else if (event.key === "Home") { event.preventDefault(); reset(); }
    }, options);
    return { dispose };
  } catch (error) { dispose(); throw error; }
}
