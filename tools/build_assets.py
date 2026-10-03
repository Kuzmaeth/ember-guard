"""EMBER GUARD asset builder: regenerates every 3D model from the palette and proportions below.

Run headless:   blender -b -P tools/build_assets.py -- [--only name1,name2] [--previews] [--no-export]
Run over MCP:   exec(open(r'<root>/tools/build_assets.py').read(), {'__name__': 'eg'}); build(['enemy_creeper'], previews=True)
Then optimize:  node tools/optimize.mjs   (assets/models/*.glb -> public/models/*.glb)

GLB layout consumed by src/models.js:
  POSITION, NORMAL (flat), COLOR_0 (palette colour per face),
  _EM (emissive 0..1), _JOINT (shader joint id, see gfx.js VERT), _PIVOT (joint pivot, game Y-up space).
Conventions: 1 unit = 1 m, origin at the feet, front faces -Y in Blender (= +Z in the game).
"""
import bpy, bmesh, math, os, random, sys
from mathutils import Vector, Matrix, Euler, noise

def _find_root():
    """Project root: next to this file (headless / Text Editor 'Run Script'), EG_ROOT, or the default checkout."""
    cands = []
    try:
        cands.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    except NameError:
        pass
    for t in getattr(bpy.data, 'texts', []):
        if t.filepath.endswith('build_assets.py'):
            cands.append(os.path.dirname(os.path.dirname(bpy.path.abspath(t.filepath))))
    cands += [os.environ.get('EG_ROOT', ''), r'C:\Users\Kuzma Corp\Desktop\guard']
    for c in cands:
        if c and os.path.isfile(os.path.join(c, 'tools', 'build_assets.py')):
            return c
    raise RuntimeError('set EG_ROOT to the ember-guard project folder')


ROOT = _find_root()
RAW_DIR = os.path.join(ROOT, 'assets', 'models')
PREV_DIR = os.path.join(ROOT, 'assets', 'previews')
BLEND = os.path.join(ROOT, 'assets', 'blender', 'ember_guard_assets.blend')

# ---------------------------------------------------------------- palette (shader space, linear multipliers)
PAL = {
    'NIGHT': (0.16, 0.11, 0.30), 'PLUM': (0.09, 0.06, 0.17), 'PINE': (0.10, 0.30, 0.27), 'MOSS': (0.24, 0.48, 0.28),
    'BARK': (0.36, 0.22, 0.12), 'STONE': (0.38, 0.40, 0.46), 'EMBER': (1.00, 0.52, 0.16), 'BONE': (0.86, 0.80, 0.66),
    # accents
    'EYE_RED': (1.0, 0.18, 0.10), 'EYE_GOLD': (1.0, 0.75, 0.15), 'SPIRIT': (0.30, 0.85, 1.0), 'SKIN': (0.98, 0.76, 0.60),
    'HERO_BLUE': (0.20, 0.32, 0.75), 'CLOAK_RED': (0.75, 0.15, 0.15), 'GOLD': (1.0, 0.80, 0.30), 'ASH': (0.08, 0.05, 0.04),
    'WHITE': (1.0, 1.0, 1.0),
    # enemy-variant accents (derived from NIGHT/PLUM toward a hue so each type reads apart)
    'LAVA': (0.95, 0.3, 0.06), 'DUSK': (0.08, 0.19, 0.27), 'BRUISE': (0.25, 0.09, 0.29), 'CHAR': (0.22, 0.08, 0.07),
    # neutral bases for meshes that the game tints per instance (gems, mushroom caps, grass)
    'TINT_BASE': (0.92, 0.92, 0.92), 'TINT_STEM': (0.55, 0.55, 0.5), 'GRASS_BASE': (0.9, 1.0, 0.9),
}

def col(name, k=1.0):
    c = PAL[name] if isinstance(name, str) else name
    return (c[0] * k, c[1] * k, c[2] * k)

# ---------------------------------------------------------------- proportions (edit and re-run)
P = {
    'enemy_creeper': dict(scale=1.0, body='NIGHT', dark='PLUM', eye='EYE_RED', mark='EYE_RED',
                          abdomen=(0.56, 0.64, 0.46), head=(0.34, 0.31, 0.28), leg_reach=0.92, leg_rise=0.95, leg_r=0.085),
    'enemy_skitter': dict(scale=0.74, body='DUSK', dark=(0.04, 0.1, 0.15), eye='EYE_GOLD',
                          abdomen=(0.34, 0.48, 0.28), head=(0.24, 0.22, 0.2), leg_reach=1.2, leg_rise=0.92, leg_r=0.055),
    'enemy_brute': dict(scale=1.4, body='BRUISE', dark=(0.13, 0.05, 0.16), eye='EYE_RED',
                        abdomen=(0.62, 0.68, 0.5), head=(0.4, 0.34, 0.32), leg_reach=0.78, leg_rise=0.9, leg_r=0.15),
    'enemy_wraith': dict(scale=1.0, body=(0.2, 0.15, 0.36), eye='SPIRIT', robe_r=0.44, tail_r=0.05, hood=(0.33, 0.35, 0.33)),
    'enemy_ember_eater': dict(scale=1.75, body='CHAR', dark=(0.12, 0.05, 0.05), eye='EYE_GOLD',
                              abdomen=(0.58, 0.68, 0.48), head=(0.36, 0.32, 0.3), leg_reach=0.98, leg_rise=1.0, leg_r=0.09),
    'tree_pine_a': dict(scale=1.0, leaf='PINE', top='MOSS',
                        tiers=[(1.1, 1.55, 1.6), (2.0, 1.25, 1.5), (2.85, 0.95, 1.35), (3.6, 0.65, 1.25), (4.3, 0.36, 0.95)]),
    'tree_pine_b': dict(scale=1.0, leaf=(0.08, 0.25, 0.25), top=(0.2, 0.42, 0.3), lean=0.04, every=3, seg=8,
                        tiers=[(1.3, 1.25, 1.4), (2.0, 1.1, 1.3), (2.7, 0.9, 1.25), (3.4, 0.7, 1.15), (4.1, 0.5, 1.05), (4.8, 0.3, 0.9)]),
    'tree_round': dict(scale=1.0, leaf='MOSS', top=(0.4, 0.62, 0.32),
                       blobs=[((0, 0, 2.55), (1.25, 1.15, 1.0)), ((0.6, 0.3, 2.2), (0.8, 0.75, 0.66)),
                              ((-0.55, -0.25, 2.25), (0.85, 0.8, 0.7)), ((0.1, 0.05, 3.3), (0.82, 0.76, 0.62))]),
    'tree_dead': dict(scale=1.0, bark=(0.24, 0.17, 0.14), top=(0.42, 0.38, 0.38)),
    'rock_a': dict(scale=1.0, size=(0.95, 0.8, 0.62)),
    'rock_b': dict(scale=1.0, size=(0.8, 0.85, 0.7)),
    'stump': dict(scale=1.0), 'fence': dict(scale=1.0, rail=1.6), 'mushroom': dict(scale=1.0), 'grass': dict(scale=1.0),
    'lamp': dict(scale=1.0), 'banner': dict(cloth='CLOAK_RED'), 'camp': dict(stones=10, ring=1.35),
    # heroes: colours match src/data.js HEROES (tunic/cloak); head is ~40% of body height for the chibi read
    'hero_warden': dict(hat='brim', tunic='HERO_BLUE', cloak='CLOAK_RED', hatc=(0.46, 0.29, 0.14), band='CLOAK_RED',
                        hair=(0.36, 0.2, 0.1), scarf='CLOAK_RED', head=0.34),
    'hero_wren': dict(hat='hood', tunic=(0.25, 0.4, 0.2), cloak=(0.2, 0.5, 0.25), hatc=(0.16, 0.44, 0.22), band='CLOAK_RED',
                      hair=(0.75, 0.42, 0.16), scarf=(0.55, 0.36, 0.18), head=0.33, quiver=True),
    'hero_monk': dict(hat='cowl', tunic=(0.5, 0.2, 0.1), cloak=(0.85, 0.4, 0.1), hatc=(0.85, 0.4, 0.1), band='GOLD',
                      hair=(0.2, 0.12, 0.08), scarf=(0.5, 0.2, 0.1), head=0.34, beads=True, wide=1.1),
    # boss: final size ~5.5 m to the antler tips, hitbox r=2.3 lives in data.js ET and is untouched
    'boss_stag': dict(scale=1.0, body=(0.11, 0.08, 0.2), dark=(0.06, 0.05, 0.12), mask='BONE', antler='EMBER', core='EMBER'),
}

# shader joint ids (must match gfx.js VERT)
J_LEG_L, J_LEG_R, J_ARM_L, J_ARM_R, J_SPIDER_A, J_SPIDER_B, J_SWAY, J_HEAD, J_CAPE = 1, 2, 3, 4, 5, 6, 7, 8, 9


# ---------------------------------------------------------------- geometry builder
class Asset:
    """One bmesh per asset. Every part is a separate island carrying its own colour/emissive/joint/pivot."""

    def __init__(self, name, seed=1):
        self.name, self.rng = name, random.Random(seed)
        self.bm = bmesh.new()
        self.lc = self.bm.loops.layers.float_color.new('Col')
        self.l_em = self.bm.verts.layers.float.new('_EM')
        self.l_j = self.bm.verts.layers.float.new('_JOINT')
        self.l_pv = self.bm.verts.layers.float_vector.new('_PIVOT')

    def _tag(self, verts, c, em=0.0, j=0, pv=(0, 0, 0), jit=0.06, pre=None, disp=None, floor=None,
             top=None, topk=0.7, under=1.0, caps=None, _axis=None):
        """Finalize one part island.
        pre(verts): custom vertex edit; disp=(amount, freq, seed): faceted noise; floor=z: flatten anything below z.
        Colour per face: c with +-jit value jitter; top=colour blended in on up-facing faces (topk strength);
        under multiplies down-facing faces; caps=colour for faces along the part axis (cut log ends)."""
        if pre:
            pre(verts)
        if disp:
            self.displace(verts, *disp)
        if floor is not None:
            for v in verts:
                v.co.z = max(v.co.z, floor)
        faces = list({f for v in verts for f in v.link_faces})
        bmesh.ops.recalc_face_normals(self.bm, faces=faces)
        p = Vector(pv)
        for v in verts:
            v[self.l_em] = em; v[self.l_j] = float(j); v[self.l_pv] = p
        for f in faces:
            k = 1 + (self.rng.random() - 0.5) * 2 * jit
            cc = c
            if top is not None or under != 1.0 or caps is not None:
                f.normal_update()
                nz = f.normal.z
                if caps is not None and _axis is not None and abs(f.normal.dot(_axis)) > 0.9:
                    cc = caps
                else:
                    if top is not None:
                        t = min(1.0, max(0.0, (nz - 0.15) / 0.7)) * topk
                        cc = (cc[0] + (top[0] - cc[0]) * t, cc[1] + (top[1] - cc[1]) * t, cc[2] + (top[2] - cc[2]) * t)
                    if nz < -0.3:
                        cc = (cc[0] * under, cc[1] * under, cc[2] * under)
            for l in f.loops:
                l[self.lc] = (cc[0] * k, cc[1] * k, cc[2] * k, 1.0)
        return verts

    @staticmethod
    def _mat(loc, rot=(0, 0, 0), scl=(1, 1, 1)):
        return Matrix.LocRotScale(Vector(loc), Euler(rot), Vector(scl))

    def ico(self, loc, scl, c, sub=2, rot=(0, 0, 0), **k):
        v = bmesh.ops.create_icosphere(self.bm, subdivisions=sub, radius=1.0, matrix=self._mat(loc, rot, scl))['verts']
        return self._tag(v, c, **k)

    def uvs(self, loc, scl, c, seg=8, ring=6, rot=(0, 0, 0), **k):
        v = bmesh.ops.create_uvsphere(self.bm, u_segments=seg, v_segments=ring, radius=1.0, matrix=self._mat(loc, rot, scl))['verts']
        return self._tag(v, c, **k)

    def cone(self, loc, r1, r2, h, c, seg=6, rot=(0, 0, 0), scl=(1, 1, 1), **k):
        """Truncated cone along local Z, centred on loc."""
        v = bmesh.ops.create_cone(self.bm, cap_ends=True, cap_tris=False, segments=seg, radius1=r1, radius2=r2, depth=h,
                                  matrix=self._mat(loc, rot, scl))['verts']
        return self._tag(v, c, _axis=Euler(rot).to_matrix() @ Vector((0, 0, 1)), **k)

    def box(self, loc, size, c, rot=(0, 0, 0), **k):
        v = bmesh.ops.create_cube(self.bm, size=1.0, matrix=self._mat(loc, rot, size))['verts']
        return self._tag(v, c, **k)

    def limb(self, p0, p1, r0, r1, c, seg=5, **k):
        """Tapered tube from p0 to p1."""
        p0, p1 = Vector(p0), Vector(p1)
        d = p1 - p0
        q = Vector((0, 0, 1)).rotation_difference(d.normalized())
        m = Matrix.Translation((p0 + p1) / 2) @ q.to_matrix().to_4x4()
        v = bmesh.ops.create_cone(self.bm, cap_ends=True, cap_tris=False, segments=seg, radius1=r0, radius2=r1, depth=d.length, matrix=m)['verts']
        return self._tag(v, c, _axis=d.normalized(), **k)

    def displace(self, verts, amt, freq=2.0, seed=0, center=None):
        """Faceted noise displacement along the direction from the part centre."""
        cen = center or sum((v.co for v in verts), Vector()) / len(verts)
        off = Vector((seed * 17.1, seed * 3.7, seed * 9.3))
        for v in verts:
            d = v.co - cen
            if d.length < 1e-6:
                continue
            v.co += d.normalized() * (noise.noise(v.co * freq + off) * amt)
        return verts

    def lathe(self, pts, seg, c, loc=(0, 0, 0), scl=(1, 1, 1), cap_bottom=True, cap_top=True, bend=None, **k):
        """Surface of revolution from [(radius, z), ...] bottom to top. bend(z)->(dx, dy) shifts rings (curved hats, tails)."""
        bm = self.bm
        rings, verts = [], []
        for (r, z) in pts:
            r = max(r, 0.002)
            dx, dy = bend(z) if bend else (0.0, 0.0)
            ring = []
            for i in range(seg):
                a = i / seg * math.tau
                ring.append(bm.verts.new(Vector((math.cos(a) * r * scl[0] + loc[0] + dx, math.sin(a) * r * scl[1] + loc[1] + dy, z * scl[2] + loc[2]))))
            rings.append(ring); verts += ring
        for j in range(len(rings) - 1):
            for i in range(seg):
                try:
                    bm.faces.new((rings[j][i], rings[j][(i + 1) % seg], rings[j + 1][(i + 1) % seg], rings[j + 1][i]))
                except ValueError:
                    pass
        if cap_bottom:
            try: bm.faces.new(rings[0][::-1])
            except ValueError: pass
        if cap_top:
            try: bm.faces.new(rings[-1])
            except ValueError: pass
        return self._tag(verts, c, **k)

    def finish(self, scale=1.0):
        bm = self.bm
        if scale != 1.0:
            for v in bm.verts:
                v.co *= scale
                v[self.l_pv] = v[self.l_pv] * scale
        # pivots are consumed as raw vertex data in Y-up game space: (x, z, -y)
        for v in bm.verts:
            p = v[self.l_pv]
            v[self.l_pv] = Vector((p.x, p.z, -p.y))
        old = bpy.data.objects.get(self.name)
        if old:
            m = old.data
            bpy.data.objects.remove(old, do_unlink=True)
            if m and m.users == 0:
                bpy.data.meshes.remove(m)
        for m in [m for m in bpy.data.meshes if m.name.split('.')[0] == self.name and m.users == 0]:
            bpy.data.meshes.remove(m)
        me = bpy.data.meshes.new(self.name)
        bm.to_mesh(me)
        bm.free()
        for p in me.polygons:
            p.use_smooth = False
        ca = me.color_attributes['Col']
        me.color_attributes.active_color = ca
        me.color_attributes.render_color_index = me.color_attributes.active_color_index
        ob = bpy.data.objects.new(self.name, me)
        coll = bpy.data.collections.get('assets') or bpy.data.collections.new('assets')
        if coll.name not in bpy.context.scene.collection.children:
            bpy.context.scene.collection.children.link(coll)
        coll.objects.link(ob)
        return ob


