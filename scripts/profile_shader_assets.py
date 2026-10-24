"""Retained retail preview draw programs and their literal cache bindings."""
import json
import struct


def remaps(raw):
    return list(struct.iter_unpack('<HBB', raw))


def export_passes(cache, root, datum, species, export_image):
    rows = json.loads((root / f'analysis/frontend/customization/original-preview-shader-banks-{species}.json').read_text())['rows']
    shader = cache.shaders[cache.shader(datum)]
    post = shader['postprocess'][0]
    template = cache.templates[post['template']]['postprocess'][0]
    _, globals_at = cache.tag(next(t['datum'] for t in cache.tags.values() if t['group']=='matg'),'matg')
    rasterizer = cache.block(globals_at+0x108, 0xd4)[0]
    normalization = cache.u32(rasterizer+0xc)
    direct = [row for row in rows if int(row['shader'],16)==datum]
    # Torso/legs use the same authored template as captured helmet/arms. Bind
    # their own textures and remap only differing material constants below.
    if not direct:
        for row in rows:
            reference=cache.shaders[cache.shader(int(row['shader'],16))]['postprocess'][0]
            if reference['template']==post['template']:
                direct.append(row)
    seen=set()
    output = []
    for row in direct:
        if row['implementation_hex']in seen:continue
        seen.add(row['implementation_hex'])
        match = next(((p, d, i, imp) for p in template['passes']
                      for d in cache.passes[p['pass']]['postprocess']
                      for i,imp in enumerate(d['implementations'])
                      if imp['original_bytes'] == row['implementation_hex']), None)
        if match is None: raise ValueError('Captured shader implementation has no matching cache definition')
        p, definition, index, implementation = match
        original = bytes.fromhex(implementation['original_bytes'])
        mappings = remaps(b''.join(bytes.fromhex(v) for v in p['implementations'][index]['bitmaps']))
        stages = [None]*4
        accumulation = -1
        for binding in implementation['textures']:
            parameter, external, stage, _ = bytes.fromhex(binding)
            if external == 3:
                accumulation = stage
                continue
            if external == 1:
                stages[stage] = export_image(normalization)
                continue
            if external: raise ValueError('Unsupported preview texture extern '+str(external))
            if parameter == 255: continue
            mapping = next(v for v in mappings if v[0]&255 == parameter)
            bitmap = post['bitmaps'][mapping[2]]
            stages[stage] = export_image(bitmap['datum'], bitmap['bitmap_index'])
        _, vs = cache.tag(int(implementation['vertex_shader'],16),'vrtx')
        classification = cache.block(vs+4,28)[0]
        size, pointer = cache.u32(classification+12), cache.u32(classification+16)
        raw = cache.data[pointer-cache.magic:pointer-cache.magic+size]
        signature, count = struct.unpack_from('<HH',raw)
        assert signature == 0x2078 and len(raw) == 4+count*16
        instructions = list(struct.unpack_from('<'+'I'*(count*4),raw,4))
        externs = b''.join(bytes.fromhex(v) for v in definition['blocks']['externs'])
        def pick_range(field):
            packed=struct.unpack_from('<H',original,field)[0]
            return remaps(externs[(packed&511)*4:((packed&511)+(packed>>9))*4])
        color_slots={3:0,4:1,21:2,22:3}
        # Captured programs are already assembled. Retain source fragment
        # offsets so the player's RGB externs land in the original registers.
        fragments=[]; offset=0; switches={4:shader['lighting_selectors']['specular'],5:shader['lighting_selectors']['lightmap']}
        permutations=definition['blocks']['permutations']
        for fragment in implementation['fragments']:
            selector, packed=struct.unpack('<hH',bytes.fromhex(fragment))
            selected=switches.get(selector,0) if selector!=-1 else 0
            _, flags, bank=struct.unpack('<hHH',bytes.fromhex(permutations[(packed&511)+selected]))
            fragments.append(offset);offset+=(bank>>9)-(1 if flags&1 else 0)
        def pixel_word(destination):
            fragment=destination&7
            if fragments:
                selector, _=struct.unpack('<hH',bytes.fromhex(implementation['fragments'][fragment]))
                if selector!=-1 and ((destination>>3)&7)!=switches.get(selector,0):return None
            slot=(destination>>6)&15
            if fragments and slot!=8:slot+=fragments[fragment]
            return 43+((destination>>10)&1) if slot==8 else 10+8*((destination>>10)&1)+slot
        pixel=list(struct.unpack('<60I',bytes.fromhex(row['pixel_program_hex'])))
        attributes=list(struct.unpack('<64f',bytes.fromhex(row['vertex_attributes_hex'])))
        constants=list(struct.unpack('<64f',bytes.fromhex(row['vertex_constants_hex'])))
        reference=cache.shaders[cache.shader(int(row['shader'],16))]['postprocess'][0]
        binding=p['implementations'][index]
        masks=[0xff0000,0xff00,0xff,0xff000000,0xffffff,0xff0000,0xff00,0xff]
        for dest,component,source in remaps(b''.join(bytes.fromhex(v)for v in binding['pixel_constants'])):
            if reference['constants']['pixel'][source]==post['constants']['pixel'][source]:continue
            word=pixel_word(dest)
            if word is not None:
                value=struct.unpack('<I',bytes.fromhex(post['constants']['pixel'][source]))[0]
                mask=masks[component&7];pixel[word]=(pixel[word]&~mask)|(value&mask)
        masks=[1,2,4,8,7,1,2,4,8,3,12,3,12,15,11,11,7,7,15,15,15]
        for dest,_,source in remaps(b''.join(bytes.fromhex(v)for v in binding['vertex_constants'])):
            if reference['constants']['vertex'][source]==post['constants']['vertex'][source]:continue
            value=struct.unpack('<4f',bytes.fromhex(post['constants']['vertex'][source]))
            target=attributes if not ((dest>>4)&1) else constants
            for axis in range(4):
                if masks[(dest>>5)&31]&(1<<axis):target[(dest&15)*4+axis]=value[axis]
        pixel_colors=[]
        for destination,component,source in pick_range(0x122):
            if source not in color_slots or component&7 != 4:continue
            word=pixel_word(destination)
            if word is None:continue
            assert word < 60
            pixel_colors.append({'word':word,'slot':color_slots[source],'signed':bool(destination&0x800)})
        vertex_colors=[{'bank':(dest>>4)&1,'register':dest&15,'slot':color_slots[src]}
                       for dest,_,src in pick_range(0x124) if src in color_slots and ((dest>>5)&31)==4]
        states={}
        for state in implementation['render_states']:
            data=bytes.fromhex(state);states[data[0]]=struct.unpack_from('<I',data,1)[0]
        samplers=[]
        for state in implementation['texture_states']:
            data=bytes.fromhex(state)
            samplers.append({'flags':list(data[:8]),'bump':list(struct.unpack_from('<4f',data,8))})
        emblem_inputs=[]
        if shader['name'].endswith(('mc_emblem','elite_emblem')):
            _,root_at=cache.tag(datum,'shad');animation=cache.block(root_at+32,124)[0]
            refs=cache.block(animation+68,4);params=cache.block(animation+76,2)
            overlays=cache.block(animation+60,20);mapping=cache.block(animation+84,4)
            implementations=cache.block(animation+52,10)
            ranges=cache.block(animation+44,2)
            template_index=template['passes'].index(p)
            selected=cache.packed_range(cache.u16(ranges[template_index]),implementations)[index]
            for at in cache.packed_range(cache.u16(selected+6),mapping):
                destination,component,source=struct.unpack_from('<HBB',cache.data,at)
                refs_at=cache.packed_range(cache.u16(params[source]),refs)[0]
                overlay=overlays[cache.u16(refs_at)]
                input_name=cache.u32(overlay)
                assert input_name in (0x180005fc,0x0d0005ff) and component==3
                word=pixel_word(destination)
                assert word is not None
                emblem_inputs.append({'word':word,'input':'foreground_enabled' if input_name==0x180005fc else 'enabled','mask':0xff000000})
        output.append({'name':cache.passes[p['pass']]['name'],
                       'pixel':pixel,'attributes':attributes,'constants':constants,
                       'instructions':instructions,'stages':stages,'accumulation':accumulation,
                       'pixelColors':pixel_colors,'vertexColors':vertex_colors,
                       'states':states,'samplers':samplers,**({'emblemInputs':emblem_inputs}if emblem_inputs else {})})
    return output
