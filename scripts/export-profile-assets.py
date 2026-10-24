"""Export bounded website profile assets from the owned retail menu cache.

Run through tools/run_test.py from Halo-2-Decompiled. The persistent output is
the requested website asset set; intermediate work remains in owned scratch.
"""
import argparse
import hashlib
import io
import json
from pathlib import Path
import struct
import sys

import numpy as np
from PIL import Image

p = argparse.ArgumentParser()
p.add_argument('--game-root', type=Path, required=True)
p.add_argument('--output', type=Path, required=True)
a = p.parse_args()
sys.path.insert(0, str(a.game_root / 'tools'))
from audit_rendering import Cache

cache_path = a.game_root / 'assets/disc/maps/mainmenu.map'
c = Cache(cache_path)
pose_path = a.game_root / 'analysis/frontend/profile-regression/original-model-menu-held-weapon-ik.json'
poses = json.loads(pose_path.read_text())['objects']
a.output.mkdir(parents=True, exist_ok=True)
provenance = {'source_cache': str(cache_path.relative_to(a.game_root)), 'source_cache_sha256': hashlib.sha256(c.data).hexdigest(),
              'pose_source': str(pose_path.relative_to(a.game_root)), 'pose_sha256': hashlib.sha256(pose_path.read_bytes()).hexdigest(),
              'geometry_decoder': 'src/rendering/models/model.cpp', 'pose_decoder': 'src/rendering/models/model_pose.cpp',
              'rendering': 'retail geometry and captured menu pose; website lighting is an adaptation', 'assets': {}}

def save_json(name, value):
    (a.output / name).write_text(json.dumps(value, separators=(',', ':')))

def resource(pointer, length):
    name = ['', 'mainmenu.map', 'shared.map', 'single_player_shared.map'][pointer >> 30]
    path = cache_path.parent / name if name else cache_path
    with path.open('rb') as f:
        f.seek(pointer & 0x3fffffff)
        result = f.read(length)
    assert len(result) == length
    return result