def tris(ob):
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)


# ---------------------------------------------------------------- spiders (shared rig: 8 legs on joints 5/6)
def spider_legs(a, o, reach, rise, r, dark, hip_y=(-0.30, -0.10, 0.10, 0.30), hip_z=0.58, hip_x=0.26, spread=(-0.55, -0.2, 0.2, 0.55), knee_ball=True,
                seg=5, knee_c=None, knee_em=0.0):
    for i, hy in enumerate(hip_y):
        for sd in (-1, 1):
            j = J_SPIDER_B if (i + (1 if sd > 0 else 0)) % 2 else J_SPIDER_A
            hip = Vector((sd * hip_x, hy, hip_z))
            out = Vector((sd, spread[i], 0)).normalized()
            knee = Vector((hip.x + out.x * reach * 0.5, hy + out.y * reach * 0.55, rise))
            foot = Vector((hip.x + out.x * reach, hy + out.y * reach, 0.0))
            a.limb(hip, knee, r * 1.25, r, dark, seg=seg, j=j, pv=hip)
            if knee_ball:
                a.ico(knee, (r * 1.3,) * 3, knee_c or dark, sub=1, j=j, pv=hip, em=knee_em)
            a.limb(knee, foot, r, r * 0.35, dark, seg=seg, j=j, pv=hip)


def build_enemy_creeper():
    o = P['enemy_creeper']
    a = Asset('enemy_creeper', seed=11)
    body, dark, eye = col(o['body']), col(o['dark']), col(o['eye'])
    ab = o['abdomen']
    # abdomen: big faceted bulb behind, slightly raised
    a.displace(a.ico((0, 0.30, 0.66), ab, body, sub=2), 0.05, 3.0, seed=1)
    # top marking: dim ember diamond that reads from the 53-degree camera
    a.ico((0, 0.26, 0.66 + ab[2] * 0.93), (0.13, 0.22, 0.05), col(o['mark'], 0.55), sub=1, em=0.45, jit=0)
    a.ico((0, 0.58, 0.66 + ab[2] * 0.62), (0.08, 0.11, 0.04), col(o['mark'], 0.55), sub=1, em=0.45, jit=0, rot=(0.8, 0, 0))
    # head (cephalothorax)
    hd = o['head']
    a.ico((0, -0.30, 0.58), hd, col(o['body'], 0.85), sub=2)
    # eyes: two big glowing eyes on the front-top, two small below
    for sd in (-1, 1):
        a.ico((sd * 0.13, -0.54, 0.72), (0.11, 0.08, 0.11), eye, sub=1, em=1, jit=0)
        a.ico((sd * 0.075, -0.60, 0.585), (0.05, 0.04, 0.05), eye, sub=1, em=1, jit=0)
        # fangs
        a.cone((sd * 0.07, -0.58, 0.40), 0.035, 0.005, 0.16, col('BONE', 0.55), seg=4, rot=(-0.3, 0, 0))
    # back spines for a jagged silhouette
    for i, (y, h) in enumerate(((0.05, 0.22), (0.30, 0.26), (0.55, 0.2))):
        a.cone((0, y, 0.66 + ab[2] * 0.9 + h * 0.4), 0.06, 0.0, h, dark, seg=4, rot=(0.35, 0, 0))
    spider_legs(a, o, o['leg_reach'], o['leg_rise'], o['leg_r'], dark)
    return a.finish(o['scale'])


def build_enemy_skitter():
    o = P['enemy_skitter']
    a = Asset('enemy_skitter', seed=12)
    body, dark, eye = col(o['body']), col(o['dark']), col(o['eye'])
    a.displace(a.ico((0, 0.22, 0.52), o['abdomen'], body, sub=2, top=col(o['body'], 1.5), topk=0.5), 0.04, 3.0, seed=2)
    a.cone((0, 0.72, 0.54), 0.18, 0.0, 0.42, dark, seg=5, rot=(-math.pi / 2 + 0.25, 0, 0))  # pointed tail
    a.ico((0, -0.24, 0.5), o['head'], col(o['body'], 0.8), sub=2)
    for sd in (-1, 1):
        a.ico((sd * 0.10, -0.42, 0.61), (0.085, 0.06, 0.085), eye, sub=1, em=1, jit=0)
        a.ico((sd * 0.06, -0.46, 0.50), (0.04, 0.035, 0.04), eye, sub=1, em=1, jit=0)
    for i in range(5):  # tall back spikes: the skitter's signature from above
        y = -0.05 + i * 0.17
        a.cone((0, y, 0.78 + 0.05 * math.sin(i * 1.3)), 0.06, 0.0, 0.34 - abs(i - 1.5) * 0.04, col(o['eye'], 0.45), seg=4, rot=(0.55, 0, 0), em=0.35)
    spider_legs(a, o, o['leg_reach'], o['leg_rise'], o['leg_r'], dark, hip_z=0.48, hip_x=0.2, hip_y=(-0.26, -0.09, 0.08, 0.25))
    return a.finish(o['scale'])


def build_enemy_brute():
    o = P['enemy_brute']
    a = Asset('enemy_brute', seed=13)
    body, dark, eye, bone = col(o['body']), col(o['dark']), col(o['eye']), col('BONE', 0.75)
    a.displace(a.ico((0, 0.32, 0.66), o['abdomen'], body, sub=2), 0.05, 3.0, seed=3)
    # armoured carapace plates (segmented read from the top camera)
    for y, z, s, rx in ((-0.02, 1.08, 0.40, 0.25), (0.34, 1.13, 0.44, 0.0), (0.70, 0.98, 0.36, -0.45)):
        a.ico((0, y, z), (s, 0.26, 0.11), col('BONE', 0.3), sub=1, rot=(rx, 0, 0), top=col('BONE', 0.42), topk=0.6)
    a.ico((0, -0.34, 0.62), o['head'], col(o['body'], 0.8), sub=2)
    for sd in (-1, 1):
        # big forward-curving horns
        p0, p1, p2, p3 = (Vector((sd * 0.18, -0.46, 0.84)), Vector((sd * 0.5, -0.58, 1.12)),
                          Vector((sd * 0.62, -0.78, 1.45)), Vector((sd * 0.46, -0.98, 1.66)))
        a.limb(p0, p1, 0.15, 0.12, bone, seg=6, top=col('BONE'), topk=0.5)
        a.limb(p1, p2, 0.12, 0.08, bone, seg=6, top=col('BONE'), topk=0.5)
        a.limb(p2, p3, 0.08, 0.0, bone, seg=6, top=col('BONE'), topk=0.5)
        a.ico((sd * 0.09, -0.65, 0.72), (0.06, 0.045, 0.06), eye, sub=1, em=1, jit=0)
        a.ico((sd * 0.2, -0.6, 0.7), (0.05, 0.04, 0.05), eye, sub=1, em=1, jit=0)
        a.cone((sd * 0.1, -0.68, 0.42), 0.06, 0.01, 0.24, bone, seg=4, rot=(-0.4, 0, sd * 0.2))  # mandibles
    spider_legs(a, o, o['leg_reach'], o['leg_rise'], o['leg_r'], dark, hip_x=0.38, hip_z=0.6, seg=5, knee_ball=False)
    return a.finish(o['scale'])


def build_enemy_wraith():
    o = P['enemy_wraith']
    a = Asset('enemy_wraith', seed=14)
    body, inner, eye = col(o['body']), col('PLUM', 0.45), col(o['eye'])
    pv = (0, 0, 1.35)  # sways like a pendulum from the head (joint 7)
    k = dict(j=J_SWAY, pv=pv)
    top = col(o['body'], 1.7)
    spirit = col(o['eye'], 0.7)

    def curl(verts):  # tail trails backwards and curls slightly sideways
        for v in verts:
            t = max(0.0, 1.05 - v.co.z)
            v.co.y += t * t * 0.55
            v.co.x += math.sin(t * 3.0) * 0.08
    # ghost body: wide shoulders tapering into a curled tail (classic spirit teardrop)
    a.cone((0, 0.02, 0.6), o['tail_r'], o['robe_r'], 0.95, body, seg=9, pre=curl, top=top, topk=0.5, under=0.65, **k)
    a.ico((0, 0, 1.12), (o['robe_r'] * 1.02, o['robe_r'] * 0.85, 0.3), body, sub=2, top=top, topk=0.5, **k)
    # tattered strips hanging from the shoulders, each tipped with ghost-light
    for i, ang in enumerate((-2.2, -1.2, -0.2, 0.8, 1.8, 2.6)):
        r = o['robe_r'] * 0.88
        p0 = Vector((math.cos(ang) * r, math.sin(ang) * r * 0.85 + 0.05, 0.98))
        p1 = p0 + Vector((math.cos(ang) * 0.12, math.sin(ang) * 0.12 + 0.18, -0.5 - 0.12 * (i % 2)))
        a.limb(p0, p1, 0.09, 0.0, col(o['body'], 0.85), seg=4, **k)
        a.ico(p1, (0.04, 0.04, 0.05), spirit, sub=1, em=0.8, jit=0, **k)
    a.ico((0, 0.04, 1.46), o['hood'], col(o['body'], 1.1), sub=2, top=top, topk=0.55, **k)
    a.cone((0, 0.2, 1.78), 0.15, 0.0, 0.38, col(o['body'], 1.1), seg=5, rot=(0.8, 0, 0), **k)  # hood peak, flops back
    a.ico((0, -0.21, 1.41), (0.23, 0.13, 0.22), inner, sub=1, jit=0, **k)  # dark face opening
    for sd in (-1, 1):
        a.ico((sd * 0.09, -0.31, 1.43), (0.065, 0.03, 0.085), col(o['eye']), sub=1, em=1, jit=0, **k)
        p0, p1, p2 = Vector((sd * 0.36, -0.04, 1.2)), Vector((sd * 0.62, -0.3, 1.0)), Vector((sd * 0.52, -0.6, 0.82))
        a.limb(p0, p1, 0.1, 0.07, body, seg=5, **k)
        a.limb(p1, p2, 0.07, 0.04, body, seg=5, **k)
        for c in (-1, 0, 1):  # three spectral claws
            a.cone(p2 + Vector((sd * 0.04 * c, -0.07, -0.06)), 0.03, 0.0, 0.24, spirit, seg=3, rot=(-2.3, 0, sd * 0.3 * c), em=0.5, jit=0, **k)
    return a.finish(o['scale'])


def build_enemy_ember_eater():
    o = P['enemy_ember_eater']
    a = Asset('enemy_ember_eater', seed=15)
    body, dark, eye, ember, lava = col(o['body']), col(o['dark']), col(o['eye']), col('EMBER', 0.8), col('LAVA', 0.75)
    ab, ac = o['abdomen'], Vector((0, 0.3, 0.66))
    a.displace(a.ico(ac, ab, body, sub=3, top=col(o['body'], 1.4), topk=0.4), 0.06, 2.6, seed=5)
    # glowing ember cracks lying on the abdomen surface
    rng = random.Random(5)
    for i in range(10):
        x, y = rng.uniform(-0.62, 0.62) * ab[0], ac.y + rng.uniform(-0.75, 0.75) * ab[1]
        q = 1 - (x / ab[0]) ** 2 - ((y - ac.y) / ab[1]) ** 2
        if q < 0.15:
            continue
        z = ac.z + ab[2] * math.sqrt(q) - 0.01
        a.ico((x, y, z), (0.028, 0.15, 0.03), lava, sub=1, rot=(0, -x * 1.2, rng.uniform(-0.8, 0.8)), em=0.8, jit=0)
    a.ico((0, -0.3, 0.6), o['head'], col(o['body'], 1.1), sub=2)
    a.ico((0, -0.58, 0.5), (0.17, 0.07, 0.1), ember, sub=1, em=1, jit=0)  # glowing maw
    for sd in (-1, 1):
        for p0, p1, p2, r in (((sd * 0.14, -0.42, 0.82), (sd * 0.3, -0.5, 1.14), (sd * 0.44, -0.38, 1.42), 0.08),
                              ((sd * 0.3, -0.3, 0.8), (sd * 0.55, -0.3, 0.98), (sd * 0.7, -0.15, 1.1), 0.06)):
            a.limb(Vector(p0), Vector(p1), r, r * 0.65, col('CHAR', 1.4), seg=5, top=lava, topk=0.6)
            a.limb(Vector(p1), Vector(p2), r * 0.65, 0.0, ember, seg=5, em=0.6, jit=0)
        a.ico((sd * 0.12, -0.55, 0.72), (0.075, 0.06, 0.075), eye, sub=1, em=1, jit=0)
        a.ico((sd * 0.06, -0.6, 0.63), (0.04, 0.035, 0.04), eye, sub=1, em=1, jit=0)
    for i, y in enumerate((0.0, 0.25, 0.5, 0.72)):
        a.cone((0, y, ac.z + ab[2] * 0.95 + 0.08), 0.07, 0.0, 0.3 - i * 0.03, col('CHAR', 1.5), seg=4, rot=(0.4, 0, 0))
    spider_legs(a, o, o['leg_reach'], o['leg_rise'], o['leg_r'], dark, hip_x=0.3, knee_c=lava, knee_em=0.35)
    return a.finish(o['scale'])


