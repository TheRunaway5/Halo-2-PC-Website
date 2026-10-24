"""Retail ARGB4444 foreground mip chains, without browser-generated filtering."""
import hashlib
import json
import struct


def export_body_emblems(cache, resource, output, game_root):
    bitmap=0xe24e00d9
    records=cache.bitmaps[cache.bitmap(bitmap)]['records']
    folder=output/'body-emblems';folder.mkdir(exist_ok=True)
    pages=[]
    for page,record in enumerate(records):
        assert (record['width'],record['height'],record['format'],record['declared_additional_mips'])==(128,128,9,7)
        raw=resource(record['resource_pointers'][0],record['resource_sizes'][0])
        packed=bytearray();rgba=bytearray();offset=0
        for level in range(8):
            width=height=128>>level
            for y in range(height):
                for x in range(width):
                    address=y*width+x
                    if record['flags']&8:
                        address=0
                        for bit in range(width.bit_length()-1):address|=((x>>bit)&1)<<(bit*2);address|=((y>>bit)&1)<<(bit*2+1)
                    word=struct.unpack_from('<H',raw,offset+address*2)[0]
                    packed+=struct.pack('<H',word)
                    rgba+=bytes([((word>>8)&15)*17,((word>>4)&15)*17,(word&15)*17,((word>>12)&15)*17])
            offset+=width*height*2
        (folder/f'{page}.bin').write_bytes(packed)
        pages.append({'rgba_sha256':hashlib.sha256(rgba).hexdigest()})
    reference=game_root/'tests/fixtures/player_armor_emblem_framebuffer/spartan/texture.rgba'
    assert hashlib.sha256(reference.read_bytes()).hexdigest()==pages[26]['rgba_sha256'], 'Authored mips differ from the original uploaded GPU texture'
    metadata={'format':'halo2-body-emblem-argb4444-v1','source_bitmap':f'{bitmap:08x}', 'width':128,'height':128,'mip_count':8,'pages':pages,
              'original_gpu_texture_page':26,'original_gpu_texture_sha256':pages[26]['rgba_sha256']}
    (output/'body-emblem.json').write_text(json.dumps(metadata,separators=(',',':')))