def texture(datum, page=0):
    key = c.bitmap(datum)
    record = c.bitmaps[key]['records'][page]
    w, h, fmt = record['width'], record['height'], record['format']
    raw = resource(record['resource_pointers'][0], record['resource_sizes'][0])
    if fmt in (14, 15, 16):
        assert not record['flags'] & 8, 'Compressed swizzle is not supported by the source decoder'
        fourcc = {14: b'DXT1', 15: b'DXT3', 16: b'DXT5'}[fmt]
        header = [124, 0x81007, h, w, len(raw), 0, 1] + [0]*11
        header += [32, 4, int.from_bytes(fourcc, 'little'), 0, 0, 0, 0, 0, 0x1000, 0, 0, 0, 0]
        return Image.open(io.BytesIO(b'DDS ' + struct.pack('<31I', *header) + raw)).convert('RGBA')
    bpp = {0: 1, 1: 1, 2: 1, 3: 2, 6: 2, 8: 2, 9: 2, 10: 4, 11: 4}[fmt]
    if record['flags'] & 8:
        linear = bytearray(w*h*bpp)
        for y in range(h):
            for x in range(w):
                offset, bit = 0, 0
                for n in range(max(w, h).bit_length()-1):
                    if 1 << n < w:
                        offset |= ((x >> n) & 1) << bit; bit += 1
                    if 1 << n < h:
                        offset |= ((y >> n) & 1) << bit; bit += 1
                linear[(y*w+x)*bpp:(y*w+x+1)*bpp] = raw[offset*bpp:(offset+1)*bpp]
        raw = bytes(linear)
    if fmt in (10, 11): return Image.frombytes('RGBA', (w, h), raw[:w*h*4], 'raw', 'BGRX' if fmt == 10 else 'BGRA')
    if fmt in (0, 1, 2):
        return Image.frombytes('L', (w, h), raw[:w*h]).convert('RGBA')
    if fmt == 3: return Image.frombytes('LA', (w, h), raw[:w*h*2]).convert('RGBA')
    if fmt == 9:
        rgba = bytes(channel for (v,) in struct.iter_unpack('<H', raw[:w*h*2])
                     for channel in [((v>>8)&15)*17, ((v>>4)&15)*17, (v&15)*17, ((v>>12)&15)*17])
        return Image.frombytes('RGBA', (w,h), rgba)
    if fmt in (6, 8):
        def channels(v):
            if fmt == 6: return [((v>>11)&31)*255//31,((v>>5)&63)*255//63,(v&31)*255//31,255]
            return [((v>>10)&31)*255//31,((v>>5)&31)*255//31,(v&31)*255//31,255 if v&0x8000 else 0]
        rgba=bytes(channel for (v,) in struct.iter_unpack('<H',raw[:w*h*2]) for channel in channels(v))
        return Image.frombytes('RGBA',(w,h),rgba)
    raise ValueError('Unsupported source bitmap format '+str(fmt))

exported = {}
def export_texture(datum, page=0):
    if datum == 0xffffffff: return None
    name = f'{datum:08x}-{page}.png'
    if name not in exported:
        texture(datum, page).save(a.output / name, optimize=True)
        exported[name] = c.tags[datum]['name']
    return name

def matrix(words):
    m = np.eye(4)
    m[:3, :3] = np.array(words[1:10]).reshape(3, 3).T * words[0]
    m[:3, 3] = words[10:13]
    return m

def normal(word):
    values = [word & 2047, (word >> 11) & 2047, (word >> 22) & 1023]
    return np.array([(v if v < (1 << (bits-1)) else v-(1 << bits)) / ((1 << (bits-1))-1) for v,bits in zip(values,[11,11,10])])

for species, definition in [('spartan', 0xe23400bf), ('elite', 0xe3110154)]:
    capture = next(o for o in poses if int(o['definition'], 16) == definition)
    _, obj = c.tag(definition, 'bipd')
    _, hlmt = c.tag(c.u32(obj+0x38), 'hlmt')
    mode_id = c.u32(hlmt+4)
    _, mode = c.tag(mode_id, 'mode')
    bounds = c.block(mode+0x14, 0x38)[0]
    limits = struct.unpack_from('<10f', c.data, bounds)
    def expand(value, axis): return max(-1, value/32767)*(limits[axis*2+1]-limits[axis*2])*.5+(limits[axis*2+1]+limits[axis*2])*.5
    nodes = c.block(mode+0x48, 0x60)
    inverse = [matrix([struct.unpack_from('<f', c.data, n+40)[0], *struct.unpack_from('<12f', c.data, n+44)]) for n in nodes]
    world = [matrix(words) for words in struct.iter_unpack('<13f', bytes.fromhex(capture['world_node_bank_hex']))]
    root_words = struct.unpack('<16f', bytes.fromhex(capture['object_root_hex']))
    forward, up = np.array(root_words[3:6]), np.array(root_words[6:9])
    side = np.cross(up, forward)
    root_inverse = np.linalg.inv(matrix([root_words[15], *forward, *side, *up, *root_words[:3]]))
    skin = [root_inverse @ world[i] @ inv for i,inv in enumerate(inverse)]
    materials = []
    for m in c.block(mode+0x60, 32):
        datum = c.u32(m+12)
        shader = c.shaders[c.shader(datum)]
        bitmaps = shader['postprocess'][0]['bitmaps']
        runtime = bytes.fromhex(shader['runtime_properties'][0])
        diffuse = struct.unpack_from('<I', runtime, 4)[0]
        change = next((b['datum'] for b in bitmaps if any(s in c.tags.get(b['datum'],{}).get('name','') for s in ['_cc','change_color','color_change'])), 0xffffffff)
        materials.append({'name': shader['name'], 'map': export_texture(diffuse), 'change': export_texture(change), 'emblem': shader['name'].endswith(('mc_emblem','elite_emblem'))})
    overrides = {}
    variant_name = c.u32(obj+0x30)
    for index, variant in enumerate(c.block(hlmt+0x50,0x38)):
        if (variant_name and c.u32(variant)!=variant_name) or (not variant_name and index!=0): continue
        for region in c.block(variant+0x14,0x14):
            choices=c.block(region+8,0x20)
            choice=next((q for q in choices if len(choices)==1 or struct.unpack_from('<f',c.data,q+8)[0]>0),None)
            if choice is not None: overrides[c.u32(region)]=c.data[choice+4]
        break
    selected = set()
    for region in c.block(mode+0x1c, 16):
        permutations = c.block(region+8, 16)
        if not permutations: continue
        permutation=overrides.get(c.u32(region),0)
        if permutation==255:continue
        assert permutation<len(permutations)
        for offset in range(14, 3, -2):
            section = struct.unpack_from('<h', c.data, permutations[permutation]+offset)[0]
            if section >= 0:
                selected.add(section); break
    sections = c.block(mode+0x24, 0x5c)
    positions, normals, uvs, groups = [], [], [], []
    for section in sorted(selected):
        s = sections[section]
        classification, count, faces = c.u16(s), c.u16(s+4), c.u16(s+6)
        if not count: continue
        opaque, transparent = c.data[s+0x14:s+0x16]
        influences = max(opaque, transparent)
        raw = resource(c.u32(s+0x38), c.u32(s+0x3c))
        base = len(raw)-c.u32(s+0x44)-4
        resources = c.block(s+0x48, 16)
        streams = {}
        for i,r in enumerate(resources):
            kind, channel = c.u16(r+4), c.u16(r+6)
            streams[(kind,channel)] = (base+c.u32(r+12),c.u32(r+8))
            if i == 0: parts = streams[(kind,channel)]
        pos, size = streams[(56,0)]; stride = size//count
        uv = streams[(56,1)][0]; basis = streams[(56,2)][0]
        indices = next(v[0] for k,v in streams.items() if k[0] == 32)
        index_count = struct.unpack_from('<H',raw,0x28)[0]
        map_count = struct.unpack_from('<H',raw,0x6c)[0]
        nodemap = raw[next(v[0] for k,v in streams.items() if k[0] == 100):][:map_count] if map_count else None
        verts = np.array([[expand(v, axis) for axis,v in enumerate(struct.unpack_from('<3h',raw,pos+i*stride))] for i in range(count)])
        ns = [normal(struct.unpack_from('<I',raw,basis+i*12)[0]) for i in range(count)]
        texcoords = [[expand(v,axis+3) for axis,v in enumerate(struct.unpack_from('<2h',raw,uv+i*4))] for i in range(count)]
        idx = struct.unpack_from('<'+'H'*index_count, raw, indices)
        is_list = faces*3==index_count and all(len(set(idx[i:i+3]))==3 for i in range(0,min(index_count,30),3))
        for part in range(parts[1]//72):
            p0 = parts[0]+part*72
            typ, _, material, first, length = struct.unpack_from('<5H',raw,p0)
            active = transparent if typ in (4,5) else opaque
            first_vertex = len(positions)//3
            for j in range(0,length-2,3 if is_list else 1):
                tri = list(idx[first+j:first+j+3])
                if len(set(tri))<3: continue
                if not is_list and j%2: tri[0],tri[1]=tri[1],tri[0]
                for v in tri:
                    assert v<count
                    value, n = np.append(verts[v],1), ns[v]
                    if classification == 3:
                        start=6+(2 if influences in (2,4) else 0)
                        local=list(raw[pos+v*stride+start:][:active])
                        bones=[nodemap[b] if nodemap is not None else b for b in local]
                        weights=[raw[pos+v*stride+start+influences+i]/255 for i in range(active)]
                        weights[0]=1-sum(weights[1:])
                    elif classification in (1,2):
                        b=raw[pos+v*stride+6] if classification==2 else 0
                        bones=[nodemap[b] if nodemap is not None else b];weights=[1]
                    else: bones=[];weights=[]
                    if bones:
                        transform=sum((skin[b]*w for b,w in zip(bones,weights)))
                        value=transform@value;n=transform[:3,:3]@n
                    positions.extend(round(float(x),6) for x in [value[1],value[2],value[0]])
                    normals.extend(round(float(x),6) for x in [n[1],n[2],n[0]])
                    uvs.extend(round(float(x),6) for x in texcoords[v])
            groups.append({'start':first_vertex,'count':len(positions)//3-first_vertex,'material':material})
    save_json(species+'.json',{'positions':positions,'normals':normals,'uvs':uvs,'groups':groups,'materials':materials})
    provenance[species]={'model_tag':f'{mode_id:08x}','vertices':len(positions)//3,'triangles':len(positions)//9}

for family,datum,pages in [('foreground',0xe24e00d9,64),('background',0xe4a00280,32)]:
    folder=a.output/family;folder.mkdir(exist_ok=True)
    for page in range(pages): texture(datum,page).save(folder/f'{page}.png', optimize=True)
_,matg=c.tag(next(t['datum'] for t in c.tags.values() if t['group']=='matg'),'matg')
palette=[list(struct.unpack_from('<3f',c.data,at)) for at in c.block(matg+0x160,12)]
save_json('palette.json',palette)
live=json.loads((a.game_root/'analysis/frontend/customization/original-emblem-draw.json').read_text())
save_json('emblem-program.json',list(struct.unpack('<60I',bytes.fromhex(live['pixel_program_hex']))))
(a.output/'combiner.glsl').write_text((a.game_root/'shaders/combiner.glsl').read_text())
provenance['assets']={str(f.relative_to(a.output)):{'sha256':hashlib.sha256(f.read_bytes()).hexdigest(),'bytes':f.stat().st_size} for f in a.output.rglob('*') if f.is_file()}
save_json('provenance.json',provenance)
print(json.dumps({'spartan':provenance['spartan'],'elite':provenance['elite'],'files':len(provenance['assets']),'bytes':sum(f['bytes'] for f in provenance['assets'].values())}))