# ---------------------------------------------------------------- environment
def droop(dz, out=0.0, every=2, phase=0):
    """Pull every n-th vertex of a part's bottom ring down (ragged, drooping pine tiers / robe hems)."""
    def f(verts):
        zs = min(v.co.z for v in verts)
        ring = [v for v in verts if v.co.z < zs + 1e-4]
        cx, cy = sum(v.co.x for v in ring) / len(ring), sum(v.co.y for v in ring) / len(ring)
        ring.sort(key=lambda v: math.atan2(v.co.y - cy, v.co.x - cx))
        for i, v in enumerate(ring):
            if (i + phase) % every == 0:
                v.co.z -= dz
                v.co.x += (v.co.x - cx) * out; v.co.y += (v.co.y - cy) * out
    return f


def _pine(name, o, seed):
    a = Asset(name, seed=seed)
    leaf, top, bark = col(o['leaf']), col(o['top']), col('BARK', 0.75)
    a.cone((0, 0, 0.75), 0.26, 0.15, 1.5, bark, seg=6)
    for i, (zb, r, h) in enumerate(o['tiers']):
        lean = o.get('lean', 0) * i
        a.cone((lean, 0, zb + h / 2), r, r * 0.14, h, leaf, seg=o.get('seg', 9), rot=(0, 0, i * 0.7),
               pre=droop(0.2 * r, 0.06, o.get('every', 2), i % 2), top=top, topk=0.6, under=0.55)
    return a.finish(o['scale'])


def build_tree_pine_a():
    return _pine('tree_pine_a', P['tree_pine_a'], 21)


def build_tree_pine_b():
    return _pine('tree_pine_b', P['tree_pine_b'], 22)


def build_tree_round():
    o = P['tree_round']
    a = Asset('tree_round', seed=23)
    bark, leaf, top = col('BARK', 0.75), col(o['leaf']), col(o['top'])
    a.limb((0, 0, -0.05), (0.06, 0.02, 1.7), 0.24, 0.15, bark, seg=6)
    a.limb((0.04, 0.0, 1.2), (0.55, 0.2, 2.0), 0.1, 0.06, bark, seg=5)
    a.limb((0.04, 0.0, 1.35), (-0.5, -0.2, 2.1), 0.1, 0.06, bark, seg=5)
    for i, (loc, s) in enumerate(o['blobs']):
        a.ico(loc, s, leaf, sub=2, disp=(0.16, 1.6, i + 1), top=top, topk=0.65, under=0.5)
    return a.finish(o['scale'])


def build_tree_dead():
    o = P['tree_dead']
    a = Asset('tree_dead', seed=24)
    bark, top = col(o['bark']), col(o['top'])
    pts = [Vector(p) for p in ((0, 0, -0.05), (0.1, 0.06, 1.0), (-0.06, 0.12, 2.0), (0.12, 0.0, 2.9), (0.05, -0.05, 3.5))]
    rad = (0.3, 0.22, 0.16, 0.1, 0.04)
    for i in range(len(pts) - 1):
        a.limb(pts[i], pts[i + 1], rad[i], rad[i + 1], bark, seg=6, top=top, topk=0.4)
        if 0 < i:
            a.ico(pts[i], (rad[i] * 1.05,) * 3, bark, sub=1)
    for chain in (((-0.05, 0.1, 1.85), (-0.72, 0.22, 2.55), (-1.0, 0.1, 3.1)),
                  ((0.08, 0.05, 1.25), (0.62, -0.12, 1.95), (0.8, -0.35, 2.45)),
                  ((0.1, 0.0, 2.7), (0.32, 0.5, 3.3), (0.25, 0.75, 3.55)),
                  ((-0.7, 0.2, 2.5), (-0.95, 0.55, 2.7))):
        for k in range(len(chain) - 1):
            r0 = 0.1 if k == 0 else 0.055
            a.limb(chain[k], chain[k + 1], r0, r0 * 0.5, bark, seg=5, top=top, topk=0.4)
    for ang in (0.4, 2.5, 4.4):  # roots
        a.limb((math.cos(ang) * 0.15, math.sin(ang) * 0.15, 0.3), (math.cos(ang) * 0.7, math.sin(ang) * 0.7, -0.05), 0.13, 0.04, bark, seg=4)
    return a.finish(o['scale'])


def build_rock_a():
    o = P['rock_a']
    a = Asset('rock_a', seed=25)
    a.ico((0, 0, 0.32), o['size'], col('STONE'), sub=2, disp=(0.22, 1.4, 3), floor=0.0, top=col('STONE', 1.35), topk=0.5, under=0.7, jit=0.08)
    return a.finish(o['scale'])


def build_rock_b():
    o = P['rock_b']
    a = Asset('rock_b', seed=26)
    a.ico((0, 0, 0.36), o['size'], col('STONE', 0.9), sub=2, disp=(0.25, 1.2, 7), floor=0.0, top=col('MOSS', 0.9), topk=0.5, under=0.7, jit=0.08)
    a.ico((0.82, -0.3, 0.12), (0.36, 0.32, 0.26), col('STONE'), sub=1, disp=(0.06, 2.0, 8), floor=0.0, top=col('STONE', 1.35), topk=0.5, jit=0.08)
    a.ico((-0.6, -0.55, 0.06), (0.18, 0.16, 0.12), col('STONE'), sub=1, floor=0.0, jit=0.08)
    return a.finish(o['scale'])


def build_stump():
    o = P['stump']
    a = Asset('stump', seed=27)
    bark = col('BARK', 0.85)
    a.cone((0, 0, 0.25), 0.42, 0.36, 0.5, bark, seg=8, caps=col('BONE', 0.62), disp=(0.03, 4.0, 2))
    a.cone((0, 0, 0.505), 0.24, 0.24, 0.012, col('BARK', 1.05), seg=8)  # growth ring
    for i, ang in enumerate((0.3, 1.9, 3.3, 4.9)):
        a.limb((math.cos(ang) * 0.3, math.sin(ang) * 0.3, 0.16), (math.cos(ang) * 0.72, math.sin(ang) * 0.72, -0.04), 0.12, 0.03, bark, seg=4)
    return a.finish(o['scale'])


def build_fence():
    o = P['fence']
    a = Asset('fence', seed=28)
    wood = col('BARK', 0.9)
    a.cone((0, 0, 0.6), 0.1, 0.085, 1.2, col('BARK', 0.75), seg=6, top=col('BARK', 1.1))
    a.cone((0, 0, 1.3), 0.085, 0.0, 0.2, col('BARK', 0.75), seg=6)
    a.box((0.0, 0, 0.95), (0.07, o['rail'], 0.1), wood, rot=(0.04, 0, 0), top=col('BARK', 1.25), topk=0.6)
    a.box((0.0, 0, 0.52), (0.07, o['rail'] * 0.92, 0.09), wood, rot=(-0.06, 0, 0), top=col('BARK', 1.25), topk=0.6)
    a.box((0, 0, 0.95), (0.13, 0.13, 0.14), col('BONE', 0.5))  # rope binding
    return a.finish(o['scale'])


def build_mushroom():
    a = Asset('mushroom', seed=29)
    a.cone((0, 0, 0.16), 0.1, 0.075, 0.32, col('TINT_STEM'), seg=6, jit=0.03)
    a.uvs((0, 0, 0.3), (0.3, 0.3, 0.19), col('TINT_BASE'), seg=9, ring=5, floor=0.3, em=1, jit=0.05)
    return a.finish(P['mushroom']['scale'])


def build_grass():
    a = Asset('grass', seed=30)
    rng = random.Random(30)
    for i in range(5):
        ang = i / 5 * math.tau + rng.uniform(-0.3, 0.3)
        r = 0.08 + rng.uniform(0, 0.06)
        h = 0.38 + rng.uniform(0, 0.24)
        a.cone((math.cos(ang) * r, math.sin(ang) * r, h / 2), 0.05, 0.0, h, col('GRASS_BASE'), seg=3,
               rot=(math.sin(ang) * -0.35, math.cos(ang) * 0.35, ang), jit=0.08)
    return a.finish(P['grass']['scale'])


def build_lamp():
    a = Asset('lamp', seed=31)
    wood, iron = col('BARK', 0.7), col('ASH', 1.6)
    a.cone((0, 0, 0.12), 0.2, 0.13, 0.24, col('STONE', 0.8), seg=6, top=col('STONE', 1.1))
    a.cone((0, 0, 1.15), 0.09, 0.075, 2.2, wood, seg=6)
    a.box((-0.33, 0, 2.2), (0.78, 0.08, 0.08), wood, top=col('BARK', 1.0))
    a.limb((0, 0, 1.85), (-0.32, 0, 2.18), 0.03, 0.03, wood, seg=4)
    lx = -0.55  # lantern x: gfx.js puts the lamp light pool here
    a.limb((lx, 0, 2.18), (lx, 0, 2.08), 0.015, 0.015, iron, seg=3)
    a.cone((lx, 0, 2.03), 0.16, 0.03, 0.12, iron, seg=6)
    a.cone((lx, 0, 1.87), 0.1, 0.1, 0.22, col('EMBER'), seg=6, em=1, jit=0)
    a.cone((lx, 0, 1.75), 0.13, 0.1, 0.04, iron, seg=6)
    for k in range(3):
        ang = k / 3 * math.tau + 0.5
        a.box((lx + math.cos(ang) * 0.105, math.sin(ang) * 0.105, 1.88), (0.025, 0.025, 0.26), iron, rot=(0, 0, ang))
    return a.finish(P['lamp']['scale'])


def build_banner():
    a = Asset('banner', seed=32)
    wood, cloth = col('BARK', 0.75), col(P['banner']['cloth'])
    a.cone((0, 0, 1.5), 0.06, 0.05, 3.0, wood, seg=6)
    a.ico((0, 0, 3.06), (0.08, 0.08, 0.1), col('GOLD'), sub=1)
    a.box((0.36, 0, 2.9), (0.8, 0.06, 0.06), wood)
    a.box((0.36, 0, 2.22), (0.6, 0.04, 1.3), cloth, top=col(P['banner']['cloth'], 1.3), topk=0.4)
    for x in (0.2, 0.52):  # swallow-tail ends
        a.cone((x, 0, 1.42), 0.15, 0.0, 0.3, cloth, seg=4, rot=(math.pi, 0, math.pi / 4), scl=(1, 0.14, 1))
    for y in (-0.025, 0.025):
        a.ico((0.36, y, 2.35), (0.12, 0.02, 0.17), col('EMBER'), sub=1, em=0.8, jit=0)
    return a.finish(1.0)


def build_pillar():
    a = Asset('pillar', seed=33)
    st, top = col('STONE', 0.8), col('STONE', 1.15)
    a.box((0, 0, 0.5), (0.95, 0.95, 1.0), st, disp=(0.07, 2.0, 1), top=top, topk=0.5, jit=0.08)
    a.box((0.03, 0, 1.45), (0.85, 0.85, 0.9), st, rot=(0, 0, 0.2), disp=(0.07, 2.0, 2), top=top, topk=0.5, jit=0.08)
    a.box((0.08, 0.02, 2.22), (0.8, 0.8, 0.62), st, rot=(0.12, 0.08, 0.45), disp=(0.08, 2.0, 3), top=top, topk=0.5, jit=0.08)
    a.box((0.75, 0.35, 0.12), (0.4, 0.3, 0.24), st, rot=(0.2, 0.1, 0.6), disp=(0.05, 2.0, 4), top=top, topk=0.5, jit=0.08)
    return a.finish(1.0)


def build_gem():
    a = Asset('gem', seed=34)
    a.cone((0, 0, 0.47), 0.17, 0.0, 0.36, col('TINT_BASE'), seg=6, em=1, jit=0.12)
    a.cone((0, 0, 0.17), 0.0, 0.17, 0.24, col('TINT_BASE', 0.8), seg=6, em=1, jit=0.12)
    return a.finish(1.0)


def build_chest():
    a = Asset('chest', seed=35)
    wood, gold = col('BARK', 0.9), col('GOLD', 0.75)
    a.box((0, 0, 0.25), (0.8, 0.55, 0.5), wood, top=col('BARK', 1.2), topk=0.5)
    a.cone((0, 0, 0.5), 0.29, 0.29, 0.82, col('BARK', 1.1), seg=8, rot=(0, math.pi / 2, 0), floor=0.5)
    for x in (-0.26, 0.26):
        a.box((x, 0, 0.26), (0.07, 0.57, 0.52), gold)
        a.cone((x, 0, 0.5), 0.305, 0.305, 0.075, gold, seg=8, rot=(0, math.pi / 2, 0), floor=0.5)
    a.box((0, 0, 0.5), (0.82, 0.57, 0.035), col('EMBER'), em=1, jit=0)  # glowing seam
    a.box((0, -0.29, 0.42), (0.12, 0.05, 0.15), col('GOLD'), em=0.8, jit=0)
    return a.finish(1.0)


def build_camp():
    o = P['camp']
    a = Asset('camp', seed=36)
    rng = random.Random(36)
    a.cone((0, 0, 0.02), 1.5, 1.45, 0.04, col('ASH'), seg=14, jit=0.1)
    for i in range(o['stones']):
        ang = i / o['stones'] * math.tau + rng.uniform(-0.08, 0.08)
        s = rng.uniform(0.85, 1.15)
        a.ico((math.cos(ang) * o['ring'], math.sin(ang) * o['ring'], 0.14), (0.36 * s, 0.3 * s, 0.27 * s), col('STONE', 0.95), sub=2,
              rot=(0, 0, ang), disp=(0.08, 2.4, i + 10), floor=0.0, top=col('STONE', 1.3), topk=0.5, under=0.7, jit=0.08)
    for i in range(7):  # glowing coals
        ang, r = rng.uniform(0, math.tau), rng.uniform(0.05, 0.5)
        s = rng.uniform(0.08, 0.15)
        a.ico((math.cos(ang) * r, math.sin(ang) * r, 0.06), (s, s, s * 0.7), col('EMBER', rng.uniform(0.7, 1.0)), sub=1, em=0.9, jit=0.1)
    for i in range(6):  # tepee logs, charred at the top
        ang = i / 6 * math.tau + 0.3
        p0 = Vector((math.cos(ang) * 0.78, math.sin(ang) * 0.78, 0.06))
        p1 = Vector((math.cos(ang) * 0.12, math.sin(ang) * 0.12, 1.0))
        mid = p0.lerp(p1, 0.62)
        a.limb(p0, mid, 0.11, 0.095, col('BARK', 0.8), seg=6, caps=col('BONE', 0.55))
        a.limb(mid, p1, 0.095, 0.07, col('CHAR', 0.7), seg=6, caps=col('EMBER', 0.8))
    return a.finish(1.0)


# ---------------------------------------------------------------- heroes (shader joints: legs 1/2, arms 3/4, head 8, cape 9)
def _hero(name, o, seed):
    """Rounded chibi hero: profile-lathe coat and hats, tapered round limbs, fine-faceted head (flat shaded, ~3-4k tris)."""
    a = Asset(name, seed=seed)
    tunic, cloak, skin = col(o['tunic']), col(o['cloak']), col('SKIN')
    boot, pant = col('BARK', 0.62), (0.2, 0.17, 0.27)
    w = o.get('wide', 1.0)
    HP = (0, 0, 1.22)                       # head / neck pivot
    head = dict(j=J_HEAD, pv=HP)
    cape = dict(j=J_CAPE, pv=(0, 0.12, 1.2))
    tl = col(o['tunic'], 1.3)
    # legs and boots: tapered round legs, rounded boots with a lighter toe cap
    for sd in (-1, 1):
        lk = dict(j=J_LEG_L if sd < 0 else J_LEG_R, pv=(sd * 0.15, 0, 0.55), jit=0.03)
        a.lathe([(0.075, 0.1), (0.085, 0.25), (0.095, 0.5)], 8, pant, loc=(sd * 0.15, 0, 0), **lk)
        a.ico((sd * 0.15, -0.04, 0.1), (0.15, 0.22, 0.12), boot, sub=3, floor=0.0, top=col('BARK', 0.95), topk=0.4, **lk)
        a.ico((sd * 0.15, -0.17, 0.07), (0.1, 0.1, 0.07), col('BARK', 0.5), sub=2, floor=0.0, **lk)
    # coat: one smooth bell profile (hem flare, waist, chest, shoulders)
    coat = [(0.30 * w, 0.46), (0.385 * w, 0.48), (0.395 * w, 0.54), (0.37 * w, 0.68), (0.33 * w, 0.82), (0.3 * w, 0.95), (0.27, 1.05), (0.235, 1.13), (0.2, 1.19)]
    a.lathe(coat, 20, tunic, top=tl, topk=0.35, jit=0.025)
    a.lathe([(0.382 * w, 0.455), (0.4 * w, 0.47), (0.4 * w, 0.52), (0.388 * w, 0.545)], 16, col(o['tunic'], 0.7), cap_bottom=False, cap_top=False, jit=0.02)   # hem trim
    a.lathe([(0.352 * w, 0.655), (0.358 * w, 0.66), (0.358 * w, 0.735), (0.352 * w, 0.74)], 16, col('BARK', 0.85), jit=0.02)                                       # belt
    a.box((0, -0.362 * w, 0.7), (0.12, 0.035, 0.1), col('GOLD'), em=1, jit=0)
    a.ico((0, -0.37 * w, 0.7), (0.045, 0.02, 0.045), col('GOLD', 1.2), sub=1, em=1, jit=0)
    # scarf: rolled collar with a hanging tail that rides the cape joint
    a.lathe([(0.2, 1.14), (0.255, 1.18), (0.27, 1.24), (0.235, 1.3), (0.2, 1.3)], 14, col(o['scarf']), jit=0.03)
    a.lathe([(0.05, 0.78), (0.07, 0.95), (0.065, 1.08), (0.04, 1.12)], 8, col(o['scarf'], 0.9), loc=(0.14, 0.23, 0), scl=(1.0, 0.45, 1.0), **cape)
    # head: round, fine facets; ears, hair with a fringe, big eyes with highlights, blush, nose
    hr = o['head']
    a.ico((0, 0, 1.5), (hr, hr * 0.97, hr * 0.97), skin, sub=3, jit=0.015, **head)
    for sd in (-1, 1):
        a.ico((sd * hr * 0.97, 0.02, 1.48), (0.04, 0.05, 0.06), skin, sub=2, jit=0.01, **head)
    def hair_cut(vs):
        for v in vs:
            if v.co.z < 1.6 and v.co.y < -0.08:
                v.co.y = -0.08
    a.ico((0, 0.06, 1.575), (hr * 1.06, hr * 1.05, hr * 0.93), col(o['hair']), sub=3, pre=hair_cut, jit=0.035, **head)
    for sd in (-1, 1):
        a.ico((sd * 0.12, -hr * 0.9, 1.5), (0.052, 0.03, 0.072), (0.1, 0.07, 0.09), sub=2, jit=0, **head)
        a.ico((sd * 0.105, -hr * 0.965, 1.528), (0.018, 0.01, 0.018), col('WHITE', 1.4), sub=1, em=1, jit=0, **head)
        a.ico((sd * 0.2, -hr * 0.8, 1.42), (0.058, 0.02, 0.036), (1.0, 0.55, 0.5), sub=1, jit=0, **head)
    a.ico((0, -hr * 0.98, 1.45), (0.042, 0.032, 0.038), col('SKIN', 0.95), sub=2, jit=0, **head)
    # headwear (all lathe profiles, so the silhouette is round instead of boxy)
    hat = col(o['hatc']); hl = col(o['hatc'], 1.25)
    if o['hat'] == 'brim':
        a.lathe([(0.2, 1.66), (0.45, 1.665), (0.62, 1.7), (0.66, 1.735), (0.64, 1.74), (0.45, 1.71), (0.2, 1.7)], 14, hat, top=hl, topk=0.5, jit=0.03, **head)
        a.lathe([(0.3, 1.7), (0.315, 1.78), (0.29, 1.92), (0.24, 2.02), (0.16, 2.06), (0.0, 2.07)], 16, hat, top=hl, topk=0.5, jit=0.03, **head)
        a.lathe([(0.31, 1.74), (0.322, 1.76), (0.318, 1.82), (0.307, 1.83)], 16, col(o['band']), cap_bottom=False, cap_top=False, jit=0.02, **head)
    elif o['hat'] == 'witch':
        a.lathe([(0.2, 1.66), (0.45, 1.665), (0.64, 1.7), (0.69, 1.74), (0.66, 1.75), (0.45, 1.71), (0.2, 1.7)], 14, hat, top=hl, topk=0.5, jit=0.03, **head)
        bend = lambda z: (0.0, 0.18 * max(0.0, z - 1.8) ** 1.5)
        a.lathe([(0.3, 1.7), (0.285, 1.9), (0.24, 2.1), (0.18, 2.3), (0.11, 2.48), (0.05, 2.62), (0.0, 2.7)], 14, hat, top=hl, topk=0.5, bend=bend, jit=0.03, **head)
        a.lathe([(0.3, 1.74), (0.31, 1.76), (0.305, 1.83), (0.295, 1.84)], 16, col(o['band']), cap_bottom=False, cap_top=False, em=0.8, jit=0, **head)
        a.ico((0.0, -0.31, 1.8), (0.05, 0.025, 0.05), col(o['band'], 1.3), sub=1, em=1, jit=0, **head)
    elif o['hat'] == 'hood':
        def open_face(vs):
            for v in vs:
                v.co.y = max(v.co.y, -0.08)
        a.ico((0, 0.08, 1.58), (0.43, 0.41, 0.44), hat, sub=3, pre=open_face, top=hl, topk=0.4, jit=0.03, **head)
        bend = lambda z: (0.0, 0.3 * max(0.0, z - 1.9) ** 1.4)
        a.lathe([(0.25, 1.9), (0.2, 2.05), (0.14, 2.22), (0.07, 2.36), (0.0, 2.45)], 12, hat, top=hl, topk=0.4, bend=bend, jit=0.03, **head)
        a.cone((0.24, 0.14, 1.98), 0.06, 0.0, 0.55, col(o['band']), seg=5, rot=(0.3, 0.9, 0), scl=(1, 0.4, 1), jit=0, **head)
    else:  # monk cowl
        def flat_front(vs):
            for v in vs:
                v.co.y = max(v.co.y, -0.06)
        a.ico((0, 0.1, 1.55), (0.46, 0.43, 0.46), hat, sub=3, pre=flat_front, top=hl, topk=0.4, jit=0.03, **head)
        bend = lambda z: (0.0, 0.35 * max(0.0, 1.95 - z) ** 1.2 * 0.0 + 0.5 * max(0.0, z - 1.7))
        a.lathe([(0.22, 1.72), (0.19, 1.85), (0.13, 1.98), (0.06, 2.08), (0.0, 2.14)], 12, hat, bend=bend, jit=0.03, **head)
    # cape: smooth shell behind the body (flattened bell with a rolled collar)
    capep = [(0.25, 1.2), (0.33, 1.1), (0.42, 0.92), (0.49 * w, 0.66), (0.53 * w, 0.42), (0.55 * w, 0.3)]
    a.lathe(capep, 20, cloak, loc=(0, 0.2, 0), scl=(1, 0.38, 1), top=col(o['cloak'], 1.3), topk=0.4, under=0.7, jit=0.03, **cape)
    a.lathe([(0.25, 1.17), (0.275, 1.2), (0.27, 1.27), (0.24, 1.29)], 14, col(o['cloak'], 0.8), loc=(0, 0.12, 0), cap_bottom=False, cap_top=False, **cape)
    if o.get('quiver'):
        a.lathe([(0.075, 0.78), (0.095, 0.95), (0.1, 1.2), (0.09, 1.3)], 10, col('BARK', 0.9), loc=(-0.2, 0.36, 0), **cape)
        for k in range(3):
            a.cone((-0.2 + (k - 1) * 0.045, 0.37 + k * 0.01, 1.4), 0.035, 0.0, 0.16, col('BONE'), seg=4, rot=(0.1, 0.0, 0), jit=0, **cape)
    if o.get('beads'):
        for k in range(8):
            ang = math.pi * (0.12 + 0.76 * k / 7)
            a.ico((math.cos(ang) * 0.265, -math.sin(ang) * 0.265, 1.13 - math.sin(ang) * 0.07), (0.055,) * 3, col(o['band']), sub=1, jit=0)
    # arms: shoulder ball, tapered upper arm, elbow, forearm, cuff, round hand
    lp, rp = (-0.32, 0, 1.1), (0.32, 0, 1.1)
    la, ra = dict(j=J_ARM_L, pv=lp), dict(j=J_ARM_R, pv=rp)
    cuff = col(o['tunic'], 0.75)
    a.ico((-0.33, 0, 1.08), (0.115, 0.11, 0.11), tunic, sub=2, jit=0.02, **la)
    a.limb((-0.34, 0, 1.08), (-0.41, 0, 0.9), 0.095, 0.08, tunic, seg=8, **la)
    a.ico((-0.42, 0, 0.89), (0.085,) * 3, tunic, sub=2, jit=0.02, **la)
    a.limb((-0.42, 0, 0.89), (-0.45, 0, 0.77), 0.08, 0.07, tunic, seg=8, **la)
    a.lathe([(0.078, 0.74), (0.088, 0.78), (0.078, 0.82)], 8, cuff, loc=(-0.45, 0, 0), jit=0.02, cap_bottom=False, cap_top=False, **la)
    a.ico((-0.455, 0, 0.7), (0.088,) * 3, skin, sub=3, jit=0.015, **la)
    a.ico((0.33, 0, 1.08), (0.115, 0.11, 0.11), tunic, sub=2, jit=0.02, **ra)
    a.limb((0.34, 0, 1.08), (0.37, -0.12, 0.98), 0.095, 0.08, tunic, seg=8, **ra)
    a.ico((0.37, -0.13, 0.97), (0.085,) * 3, tunic, sub=2, jit=0.02, **ra)
    a.limb((0.37, -0.13, 0.97), (0.38, -0.3, 0.9), 0.08, 0.07, tunic, seg=8, **ra)
    a.ico((0.38, -0.35, 0.88), (0.088,) * 3, skin, sub=3, jit=0.015, **ra)
    iron, lx, ly = (0.13, 0.1, 0.12), 0.38, -0.4
    a.limb((lx, ly, 0.86), (lx, ly, 0.77), 0.012, 0.012, iron, seg=3, jit=0, **ra)
    a.lathe([(0.02, 0.7), (0.13, 0.72), (0.07, 0.76)], 8, iron, loc=(lx, ly, 0), jit=0, **ra)
    a.lathe([(0.085, 0.56), (0.095, 0.62), (0.09, 0.7), (0.07, 0.72)], 10, col('EMBER', 1.1), loc=(lx, ly, 0), em=1, jit=0, **ra)
    a.lathe([(0.1, 0.43), (0.11, 0.47)], 10, iron, loc=(lx, ly, 0), jit=0, **ra)
    return a.finish(1.0)


def build_hero_warden():
    return _hero('hero_warden', P['hero_warden'], 41)


def build_hero_wren():
    return _hero('hero_wren', P['hero_wren'], 42)


def build_hero_monk():
    return _hero('hero_monk', P['hero_monk'], 43)


# ---------------------------------------------------------------- boss: The Hollow Stag
def build_boss_stag():
    o = P['boss_stag']
    a = Asset('boss_stag', seed=50)
    body, dark, mask, ember = col(o['body']), col(o['dark']), col(o['mask'], 0.85), col(o['antler'], 0.9)
    top = col(o['body'], 1.8)
    HP = (0, -1.45, 2.85)
    head = dict(j=J_HEAD, pv=HP)
    # torso, shoulder hump, haunch
    a.ico((0, 0.1, 2.25), (0.95, 1.55, 0.82), body, sub=3, disp=(0.08, 1.5, 1), top=top, topk=0.45, under=0.7)
    a.ico((0, -0.95, 2.65), (0.88, 0.8, 0.82), body, sub=2, disp=(0.06, 2.0, 2), top=top, topk=0.45)
    a.ico((0, 1.15, 2.3), (0.82, 0.7, 0.72), body, sub=2, disp=(0.05, 2.0, 3), top=top, topk=0.45)
    # the hollow chest: ember core caged by rib bones
    a.ico((0, -1.55, 2.1), (0.42, 0.3, 0.42), col(o['core']), sub=2, em=1, jit=0)
    for sd in (-1, 1):
        for k in range(3):
            z = 2.45 - k * 0.28
            a.limb((sd * 0.2, -1.68, z), (sd * 0.62, -1.35, z - 0.12), 0.06, 0.05, mask, seg=5)
            a.limb((sd * 0.62, -1.35, z - 0.12), (sd * 0.82, -0.85, z - 0.3), 0.05, 0.03, mask, seg=5)
    # neck and skull-masked head (joint 8)
    a.limb((0, -1.25, 2.75), (0, -1.85, 3.6), 0.5, 0.32, body, seg=8, top=top, topk=0.45, **head)
    a.ico((0, -2.05, 3.78), (0.42, 0.64, 0.42), body, sub=2, rot=(0.35, 0, 0), **head)
    a.ico((0, -2.32, 3.72), (0.36, 0.5, 0.28), mask, sub=2, rot=(0.45, 0, 0), top=col(o['mask']), topk=0.5, **head)
    a.cone((0, -2.62, 3.48), 0.16, 0.08, 0.36, mask, seg=6, rot=(1.1, 0, 0), **head)  # bone snout
    for sd in (-1, 1):
        a.ico((sd * 0.15, -2.42, 3.86), (0.09, 0.05, 0.07), (0.03, 0.02, 0.04), sub=1, jit=0, **head)  # sockets
        a.ico((sd * 0.15, -2.46, 3.86), (0.06, 0.03, 0.05), col('EMBER'), sub=1, em=1, jit=0, **head)  # eyes
        a.cone((sd * 0.42, -1.95, 3.98), 0.1, 0.0, 0.42, body, seg=4, rot=(0, sd * 1.25, 0), scl=(1, 0.5, 1), **head)  # ears
        # antlers: bone at the root, burning toward the tips
        b0 = Vector((sd * 0.18, -1.98, 4.05))
        beam = [b0, Vector((sd * 0.55, -1.85, 4.75)), Vector((sd * 1.05, -1.55, 5.35)), Vector((sd * 1.3, -1.15, 6.0)), Vector((sd * 1.25, -0.8, 6.45))]
        rads = (0.13, 0.1, 0.08, 0.06, 0.0)
        for i in range(len(beam) - 1):
            c, em = (mask, 0.0) if i == 0 else (ember, 0.55 + 0.15 * i)
            a.limb(beam[i], beam[i + 1], rads[i], rads[i + 1], c, seg=6, em=em, jit=0.04, **head)
            if 0 < i < len(beam) - 1:
                a.ico(beam[i], (rads[i] * 1.1,) * 3, c, sub=1, em=em, jit=0, **head)
        for i, (d, ln) in enumerate((((0.1, -0.45, 0.75), 0.75), ((0.35, -0.2, 0.8), 0.7), ((-0.15, -0.35, 0.7), 0.6), ((0.45, 0.3, 0.55), 0.5))):
            p = beam[i + 1]
            q = p + Vector((sd * d[0], d[1], d[2])).normalized() * ln
            a.limb(p, q, rads[i + 1] * 0.85, 0.0, ember, seg=5, em=0.75, jit=0.04, **head)
    # legs: front legs straight, hind legs with a backward hock; joints 1/2 alternate diagonally like a trot
    for sd in (-1, 1):
        for front in (True, False):
            y = -1.0 if front else 1.15
            jn = (J_LEG_L if sd < 0 else J_LEG_R) if front else (J_LEG_L if sd > 0 else J_LEG_R)
            lk = dict(j=jn, pv=(sd * 0.6, y, 2.0))
            knee = Vector((sd * 0.62, y - 0.08 if front else y + 0.4, 1.05))
            a.limb((sd * 0.6, y, 2.15), knee, 0.42, 0.22, body, seg=7, top=top, topk=0.4, **lk)
            a.ico(knee, (0.22,) * 3, body, sub=1, **lk)
            a.limb(knee, (sd * 0.62, y, 0.22), 0.2, 0.12, dark, seg=6, **lk)
            a.cone((sd * 0.62, y - 0.03, 0.11), 0.18, 0.13, 0.22, col('BONE', 0.45), seg=6, **lk)  # hoof
    # glowing ember fissures along the spine, shadow mane, tail
    for k in range(7):
        a.ico((((k % 3) - 1) * 0.28, -0.7 + k * 0.32, 3.02 - abs(k - 2.5) * 0.06), (0.09, 0.2, 0.06), col('LAVA'), sub=1, em=1, jit=0)
    for k in range(6):
        a.cone((0, -1.2 + k * 0.32, 3.1 - abs(k - 1.5) * 0.08), 0.16, 0.0, 0.5, dark, seg=4, rot=(0.7, 0, 0))
    a.cone((0, 1.85, 2.55), 0.16, 0.0, 0.6, dark, seg=5, rot=(-0.9, 0, 0))
    return a.finish(o['scale'])


ASSETS = {
    'hero_warden': build_hero_warden,
    'hero_wren': build_hero_wren,
    'hero_monk': build_hero_monk,
    'boss_stag': build_boss_stag,
    'enemy_creeper': build_enemy_creeper,
    'enemy_skitter': build_enemy_skitter,
    'enemy_brute': build_enemy_brute,
    'enemy_wraith': build_enemy_wraith,
    'enemy_ember_eater': build_enemy_ember_eater,
    'tree_pine_a': build_tree_pine_a,
    'tree_pine_b': build_tree_pine_b,
    'tree_round': build_tree_round,
    'tree_dead': build_tree_dead,
    'rock_a': build_rock_a,
    'rock_b': build_rock_b,
    'stump': build_stump,
    'fence': build_fence,
    'mushroom': build_mushroom,
    'grass': build_grass,
    'lamp': build_lamp,
    'banner': build_banner,
    'pillar': build_pillar,
    'gem': build_gem,
    'chest': build_chest,
    'camp': build_camp,
}


# ---------------------------------------------------------------- session 2 additions
P.update({
    'enemy_spitter': dict(scale=0.95, body=(0.07, 0.2, 0.2), dark=(0.04, 0.1, 0.1), eye=(0.5, 1.4, 0.3), glow=(0.45, 1.3, 0.3),
                          abdomen=(0.5, 0.58, 0.42), head=(0.32, 0.3, 0.27), leg_reach=0.95, leg_rise=0.95, leg_r=0.07),
    'enemy_bulwark': dict(scale=1.45, body=(0.19, 0.17, 0.26), dark=(0.09, 0.08, 0.13), eye='EYE_RED', plate=(0.62, 0.58, 0.5),
                          abdomen=(0.6, 0.66, 0.48), head=(0.38, 0.33, 0.3), leg_reach=0.8, leg_rise=0.9, leg_r=0.13),
    'enemy_blastbug': dict(scale=0.8, body=(0.32, 0.12, 0.07), dark=(0.14, 0.06, 0.04), eye='EYE_GOLD', glow=(1.5, 0.6, 0.12),
                           abdomen=(0.52, 0.52, 0.46), head=(0.3, 0.27, 0.25), leg_reach=0.72, leg_rise=0.8, leg_r=0.07),
    'enemy_gloommoth': dict(scale=0.95, body=(0.1, 0.15, 0.24), wing=(0.16, 0.22, 0.36), eye=(0.9, 0.4, 1.5), robe_r=0.3),
    'enemy_matron': dict(scale=1.9, body=(0.2, 0.08, 0.28), dark=(0.1, 0.04, 0.14), eye=(1.4, 0.4, 1.3), glow=(0.8, 0.3, 1.4),
                         abdomen=(0.6, 0.7, 0.5), head=(0.36, 0.32, 0.3), leg_reach=1.0, leg_rise=1.0, leg_r=0.09),
    'hero_ash': dict(hat='witch', tunic=(0.3, 0.2, 0.5), cloak=(0.45, 0.2, 0.65), hatc=(0.36, 0.2, 0.52), band='SPIRIT',
                     hair=(0.85, 0.85, 0.95), scarf=(0.2, 0.55, 0.6), head=0.34),
    'boss_ashen_warden': dict(scale=1.0, body=(0.2, 0.1, 0.1), dark=(0.1, 0.05, 0.06), plate=(0.34, 0.3, 0.3), tusk='BONE', horn='EMBER', core='LAVA'),
})


def _spider_body(a, o, abdomen_c, head_c, eye_c, glow_c=None, glow_s=0.0, seed=0):
    ab = o['abdomen']
    a.displace(a.ico((0, 0.30, 0.66), ab, abdomen_c, sub=2), 0.05, 3.0, seed=seed)
    hd = o['head']
    a.ico((0, -0.30, 0.58), hd, head_c, sub=2)
    for sd in (-1, 1):
        a.ico((sd * 0.13, -0.54, 0.72), (0.11, 0.08, 0.11), eye_c, sub=1, em=1, jit=0)
        a.ico((sd * 0.075, -0.60, 0.585), (0.05, 0.04, 0.05), eye_c, sub=1, em=1, jit=0)
        a.cone((sd * 0.07, -0.58, 0.40), 0.035, 0.005, 0.16, col('BONE', 0.55), seg=4, rot=(-0.3, 0, 0))
    if glow_c:
        a.ico((0, 0.34, 0.66 + ab[2] * 0.82), (glow_s, glow_s * 1.2, glow_s * 0.8), glow_c, sub=1, em=0.9, jit=0)


def build_enemy_spitter():
    o = P['enemy_spitter']
    a = Asset('enemy_spitter', seed=61)
    body, dark = col(o['body']), col(o['dark'])
    _spider_body(a, o, body, col(o['body'], 0.85), col(o['eye']), col(o['glow']), 0.26, seed=6)
    # raised venom nozzle: reads as "ranged" from above
    a.cone((0, -0.62, 0.52), 0.1, 0.03, 0.3, dark, seg=5, rot=(-1.25, 0, 0))
    a.ico((0, -0.78, 0.5), (0.06, 0.05, 0.06), col(o['glow']), sub=1, em=1, jit=0)
    for i, y in enumerate((0.1, 0.34, 0.58)):
        a.cone((0, y, 0.66 + o['abdomen'][2] * 0.9 + 0.1), 0.05, 0.0, 0.2, dark, seg=4, rot=(0.3, 0, 0))
    spider_legs(a, o, o['leg_reach'], o['leg_rise'], o['leg_r'], dark)
    return a.finish(o['scale'])


def build_enemy_bulwark():
    o = P['enemy_bulwark']
    a = Asset('enemy_bulwark', seed=62)
    body, dark, bone = col(o['body']), col(o['dark']), col(o['plate'])
    _spider_body(a, o, body, col(o['body'], 0.8), col(o['eye']), seed=7)
    # big tilted front plate, edge studs: the visible rule "hit me from the side"
    a.box((0, -0.82, 0.78), (1.05, 0.12, 0.8), bone, rot=(0.1, 0, 0), top=col(o['plate'], 1.25), topk=0.5, jit=0.04)
    a.box((0, -0.86, 1.22), (0.8, 0.14, 0.14), col(o['plate'], 0.7), jit=0.04)
    for sd in (-1, 1):
        a.cone((sd * 0.5, -0.9, 0.9), 0.06, 0.0, 0.2, col('BONE', 0.8), seg=4, rot=(-1.4, 0, 0))
    for i, y in enumerate((-0.05, 0.3, 0.65)):  # back plates
        a.ico((0, y, 1.1 - abs(i - 1) * 0.06), (0.4 - i * 0.03, 0.26, 0.1), col(o['plate'], 0.55), sub=1, top=col(o['plate'], 0.8), topk=0.5)
    spider_legs(a, o, o['leg_reach'], o['leg_rise'], o['leg_r'], dark, hip_x=0.36, knee_ball=False)
    return a.finish(o['scale'])


def build_enemy_blastbug():
    o = P['enemy_blastbug']
    a = Asset('enemy_blastbug', seed=63)
    body, dark = col(o['body']), col(o['dark'])
    ab = o['abdomen']
    a.displace(a.ico((0, 0.22, 0.58), ab, body, sub=2), 0.04, 3.0, seed=8)
    # swollen glowing bomb sac on the back
    a.ico((0, 0.26, 0.58 + ab[2] * 0.75), (0.34, 0.38, 0.3), col(o['glow']), sub=2, em=0.9, jit=0.03)
    a.cone((0, 0.26, 0.58 + ab[2] * 0.75 + 0.3), 0.04, 0.0, 0.24, col('EYE_GOLD'), seg=4, em=1, jit=0)  # fuse spark
    hd = o['head']
    a.ico((0, -0.28, 0.52), hd, col(o['body'], 0.8), sub=2)
    for sd in (-1, 1):
        a.ico((sd * 0.11, -0.48, 0.64), (0.09, 0.07, 0.09), col(o['eye']), sub=1, em=1, jit=0)
        a.cone((sd * 0.1, -0.5, 0.42), 0.03, 0.0, 0.18, col('BONE', 0.5), seg=3, rot=(-0.3, 0, 0))
    spider_legs(a, o, o['leg_reach'], o['leg_rise'], o['leg_r'], dark, hip_z=0.5, hip_x=0.22, hip_y=(-0.26, -0.08, 0.1, 0.28))
    return a.finish(o['scale'])


def build_enemy_gloommoth():
    o = P['enemy_gloommoth']
    a = Asset('enemy_gloommoth', seed=64)
    body, wing, eye = col(o['body']), col(o['wing']), col(o['eye'])
    pv = (0, 0, 1.0)
    k = dict(j=J_SWAY, pv=pv)
    a.ico((0, 0.1, 0.95), (0.3, 0.55, 0.3), body, sub=2, top=col(o['body'], 1.6), topk=0.5, **k)       # fuzzy thorax
    a.ico((0, -0.38, 1.0), (0.22, 0.2, 0.2), col(o['body'], 0.8), sub=2, **k)
    for sd in (-1, 1):
        a.ico((sd * 0.1, -0.55, 1.05), (0.09, 0.05, 0.09), eye, sub=1, em=1, jit=0, **k)
        # big, flat moth wings with a lighter rim: they read as a bat-like cross from above
        a.ico((sd * 0.78, 0.0, 1.08), (0.72, 0.52, 0.045), wing, sub=2, rot=(0, sd * -0.18, sd * 0.25), top=col(o['wing'], 1.5), topk=0.6, **k)
        a.ico((sd * 0.66, 0.44, 0.98), (0.42, 0.32, 0.04), col(o['wing'], 0.85), sub=1, rot=(0, sd * -0.1, sd * -0.3), **k)
        a.limb((sd * 0.06, -0.52, 1.18), (sd * 0.22, -0.78, 1.52), 0.025, 0.012, body, seg=3, **k)    # antennae
        a.ico((sd * 0.22, -0.78, 1.53), (0.04,) * 3, eye, sub=1, em=0.8, jit=0, **k)
        for i in range(2):  # dangling legs
            a.limb((sd * 0.12, -0.05 + i * 0.3, 0.8), (sd * 0.26, -0.08 + i * 0.3, 0.4), 0.03, 0.015, body, seg=3, **k)
    a.cone((0, 0.62, 0.9), 0.14, 0.0, 0.4, col(o['body'], 0.9), seg=5, rot=(1.2, 0, 0), **k)
    return a.finish(o['scale'])


def build_enemy_matron():
    o = P['enemy_matron']
    a = Asset('enemy_matron', seed=65)
    body, dark = col(o['body']), col(o['dark'])
    ab = o['abdomen']
    a.displace(a.ico((0, 0.32, 0.66), ab, body, sub=3, top=col(o['body'], 1.5), topk=0.4), 0.06, 2.6, seed=9)
    rng = random.Random(9)
    for i in range(7):  # glowing egg sacs clustered on the back
        x, y = rng.uniform(-0.3, 0.3), 0.32 + rng.uniform(-0.4, 0.4)
        a.ico((x, y, 0.66 + ab[2] * 0.85 + rng.uniform(0, 0.06)), (0.13, 0.13, 0.12), col(o['glow']), sub=1, em=0.85, jit=0.05)
    a.ico((0, -0.3, 0.6), o['head'], col(o['body'], 1.05), sub=2)
    for sd in (-1, 1):
        a.ico((sd * 0.12, -0.55, 0.72), (0.075, 0.06, 0.075), col(o['eye']), sub=1, em=1, jit=0)
        a.ico((sd * 0.06, -0.6, 0.63), (0.04, 0.035, 0.04), col(o['eye']), sub=1, em=1, jit=0)
        for p0, p1, p2 in (((sd * 0.14, -0.42, 0.82), (sd * 0.28, -0.5, 1.2), (sd * 0.2, -0.45, 1.55)),):
            a.limb(Vector(p0), Vector(p1), 0.08, 0.06, col('BONE', 0.7), seg=5, top=col('BONE'), topk=0.5)
            a.limb(Vector(p1), Vector(p2), 0.06, 0.0, col(o['glow']), seg=5, em=0.7, jit=0)
    for i in range(5):  # crown of spines
        ang = math.pi * (0.1 + 0.8 * i / 4)
        a.cone((math.cos(ang) * 0.18, -0.3 - math.sin(ang) * 0.12, 0.92), 0.045, 0.0, 0.26, col('BONE', 0.7), seg=4, rot=(-0.3, math.cos(ang) * 0.4, 0))
    spider_legs(a, o, o['leg_reach'], o['leg_rise'], o['leg_r'], dark, hip_x=0.3, knee_c=col(o['glow'], 0.7), knee_em=0.35)
    return a.finish(o['scale'])


def build_hero_ash():
    """Lantern Witch: reuses the hero rig; pointed witch hat with a spirit-light band, silver hair."""
    return _hero('hero_ash', P['hero_ash'], 44)


def build_boss_ashen_warden():
    o = P['boss_ashen_warden']
    a = Asset('boss_ashen_warden', seed=70)
    body, dark, plate = col(o['body']), col(o['dark']), col(o['plate'])
    top = col(o['body'], 1.9)
    HP = (0, -1.5, 2.3)
    head = dict(j=J_HEAD, pv=HP)
    # a hulking ash-boar: broad slab torso, heavy shoulder armour, ember cracks all over
    a.ico((0, 0.1, 2.0), (1.15, 1.7, 0.95), body, sub=3, disp=(0.09, 1.4, 4), top=top, topk=0.45, under=0.7)
    a.ico((0, -0.9, 2.35), (1.05, 0.9, 0.9), body, sub=2, disp=(0.07, 2.0, 5), top=top, topk=0.45)
    a.ico((0, 1.2, 2.05), (0.95, 0.8, 0.8), body, sub=2, disp=(0.05, 2.0, 6), top=top, topk=0.45)
    for i, y in enumerate((-0.9, -0.2, 0.5, 1.2)):   # armour plates along the back
        a.ico((0, y, 2.95 - abs(i - 1.5) * 0.1), (0.7 - i * 0.04, 0.38, 0.12), plate, sub=1, top=col(o['plate'], 1.5), topk=0.5, rot=(0.15, 0, 0))
    rng = random.Random(70)
    for i in range(16):  # lava cracks, flat on the hide
        x, y = rng.uniform(-0.9, 0.9), rng.uniform(-1.4, 1.6)
        a.ico((x, y, 2.05 + 0.9 * math.sqrt(max(0.05, 1 - (x / 1.15) ** 2)) * 0.9), (0.04, 0.2, 0.035), col(o['core']), sub=1, em=0.9, jit=0, rot=(0, 0, rng.uniform(-1, 1)))
    # hollow chest forge glow
    a.ico((0, -1.7, 2.05), (0.5, 0.3, 0.5), col(o['core']), sub=2, em=1, jit=0)
    # low-slung head with tusks and little burning horns (joint 8)
    a.limb((0, -1.3, 2.4), (0, -1.9, 2.55), 0.7, 0.55, body, seg=8, top=top, topk=0.45, **head)
    a.ico((0, -2.25, 2.55), (0.62, 0.7, 0.55), body, sub=2, **head)
    a.ico((0, -2.7, 2.35), (0.42, 0.45, 0.32), dark, sub=2, **head)
    for sd in (-1, 1):
        a.ico((sd * 0.26, -2.62, 2.75), (0.1, 0.06, 0.08), col('EMBER'), sub=1, em=1, jit=0, **head)
        a.limb((sd * 0.3, -2.8, 2.3), (sd * 0.6, -3.15, 2.45), 0.12, 0.09, col(o['tusk'], 0.85), seg=5, top=col(o['tusk']), topk=0.5, **head)
        a.limb((sd * 0.6, -3.15, 2.45), (sd * 0.55, -3.45, 3.0), 0.09, 0.0, col(o['tusk'], 0.85), seg=5, **head)
        a.limb((sd * 0.38, -2.2, 3.0), (sd * 0.85, -2.1, 3.65), 0.14, 0.1, col(o['horn'], 0.9), seg=6, em=0.6, jit=0.04, **head)
        a.limb((sd * 0.85, -2.1, 3.65), (sd * 0.7, -1.75, 4.25), 0.1, 0.0, col(o['horn'], 1.0), seg=6, em=0.8, jit=0.04, **head)
        a.cone((sd * 0.72, -1.95, 2.9), 0.1, 0.0, 0.4, dark, seg=4, rot=(0, sd * 1.2, 0), scl=(1, 0.5, 1), **head)
    # legs (joints 1/2): thick pillars with armoured knees and hooves
    for sd in (-1, 1):
        for front in (True, False):
            y = -1.0 if front else 1.2
            jn = (J_LEG_L if sd < 0 else J_LEG_R) if front else (J_LEG_L if sd > 0 else J_LEG_R)
            lk = dict(j=jn, pv=(sd * 0.75, y, 1.8))
            knee = Vector((sd * 0.8, y - 0.05 if front else y + 0.3, 0.95))
            a.limb((sd * 0.75, y, 1.95), knee, 0.5, 0.3, body, seg=7, top=top, topk=0.4, **lk)
            a.ico(knee, (0.33,) * 3, plate, sub=1, **lk)
            a.limb(knee, (sd * 0.8, y, 0.25), 0.28, 0.18, dark, seg=6, **lk)
            a.cone((sd * 0.8, y - 0.03, 0.12), 0.26, 0.2, 0.26, col('BONE', 0.4), seg=6, **lk)
    a.cone((0, 1.9, 2.3), 0.2, 0.0, 0.7, dark, seg=5, rot=(-0.9, 0, 0))
    return a.finish(o['scale'])


ASSETS.update({
    'hero_ash': build_hero_ash, 'boss_ashen_warden': build_boss_ashen_warden,
    'enemy_spitter': build_enemy_spitter, 'enemy_bulwark': build_enemy_bulwark, 'enemy_blastbug': build_enemy_blastbug,
    'enemy_gloommoth': build_enemy_gloommoth, 'enemy_matron': build_enemy_matron,
})



# ---------------------------------------------------------------- session 3 additions: Cinder Drake (replaces the stag),
# remodelled Bulwark, Gloom Moth and Ashen Warden. Joint 10 = mirrored wing flap (gfx.js VERT).
J_WING = 10

P.update({
    'boss_drake': dict(scale=0.8, span=0.85, body=(0.24, 0.08, 0.07), dark=(0.1, 0.035, 0.045), belly=(0.62, 0.34, 0.12), horn='BONE',
                       wing=(0.3, 0.07, 0.07), wing_top=(0.48, 0.14, 0.1), glow='LAVA'),
    'enemy_bulwark': dict(scale=1.45, body=(0.19, 0.17, 0.26), dark=(0.09, 0.08, 0.13), eye='EYE_RED', plate=(0.5, 0.5, 0.56),
                          rim=(0.82, 0.76, 0.6), boss='GOLD', abdomen=(0.6, 0.66, 0.48), head=(0.38, 0.33, 0.3),
                          leg_reach=0.8, leg_rise=0.9, leg_r=0.13),
    'enemy_gloommoth': dict(scale=0.95, body=(0.2, 0.18, 0.28), fur=(0.42, 0.38, 0.5), wing=(0.24, 0.2, 0.36), wing_top=(0.4, 0.34, 0.54),
                            vein=(0.12, 0.1, 0.2), eye=(0.9, 0.45, 1.6), spot=(0.75, 0.4, 1.4)),
    'boss_ashen_warden': dict(scale=1.0, body=(0.2, 0.1, 0.1), dark=(0.1, 0.05, 0.06), plate=(0.36, 0.32, 0.32), rim=(0.55, 0.48, 0.44),
                              tusk='BONE', horn='EMBER', core='LAVA'),
})


def _slab(a, pts, t, c, **k):
    """Flat polygon (Blender XYZ points, roughly planar, any winding) extruded by thickness t along its normal.
    Used for wings and shield faces: single-sided materials need real thickness to read from both sides."""
    bm = a.bm
    P0 = [Vector(p) for p in pts]
    cen = sum(P0, Vector()) / len(P0)
    nrm = Vector()
    for i in range(len(P0)):
        nrm += (P0[i] - cen).cross(P0[(i + 1) % len(P0)] - cen)
    nrm = nrm.normalized() if nrm.length > 1e-9 else Vector((0, 0, 1))
    top = [bm.verts.new(p + nrm * t * 0.5) for p in P0]
    bot = [bm.verts.new(p - nrm * t * 0.5) for p in P0]
    bm.faces.new(top)
    bm.faces.new(bot[::-1])
    n = len(P0)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((bot[i], bot[j], top[j], top[i]))
    return a._tag(top + bot, c, **k)


def _curve(p0, p1, p2, n):
    """Quadratic Bezier points (for wing edges, tails and horns)."""
    p0, p1, p2 = Vector(p0), Vector(p1), Vector(p2)
    return [p0 * (1 - u) ** 2 + p1 * 2 * u * (1 - u) + p2 * u * u for u in (i / (n - 1) for i in range(n))]


def build_boss_drake():
    o = P['boss_drake']
    a = Asset('boss_drake', seed=80)
    body, dark, belly, glow = col(o['body']), col(o['dark']), col(o['belly']), col(o['glow'])
    bone, horn_tip = col(o['horn'], 0.8), col('EMBER', 1.0)
    top = col(o['body'], 1.9)
    HP = (0, -1.35, 2.75)
    head = dict(j=J_HEAD, pv=HP)
    # torso: deep chest in front, haunch behind; a lava-lit belly underneath
    a.ico((0, -0.2, 2.0), (1.15, 1.55, 0.95), body, sub=3, disp=(0.07, 1.6, 11), top=top, topk=0.5, under=0.75)
    a.ico((0, -1.0, 2.25), (0.95, 0.85, 0.85), body, sub=2, disp=(0.05, 2.0, 12), top=top, topk=0.5)
    a.ico((0, 1.05, 1.95), (0.92, 0.85, 0.78), body, sub=2, disp=(0.05, 2.0, 13), top=top, topk=0.5)
    for k in range(6):  # belly scutes, glowing between
        y = -1.2 + k * 0.42
        a.ico((0, y, 1.22 - abs(k - 2.5) * 0.04), (0.62 - abs(k - 2.5) * 0.05, 0.2, 0.09), belly, sub=1, jit=0.04)
        a.ico((0, y + 0.21, 1.18), (0.4, 0.05, 0.05), glow, sub=1, em=1, jit=0)
    # chest furnace: the drake's weak glow, visible from the front camera
    a.ico((0, -1.72, 2.05), (0.42, 0.22, 0.4), glow, sub=2, em=1, jit=0)
    # spine: spikes from neck to tail, ember-tipped
    for k in range(9):
        y = -1.3 + k * 0.38
        z = 2.95 - abs(k - 2.5) * 0.09
        h = 0.55 - abs(k - 2) * 0.04
        a.cone((0, y, z + h * 0.35), 0.17, 0.0, h, dark, seg=4, rot=(0.55, 0, 0))
        a.cone((0, y + 0.1, z + h * 0.62), 0.05, 0.0, h * 0.35, glow, seg=4, rot=(0.55, 0, 0), em=0.8, jit=0)
    # neck and head (joint 8): long horned skull, glowing eyes and nostrils, jaw with fangs
    a.limb((0, -1.25, 2.6), (0, -2.0, 3.35), 0.62, 0.42, body, seg=8, top=top, topk=0.45, **head)
    for k in range(3):
        a.ico((0, -1.45 - k * 0.25, 2.55 + k * 0.28), (0.4 - k * 0.04, 0.2, 0.12), belly, sub=1, jit=0.04, **head)  # throat plates
    a.ico((0, -2.35, 3.55), (0.52, 0.72, 0.44), body, sub=2, top=top, topk=0.5, **head)
    a.ico((0, -2.95, 3.42), (0.36, 0.55, 0.28), body, sub=2, top=top, topk=0.5, **head)  # snout
    a.ico((0, -2.85, 3.12), (0.34, 0.6, 0.16), dark, sub=2, **head)  # jaw
    for sd in (-1, 1):
        a.ico((sd * 0.3, -2.55, 3.78), (0.14, 0.09, 0.07), (0.02, 0.01, 0.01), sub=1, jit=0, **head)  # brow socket
        a.ico((sd * 0.3, -2.62, 3.78), (0.11, 0.06, 0.06), col('EMBER', 1.2), sub=1, em=1, jit=0, **head)  # eye
        a.limb((sd * 0.12, -2.45, 3.92), (sd * 0.42, -2.25, 3.98), 0.1, 0.05, dark, seg=5, **head)  # brow ridge
        a.ico((sd * 0.12, -3.42, 3.5), (0.06, 0.05, 0.05), glow, sub=1, em=1, jit=0, **head)  # nostrils
        for f in range(3):  # fangs
            a.cone((sd * (0.14 + f * 0.06), -3.2 + f * 0.18, 3.08), 0.04, 0.0, 0.2, col('BONE', 0.9), seg=4, rot=(math.pi, 0, 0), **head)
        # swept-back horns: bone at the root, burning at the tips
        hp = _curve((sd * 0.28, -2.2, 3.9), (sd * 0.75, -1.9, 4.5), (sd * 0.85, -1.0, 4.75), 5)
        rads = (0.17, 0.13, 0.09, 0.05, 0.0)
        for i in range(4):
            a.limb(hp[i], hp[i + 1], rads[i], rads[i + 1], bone if i < 2 else horn_tip, seg=6, em=0 if i < 2 else 0.7, jit=0.04, top=col('BONE') if i < 2 else None, topk=0.4, **head)
        a.limb((sd * 0.38, -2.0, 3.65), (sd * 0.72, -1.75, 3.9), 0.08, 0.0, bone, seg=4, **head)  # small cheek horns
        for f in range(3):  # jaw frills
            a.cone((sd * 0.45, -2.4 + f * 0.22, 3.35), 0.07, 0.0, 0.32, dark, seg=4, rot=(0, sd * 1.3, 0), **head)
    # wings (joint 10, pivot at the shoulder): arm bone, three fingers, membrane slabs between them
    for sd in (-1, 1):
        sh = Vector((sd * 0.75, -0.75, 2.75))
        wk = dict(j=J_WING, pv=tuple(sh))
        sp = o['span']  # wingspan factor: keeps the boss readable at gameplay distance
        elbow = Vector((sd * 2.1 * sp, -0.35, 3.75))
        wrist = Vector((sd * 3.2 * sp, 0.2, 3.55))
        tips = [Vector((sd * 4.3 * sp, -0.1, 3.2)), Vector((sd * 3.9 * sp, 1.1, 2.55)), Vector((sd * 2.9 * sp, 1.75, 2.2))]
        a.limb(sh, elbow, 0.2, 0.15, dark, seg=6, **wk)
        a.ico(elbow, (0.17,) * 3, dark, sub=1, **wk)
        a.limb(elbow, wrist, 0.15, 0.1, dark, seg=6, **wk)
        a.cone(wrist + Vector((0, -0.12, 0.18)), 0.07, 0.0, 0.35, bone, seg=4, rot=(-0.6, sd * 0.4, 0), **wk)  # thumb claw
        for t in tips:
            a.limb(wrist, t, 0.08, 0.025, dark, seg=5, **wk)
        root = Vector((sd * 0.6, 0.9, 2.45))
        ring = [sh, elbow, wrist, tips[0], tips[1], tips[2], root]
        mem = col(o['wing']); memt = col(o['wing_top'])
        for i in range(len(ring) - 4):
            pass
        # membrane panels (wrist fan + inner panel), slightly sagging toward the trailing edge
        panels = [(wrist, tips[0], (tips[0] + tips[1]) / 2 + Vector((0, 0, -0.1)), tips[1]),
                  (wrist, tips[1], (tips[1] + tips[2]) / 2 + Vector((0, 0, -0.15)), tips[2]),
                  (sh, elbow, wrist, tips[2], (tips[2] + root) / 2 + Vector((0, 0, -0.2)), root)]
        for pts in panels:
            _slab(a, [tuple(p) for p in pts], 0.06, mem, top=memt, topk=0.6, under=0.8, jit=0.05, **wk)
        for t in tips:  # glowing ember edge spots on the finger tips
            a.ico(t, (0.08,) * 3, glow, sub=1, em=0.9, jit=0, **wk)
    # legs (joints 1/2 trot): thick thighs, clawed feet
    for sd in (-1, 1):
        for front in (True, False):
            y = -0.95 if front else 1.15
            jn = (J_LEG_L if sd < 0 else J_LEG_R) if front else (J_LEG_L if sd > 0 else J_LEG_R)
            lk = dict(j=jn, pv=(sd * 0.75, y, 1.75))
            knee = Vector((sd * 0.95, y - 0.15 if front else y + 0.35, 0.95))
            a.limb((sd * 0.75, y, 1.9), knee, 0.48, 0.28, body, seg=7, top=top, topk=0.4, **lk)
            a.ico(knee, (0.3,) * 3, body, sub=1, **lk)
            foot = Vector((sd * 0.95, y - 0.12, 0.2))
            a.limb(knee, foot, 0.26, 0.2, dark, seg=6, **lk)
            a.ico(foot, (0.3, 0.36, 0.2), dark, sub=1, **lk)
            for c in (-1, 0, 1):  # claws
                a.cone((sd * 0.95 + c * 0.14, y - 0.48, 0.12), 0.06, 0.0, 0.3, col('BONE', 0.85), seg=4, rot=(math.pi / 2 + 0.2, 0, c * 0.25), **lk)
    # tail: tapering S-curve with a spade tip
    tp = _curve((0, 1.6, 1.95), (0.1, 3.0, 1.55), (0.9, 4.1, 0.75), 7)
    for i in range(len(tp) - 1):
        r0, r1 = 0.5 * (1 - i / 7) + 0.06, 0.5 * (1 - (i + 1) / 7) + 0.06
        a.limb(tp[i], tp[i + 1], r0, r1, body, seg=6, top=top, topk=0.4)
        a.cone(tp[i] + Vector((0, 0, r0 * 0.9)), 0.08, 0.0, 0.3 - i * 0.03, dark, seg=4, rot=(0.6, 0, 0))
    end = tp[-1]
    _slab(a, [tuple(end + Vector(v)) for v in ((0, 0, 0), (0.45, 0.35, 0.05), (0.15, 0.95, 0.0), (-0.3, 0.45, 0.05))], 0.08, dark, top=col(o['body'], 1.5), topk=0.5)
    a.ico(end + Vector((0.12, 0.45, 0.06)), (0.09,) * 3, glow, sub=1, em=0.9, jit=0)
    return a.finish(o['scale'])


def build_enemy_bulwark():
    o = P['enemy_bulwark']
    a = Asset('enemy_bulwark', seed=62)
    body, dark, plate, rim = col(o['body']), col(o['dark']), col(o['plate']), col(o['rim'])
    _spider_body(a, o, body, col(o['body'], 0.8), col(o['eye']), seed=7)
    # curved tower shield carried in front: arched staves, a bone rim, gold boss and rivets, a spiked crest
    n, rad, cy, z0, z1 = 7, 0.95, -0.15, 0.32, 1.32
    span = 1.35
    for i in range(n):
        a0 = -span / 2 + span * i / n; a1 = -span / 2 + span * (i + 1) / n
        p = lambda ang, z: (math.sin(ang) * rad, cy - math.cos(ang) * rad, z)
        h_off = 0.06 * math.cos((a0 + a1) / 2 * 2.2)  # the middle staves stand a little taller
        stave = plate if i % 2 else col(o['plate'], 0.85)
        _slab(a, [p(a0, z0), p(a1, z0), p(a1, z1 + h_off), p(a0, z1 + h_off)], 0.09, stave, top=col(o['plate'], 1.3), topk=0.4, jit=0.03)
    for zz in (z0 + 0.04, z1 + 0.04):  # bone rim along top and bottom
        rp = [Vector((math.sin(-span / 2 + span * k / 8) * (rad + 0.05), cy - math.cos(-span / 2 + span * k / 8) * (rad + 0.05), zz)) for k in range(9)]
        for k in range(8):
            a.limb(rp[k], rp[k + 1], 0.055, 0.055, rim, seg=5, top=col('BONE'), topk=0.4)
    for sd in (-1, 1):  # side rims
        ang = sd * span / 2
        a.limb((math.sin(ang) * (rad + 0.05), cy - math.cos(ang) * (rad + 0.05), z0), (math.sin(ang) * (rad + 0.05), cy - math.cos(ang) * (rad + 0.05), z1 + 0.04), 0.06, 0.06, rim, seg=5)
    a.ico((0, cy - rad - 0.1, (z0 + z1) / 2 + 0.05), (0.2, 0.12, 0.2), col(o['boss']), sub=2, top=col('GOLD', 1.2), topk=0.5)  # gold boss
    a.ico((0, cy - rad - 0.2, (z0 + z1) / 2 + 0.05), (0.06, 0.05, 0.06), col('EYE_RED'), sub=1, em=0.8, jit=0)  # ember gem in the boss
    for k in range(5):  # rivets
        ang = -span / 2 + span * (k + 0.5) / 5
        for zz in (z0 + 0.16, z1 - 0.1):
            a.ico((math.sin(ang) * (rad + 0.07), cy - math.cos(ang) * (rad + 0.07), zz), (0.035,) * 3, rim, sub=1, jit=0)
    for k in range(3):  # crest spikes along the top edge
        ang = (k - 1) * 0.45
        a.cone((math.sin(ang) * rad, cy - math.cos(ang) * rad, z1 + 0.22), 0.06, 0.0, 0.3, col('BONE', 0.85), seg=4)
    for i, y in enumerate((-0.05, 0.3, 0.65)):  # back plates
        a.ico((0, y, 1.1 - abs(i - 1) * 0.06), (0.4 - i * 0.03, 0.26, 0.1), col(o['plate'], 0.6), sub=1, top=col(o['plate'], 0.9), topk=0.5)
    spider_legs(a, o, o['leg_reach'], o['leg_rise'], o['leg_r'], dark, hip_x=0.36, knee_ball=False)
    return a.finish(o['scale'])


def build_enemy_gloommoth():
    o = P['enemy_gloommoth']
    a = Asset('enemy_gloommoth', seed=64)
    body, fur, wing, wtop, vein, eye, spot = (col(o['body']), col(o['fur']), col(o['wing']), col(o['wing_top']), col(o['vein']), col(o['eye']), col(o['spot']))
    k = dict(j=J_SWAY, pv=(0, 0, 1.0))
    # fuzzy round thorax with a fur collar, banded tapering abdomen behind
    a.ico((0, -0.05, 1.0), (0.3, 0.34, 0.3), body, sub=2, disp=(0.06, 5.0, 3), top=fur, topk=0.6, **k)
    for i in range(10):  # fur collar tufts
        ang = i / 10 * math.tau
        a.cone((math.cos(ang) * 0.24, -0.3 + math.sin(ang) * 0.1, 1.05 + math.sin(ang) * 0.08), 0.07, 0.0, 0.18, fur, seg=4,
               rot=(math.pi / 2 + math.sin(ang) * 0.6, math.cos(ang) * 0.9, 0), **k)
    for i in range(4):  # abdomen segments
        s = 0.26 - i * 0.045
        a.ico((0, 0.32 + i * 0.2, 0.95 - i * 0.05), (s, 0.14, s * 0.9), fur if i % 2 else body, sub=2, **k)
    a.ico((0, -0.38, 1.02), (0.2, 0.17, 0.19), body, sub=2, top=fur, topk=0.5, **k)  # head
    for sd in (-1, 1):
        a.ico((sd * 0.13, -0.48, 1.06), (0.1, 0.08, 0.1), eye, sub=2, em=1, jit=0, **k)
        # feathery antennae: a curved stalk with comb barbs
        st = _curve((sd * 0.06, -0.5, 1.15), (sd * 0.2, -0.75, 1.45), (sd * 0.42, -0.72, 1.62), 5)
        for i in range(4):
            a.limb(st[i], st[i + 1], 0.025, 0.018, fur, seg=3, **k)
            for side in (-1, 1):
                d = (st[i + 1] - st[i]).normalized()
                perp = d.cross(Vector((0, 0, 1))).normalized() * side
                a.limb(st[i + 1], st[i + 1] + perp * 0.11 + Vector((0, 0, 0.02)), 0.012, 0.004, fur, seg=3, **k)
        # forewings: broad, swept back like a delta (not spread like a bat), rounded trailing edge
        root_f, root_b = Vector((sd * 0.22, -0.25, 1.08)), Vector((sd * 0.2, 0.25, 1.05))
        lead = _curve(root_f, (sd * 0.8, -0.45, 1.22), (sd * 1.35, -0.05, 1.18), 5)
        trail = _curve((sd * 1.35, -0.05, 1.18), (sd * 1.15, 0.55, 1.1), (sd * 0.55, 0.65, 1.06), 4)
        _slab(a, [tuple(p) for p in lead + trail[1:] + [root_b]], 0.045, wing, top=wtop, topk=0.65, under=0.7, jit=0.05, **k)
        # hindwings: smaller and rounder, tucked under the trailing edge
        hw = _curve((sd * 0.18, 0.2, 1.0), (sd * 0.95, 0.5, 0.98), (sd * 0.7, 1.0, 0.95), 5) + [Vector((sd * 0.25, 0.7, 0.98))]
        _slab(a, [tuple(p) for p in hw], 0.04, col(o['wing'], 0.8), top=col(o['wing_top'], 0.85), topk=0.5, jit=0.05, **k)
        # eye-spot pattern on the forewing (concentric, glowing core) and dark veins
        c = Vector((sd * 0.86, 0.12, 1.18))
        a.ico(c, (0.2, 0.17, 0.02), vein, sub=2, jit=0, **k)
        a.ico(c + Vector((0, 0, 0.01)), (0.13, 0.11, 0.02), spot, sub=2, em=0.75, jit=0, **k)
        a.ico(c + Vector((0, 0, 0.02)), (0.05, 0.045, 0.02), (0.05, 0.03, 0.08), sub=1, jit=0, **k)
        for v in ((0.6, -0.25), (1.1, -0.05), (1.0, 0.45)):
            a.limb(root_f + Vector((0, 0.1, 0.03)), (sd * v[0], v[1], 1.19), 0.016, 0.01, vein, seg=3, **k)
        for i in range(3):  # dangling legs
            a.limb((sd * 0.12, -0.2 + i * 0.16, 0.85), (sd * 0.24, -0.25 + i * 0.18, 0.5), 0.025, 0.012, body, seg=3, **k)
    return a.finish(o['scale'])


def build_boss_ashen_warden():
    o = P['boss_ashen_warden']
    a = Asset('boss_ashen_warden', seed=70)
    body, dark, plate, rim, core = col(o['body']), col(o['dark']), col(o['plate']), col(o['rim']), col(o['core'])
    top = col(o['body'], 1.9)
    HP = (0, -1.5, 2.3)
    head = dict(j=J_HEAD, pv=HP)
    # hulking ash-boar: humped shoulders, slab torso
    a.ico((0, 0.15, 2.0), (1.15, 1.7, 0.95), body, sub=3, disp=(0.09, 1.4, 4), top=top, topk=0.45, under=0.7)
    a.ico((0, -0.85, 2.55), (1.1, 0.95, 1.0), body, sub=3, disp=(0.07, 2.0, 5), top=top, topk=0.45)   # shoulder hump
    a.ico((0, 1.25, 2.05), (0.95, 0.8, 0.8), body, sub=2, disp=(0.05, 2.0, 6), top=top, topk=0.45)
    # layered armour: overlapping plates with a lighter rim and rivets, a molten seam between each
    for i, y in enumerate((-1.05, -0.45, 0.15, 0.75, 1.3)):
        z = 3.08 - abs(i - 1.2) * 0.14
        w = 0.78 - abs(i - 1.2) * 0.07
        a.ico((0, y, z), (w, 0.36, 0.13), plate, sub=2, top=col(o['plate'], 1.5), topk=0.55, rot=(0.18, 0, 0))
        a.ico((0, y - 0.3, z - 0.02), (w * 0.92, 0.06, 0.07), rim, sub=1, jit=0.03, rot=(0.18, 0, 0))
        a.ico((0, y + 0.3, z - 0.08), (w * 0.7, 0.05, 0.04), core, sub=1, em=0.9, jit=0)
        for sd in (-1, 1):
            a.ico((sd * w * 0.75, y - 0.12, z + 0.06), (0.05,) * 3, rim, sub=1, jit=0)
    # mane of ember spikes along neck and shoulders
    rng = random.Random(71)
    for i in range(11):
        ang = (i / 10 - 0.5) * 2.2
        y = -1.25 + abs(ang) * 0.25
        z = 3.2 - abs(ang) * 0.35
        h = 0.75 - abs(ang) * 0.2 + rng.uniform(-0.05, 0.05)
        a.cone((math.sin(ang) * 0.75, y, z + h * 0.3), 0.12, 0.0, h, dark, seg=4, rot=(0.65, math.sin(ang) * 0.5, 0))
        a.cone((math.sin(ang) * 0.78, y + 0.12, z + h * 0.62), 0.05, 0.0, h * 0.4, col('EMBER'), seg=4, rot=(0.65, math.sin(ang) * 0.5, 0), em=0.85, jit=0)
    for i in range(18):  # lava cracks on the flanks
        x = rng.choice((-1, 1)) * rng.uniform(0.6, 1.05)
        y = rng.uniform(-1.3, 1.6)
        a.ico((x, y, 1.75 + rng.uniform(-0.25, 0.35)), (0.035, 0.22, 0.03), core, sub=1, em=0.9, jit=0, rot=(rng.uniform(-0.6, 0.6), 0, rng.uniform(-0.4, 0.4)))
    a.ico((0, -1.78, 2.15), (0.52, 0.3, 0.52), core, sub=2, em=1, jit=0)  # chest forge
    for sd in (-1, 1):  # forge cage bars
        a.limb((sd * 0.45, -1.85, 2.55), (sd * 0.5, -1.95, 1.75), 0.07, 0.06, rim, seg=5)
    a.limb((0, -1.95, 2.6), (0, -2.0, 1.7), 0.07, 0.06, rim, seg=5)
    # head (joint 8): heavy brow, flared snout disc, open jaw, curling tusks, burning horns
    a.limb((0, -1.3, 2.45), (0, -1.95, 2.55), 0.75, 0.6, body, seg=8, top=top, topk=0.45, **head)
    a.ico((0, -2.3, 2.6), (0.68, 0.72, 0.6), body, sub=3, top=top, topk=0.45, **head)
    a.ico((0, -2.45, 3.0), (0.62, 0.4, 0.2), plate, sub=2, top=col(o['plate'], 1.4), topk=0.5, **head)  # brow plate
    a.ico((0, -2.95, 2.45), (0.42, 0.4, 0.34), body, sub=2, **head)   # muzzle
    a.cone((0, -3.28, 2.42), 0.36, 0.33, 0.14, dark, seg=8, rot=(math.pi / 2, 0, 0), **head)  # snout disc
    for sd in (-1, 1):
        a.ico((sd * 0.12, -3.36, 2.44), (0.07, 0.04, 0.09), core, sub=1, em=0.9, jit=0, **head)   # glowing nostrils
        a.ico((sd * 0.3, -2.72, 2.85), (0.12, 0.07, 0.08), (0.02, 0.01, 0.01), sub=1, jit=0, **head)  # sockets
        a.ico((sd * 0.3, -2.77, 2.85), (0.09, 0.05, 0.06), col('EMBER', 1.2), sub=1, em=1, jit=0, **head)  # eyes
        tk = _curve((sd * 0.3, -3.05, 2.25), (sd * 0.75, -3.35, 2.25), (sd * 0.6, -3.5, 2.95), 5)
        for i in range(4):
            a.limb(tk[i], tk[i + 1], 0.13 * (1 - i / 4) + 0.02, 0.13 * (1 - (i + 1) / 4) + 0.01, col(o['tusk'], 0.9), seg=6, top=col(o['tusk']), topk=0.5, **head)
        hr = _curve((sd * 0.4, -2.25, 3.05), (sd * 1.0, -2.25, 3.55), (sd * 0.8, -1.8, 4.3), 5)
        for i in range(4):
            a.limb(hr[i], hr[i + 1], 0.16 * (1 - i / 4) + 0.02, 0.16 * (1 - (i + 1) / 4) + 0.01, col(o['horn'], 0.9 if i < 2 else 1.1), seg=6, em=0.5 + i * 0.12, jit=0.04, **head)
        a.cone((sd * 0.78, -2.05, 2.95), 0.12, 0.0, 0.45, dark, seg=4, rot=(0, sd * 1.2, 0), scl=(1, 0.5, 1), **head)  # ears
    a.ico((0, -2.85, 2.12), (0.36, 0.42, 0.12), dark, sub=2, **head)   # lower jaw
    # legs (joints 1/2): armoured pillars with knee plates and split hooves
    for sd in (-1, 1):
        for front in (True, False):
            y = -1.0 if front else 1.2
            jn = (J_LEG_L if sd < 0 else J_LEG_R) if front else (J_LEG_L if sd > 0 else J_LEG_R)
            lk = dict(j=jn, pv=(sd * 0.75, y, 1.8))
            knee = Vector((sd * 0.82, y - 0.05 if front else y + 0.3, 0.95))
            a.limb((sd * 0.75, y, 1.95), knee, 0.52, 0.32, body, seg=7, top=top, topk=0.4, **lk)
            a.ico(knee + Vector((0, -0.12, 0.05)), (0.34, 0.24, 0.3), plate, sub=2, top=col(o['plate'], 1.4), topk=0.5, **lk)
            a.limb(knee, (sd * 0.82, y, 0.28), 0.3, 0.2, dark, seg=6, **lk)
            for hs in (-1, 1):
                a.cone((sd * 0.82 + hs * 0.1, y - 0.04, 0.12), 0.14, 0.11, 0.26, col('BONE', 0.4), seg=5, **lk)
    tl = _curve((0, 1.95, 2.3), (0.1, 2.5, 2.0), (0.3, 2.7, 1.4), 4)  # stub tail with an ember tuft
    for i in range(3):
        a.limb(tl[i], tl[i + 1], 0.2 - i * 0.05, 0.15 - i * 0.05, dark, seg=5)
    a.cone(tl[-1], 0.12, 0.0, 0.35, col('EMBER'), seg=4, em=0.8, jit=0, rot=(math.pi, 0, 0))
    return a.finish(o['scale'])


ASSETS.update({
    'boss_drake': build_boss_drake, 'enemy_bulwark': build_enemy_bulwark,
    'enemy_gloommoth': build_enemy_gloommoth, 'boss_ashen_warden': build_boss_ashen_warden,
})


# ---------------------------------------------------------------- export, previews, save
def export(ob):
    os.makedirs(RAW_DIR, exist_ok=True)
    path = os.path.join(RAW_DIR, ob.name + '.glb')
    clear_previews()
    vl = bpy.context.view_layer
    for o in vl.objects:
        o.select_set(False)
    ob.select_set(True)
    vl.objects.active = ob
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_yup=True, export_apply=True,
                              export_attributes=True, export_vertex_color='ACTIVE', export_all_vertex_colors=False,
                              export_normals=True, export_texcoords=False, export_materials='NONE',
                              export_animations=False, export_skins=False, export_morph=False)
    return path


def clear_previews():
    sc = bpy.data.scenes.get('Preview')
    if sc:
        for o in list(sc.collection.objects):
            d = o.data
            bpy.data.objects.remove(o, do_unlink=True)
            if isinstance(d, bpy.types.Camera) and d.users == 0:
                bpy.data.cameras.remove(d)
    for m in [m for m in bpy.data.meshes if m.name.startswith('pground') and m.users == 0]:
        bpy.data.meshes.remove(m)


def _prev_scene():
    sc = bpy.data.scenes.get('Preview') or bpy.data.scenes.new('Preview')
    clear_previews()
    sc.render.engine = 'BLENDER_WORKBENCH'
    sh = sc.display.shading
    sh.light, sh.color_type, sh.show_cavity, sh.show_object_outline = 'STUDIO', 'VERTEX', False, False
    sc.render.film_transparent = False
    if not sc.world:
        sc.world = bpy.data.worlds.new('PreviewWorld')
    sc.world.color = (0.16, 0.17, 0.2)
    sc.render.image_settings.file_format = 'PNG'
    sc.render.resolution_percentage = 100
    return sc


def _cam(sc, loc, target, ortho=None, fov=45):
    cd = bpy.data.cameras.new('pcam')
    if ortho:
        cd.type, cd.ortho_scale = 'ORTHO', ortho
    else:
        cd.sensor_fit, cd.angle = 'VERTICAL', math.radians(fov)
    co = bpy.data.objects.new('pcam', cd)
    sc.collection.objects.link(co)
    co.location = loc
    co.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    sc.camera = co
    return co


def _ground(sc, size=12, c=(0.14, 0.3, 0.18)):
    me = bpy.data.meshes.new('pground')
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=size)
    lc = bm.loops.layers.float_color.new('Col')
    for f in bm.faces:
        for l in f.loops:
            l[lc] = (*c, 1)
    bm.to_mesh(me); bm.free()
    me.color_attributes.active_color = me.color_attributes['Col']
    g =bpy.data.objects.new('pground', me)
    sc.collection.objects.link(g)


def preview(ob):
    """Two images per asset: front/side/three-quarter sheet, and the real game camera (16.4 m, 53 deg down, FOV 45)."""
    os.makedirs(PREV_DIR, exist_ok=True)
    sc = _prev_scene()
    w = max(ob.dimensions.x, ob.dimensions.y, ob.dimensions.z)
    for i, rz in enumerate((0.0, math.pi / 2, math.pi / 4)):
        d = ob.copy(); d.location = ((i - 1) * w * 1.25, 0, 0); d.rotation_euler = (0, 0, rz); sc.collection.objects.link(d)
    _cam(sc, (0, -w * 6, ob.dimensions.z * 0.5 + w * 1.1), (0, 0, ob.dimensions.z * 0.45), ortho=w * 3.9)
    sc.render.resolution_x, sc.render.resolution_y = 720, 260
    sc.render.use_border = False
    sc.render.filepath = os.path.join(PREV_DIR, ob.name + '_views.png')
    bpy.ops.render.render(write_still=True, scene=sc.name)
    # game camera: 3 copies facing different ways, real on-screen size at 1280x720 (crop of the centre)
    _prev_scene()
    _ground(sc)
    sp = max(1.6, w * 1.2)
    for i, rz in enumerate((0.0, 2.4, -0.9)):
        d = ob.copy(); d.location = ((i - 1) * sp, 0, 0); d.rotation_euler = (0, 0, rz); sc.collection.objects.link(d)
    _cam(sc, (0, -9.8, 13.2), (0, 0.8, 0), fov=45)
    sc.render.resolution_x, sc.render.resolution_y = 1280, 720
    sc.render.use_border, sc.render.use_crop_to_border = True, True
    sc.render.border_min_x, sc.render.border_max_x, sc.render.border_min_y, sc.render.border_max_y = 0.3, 0.7, 0.3, 0.7
    sc.render.filepath = os.path.join(PREV_DIR, ob.name + '_game.png')
    bpy.ops.render.render(write_still=True, scene=sc.name)
    sc.render.use_border = False


def contact_sheet(names, kind='views', out='sheet.png', cols=1, scale=1.0):
    """Stack existing preview PNGs into one image (cheap to review)."""
    import numpy as np
    imgs = []
    for n in names:
        im = bpy.data.images.load(os.path.join(PREV_DIR, f'{n}_{kind}.png'), check_existing=False)
        if scale != 1.0:
            im.scale(int(im.size[0] * scale), int(im.size[1] * scale))
        w, h = im.size
        imgs.append(np.array(im.pixels[:], dtype=np.float32).reshape(h, w, 4))
        bpy.data.images.remove(im)
    h, w = imgs[0].shape[:2]
    rows = (len(imgs) + cols - 1) // cols
    sheet = np.zeros((rows * h, cols * w, 4), dtype=np.float32); sheet[..., 3] = 1
    for i, a in enumerate(imgs):
        r, c = i // cols, i % cols
        sheet[(rows - 1 - r) * h:(rows - r) * h, c * w:(c + 1) * w] = a  # Blender images are bottom-up
    im = bpy.data.images.new('sheet', cols * w, rows * h)
    im.pixels = sheet.ravel()
    im.filepath_raw = os.path.join(PREV_DIR, out); im.file_format = 'PNG'; im.save()
    bpy.data.images.remove(im)


def save_blend():
    os.makedirs(os.path.dirname(BLEND), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=BLEND)


def build(names=None, export_glb=True, previews=False, save=True):
    report = {}
    for n in (names or list(ASSETS)):
        ob = ASSETS[n]()
        report[n] = {'tris': tris(ob), 'dims': [round(x, 2) for x in ob.dimensions]}
        if export_glb:
            export(ob)
        if previews:
            preview(ob)
    if save:
        save_blend()
    return report


if __name__ == '__main__':
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    only = argv[argv.index('--only') + 1].split(',') if '--only' in argv else None
    print(build(only, export_glb='--no-export' not in argv, previews='--previews' in argv))
