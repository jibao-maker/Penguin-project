import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';

//Create new three.js scene, camera
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xbfe8ff);

const camera = new THREE.PerspectiveCamera(
    50, window.innerWidth / window.innerHeight, 0.1, 1000
);
camera.position.set(0, 9, 23);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enabled = false;
function translationMatrix(tx, ty, tz) {
    return new THREE.Matrix4().set(
        1, 0, 0, tx,
        0, 1, 0, ty,
        0, 0, 1, tz,
        0, 0, 0, 1
    );
}


//scene environment
scene.add(new THREE.AmbientLight(0xffffff, 1.2));

const sunlight = new THREE.DirectionalLight(0xffffff, 2);
sunlight.position.set(-8, 20, 10);
scene.add(sunlight);
const snowMaterial = new THREE.MeshPhongMaterial({ color: 0xf7fbff });
const iceMaterial = new THREE.MeshPhongMaterial({
    color: 0x2a9fd6,
    shininess: 100
});

const snow = new THREE.Mesh(new THREE.PlaneGeometry(400, 400, 100, 100), snowMaterial);
snow.rotation.x = -Math.PI / 2;
snow.position.set(0, -0.13, -30);
scene.add(snow);

//Track: a random closed loop
const track_width = 16;

//Re-roll check: no sharp kinks, doesn't run into itself, and switches between left and right turns enough to be interesting
function trackIsGood(curve) {
    const n = 200;
    const gap = curve.getLength() / n;
    const pts = curve.getSpacedPoints(n);
    pts.pop();

    let side = 0, turned = 0, switches = 0;
    for (let i = 0; i < n; i++) {
        const a = pts[(i + 1) % n].clone().sub(pts[i]);
        const b = pts[(i + 2) % n].clone().sub(pts[(i + 1) % n]);
        const angle = Math.atan2(a.x * b.z - a.z * b.x, a.dot(b));   // signed turn at this point
        if (Math.abs(angle) * 11 > gap) return false;                  // tighter than radius 11
        turned += angle;
        if (Math.abs(turned) > 0.35) {
            if (side && Math.sign(turned) !== side) switches++;
            side = Math.sign(turned);
            turned = 0;
        }
    }
    if (switches < 4) return false;

    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            const apart = Math.min(j - i, n - (j - i)) * gap;
            if (apart > track_width * 3 && pts[i].distanceTo(pts[j]) < track_width * 1.2) return false;
        }
    }
    return true;
}

//Convex outline of a set of points (keeps only the outermost ones)
function convexHull(pts) {
    const p = [...pts].sort((a, b) => a.x - b.x || a.z - b.z);
    const cross = (o, a, b) => (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
    const lower = [], upper = [];
    for (const q of p) {
        while (lower.length > 1 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
        lower.push(q);
    }
    for (const q of [...p].reverse()) {
        while (upper.length > 1 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
        upper.push(q);
    }
    lower.pop(); upper.pop();
    return lower.concat(upper);
}

//Scatter random points, take their outline, then shove the middle of every edge in or out by a random
//amount. That's what makes the hairpins and chicanes. Re-rolled until trackIsGood passes.
function makeTrackCurve() {
    while (true) {
        const scatter = [];
        for (let i = 0; i < 16; i++) scatter.push(new THREE.Vector3(rng(-85, 85), 0, rng(-85, 85)));

        const hull = convexHull(scatter);
        const points = [];
        for (let i = 0; i < hull.length; i++) {
            const a = hull[i], b = hull[(i + 1) % hull.length];
            const edge = b.clone().sub(a);
            const normal = new THREE.Vector3(-edge.z, 0, edge.x).normalize();
            const mid = a.clone().add(b).multiplyScalar(0.5).addScaledVector(normal, rng(-0.5, 0.5) * edge.length());
            points.push(a, mid);
        }

        //push apart any points that ended up too close together
        for (let k = 0; k < 4; k++) {
            for (let i = 0; i < points.length; i++) {
                for (let j = i + 1; j < points.length; j++) {
                    const gap = points[j].clone().sub(points[i]);
                    if (gap.length() < 24) {
                        gap.setLength((24 - gap.length()) / 2);
                        points[j].add(gap);
                        points[i].sub(gap);
                    }
                }
            }
        }

        const curve = new THREE.CatmullRomCurve3(points, true);
        if (trackIsGood(curve)) return curve;
    }
}

const track_curve = makeTrackCurve();
const track_length = track_curve.getLength();

//Hills and dips: a few random waves that each repeat a whole number of times per lap.
//Every wave is (cos - 1), so the start line is always flat at height 0.
const waves = [];
for (let k = 0; k < 4; k++) {
    const freq = 1 + Math.floor(Math.random() * 6);   // bigger waves are the slow ones, small bumps the fast ones
    waves.push({ freq, amp: rng(10, 20) / freq * (Math.random() < 0.5 ? -1 : 1) });
}
let heightScale = 1;
function trackHeight(u) {
    let h = 0;
    for (const w of waves) h += w.amp * (Math.cos(2 * Math.PI * w.freq * u) - 1);
    return h * heightScale;
}
//flatten everything if the steepest part would be too steep to drive
let steepest = 0;
for (let i = 0; i < 400; i++) {
    steepest = Math.max(steepest, Math.abs(trackHeight((i + 1) / 400) - trackHeight(i / 400)) / (track_length / 400));
}
heightScale = Math.min(1, 0.35 / steepest);

//position + heading on the track: `dist` units from the start line, `lane` units right of centre
//(slope is the rise per unit forward: positive = uphill)
function trackFrame(dist, lane) {
    const u = THREE.MathUtils.clamp(dist / track_length, 0, 1);
    const center = track_curve.getPointAt(u);
    const dir = track_curve.getTangentAt(u);
    const slope = (trackHeight(u + 0.001) - trackHeight(u - 0.001)) / (0.002 * track_length);
    return { x: center.x - dir.z * lane, y: trackHeight(u), z: center.z + dir.x * lane, dir, slope };
}

function createTrack() {
    const segments = 400;
    const vertices = [];
    const indices = [];

    for (let i = 0; i < segments; i++) {
        const center = track_curve.getPointAt(i / segments);
        const dir = track_curve.getTangentAt(i / segments);

        //sideways direction (perpendicular to the way the track is heading)
        const sx = -dir.z * track_width / 2;
        const sz = dir.x * track_width / 2;

        //left and right edge of the track at this point
        const y = trackHeight(i / segments) - 0.10;
        vertices.push(center.x - sx, y, center.z - sz);
        vertices.push(center.x + sx, y, center.z + sz);

        //two triangles joining this slice to the next (the last one wraps back to the first)
        const a = i * 2;
        const b = ((i + 1) % segments) * 2;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    const track = new THREE.Mesh(geometry, iceMaterial);
    scene.add(track);
    return track;
}

const track = createTrack();

//Shape the flat snow into a mountainside: it sits just under the track near it, and falls away to a valley floor further out
function shapeSnow() {
    const n = 800;
    const spots = track_curve.getSpacedPoints(n);
    const heights = [];
    for (let i = 0; i < n; i++) heights.push(trackHeight(i / n));
    const valley = Math.min(...heights) - 12;

    const pos = snow.geometry.attributes.position;
    for (let v = 0; v < pos.count; v++) {
        const wx = pos.getX(v) + snow.position.x;
        const wz = -pos.getY(v) + snow.position.z;

        //nearest point on the track
        let best = Infinity, h = 0;
        for (let i = 0; i < n; i++) {
            const d = (spots[i].x - wx) ** 2 + (spots[i].z - wz) ** 2;
            if (d < best) { best = d; h = heights[i]; }
        }

        const away = THREE.MathUtils.smoothstep(Math.sqrt(best), track_width / 2 + 3, track_width / 2 + 50);
        pos.setZ(v, (1 - away) * (h - 1.0) + away * valley - snow.position.y);
    }
    pos.needsUpdate = true;
    snow.geometry.computeVertexNormals();
    return valley;
}
const valley = shapeSnow();

//Background: sky, sea with reflections, glacier walls, icebergs, ice floes and clouds.
//The valley floor is flooded a little, so the track sits on an icy ridge sticking out of the sea.
const waterY = valley + 6;
scene.fog = new THREE.Fog(0xcfe6f5, 350, 950);

//deterministic pseudo-random value from a position, so vertices that share a spot move together
function iceNoise(x, y, z) {
    const n = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
    return (n - Math.floor(n)) * 2 - 1;
}

//sky: a big dome that follows the camera, pale at the horizon and deeper blue overhead
const skyGeo = new THREE.SphereGeometry(900, 32, 16);
const horizonColor = new THREE.Color(0xcfe6f5);
const zenithColor = new THREE.Color(0x2b6fd0);
const skyColors = [];
const skyPos = skyGeo.attributes.position;
for (let v = 0; v < skyPos.count; v++) {
    const t = Math.pow(THREE.MathUtils.clamp(skyPos.getY(v) / 500, 0, 1), 0.7);
    const c = horizonColor.clone().lerp(zenithColor, t);
    skyColors.push(c.r, c.g, c.b);
}
skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(skyColors, 3));
const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false
}));
sky.renderOrder = -1;
scene.add(sky);

//clouds: clusters of soft blobs
const cloudCanvas = document.createElement('canvas');
cloudCanvas.width = cloudCanvas.height = 128;
const cloudCtx = cloudCanvas.getContext('2d');
const cloudGradient = cloudCtx.createRadialGradient(64, 64, 0, 64, 64, 64);
cloudGradient.addColorStop(0, 'rgba(255,255,255,0.95)');
cloudGradient.addColorStop(0.5, 'rgba(255,255,255,0.55)');
cloudGradient.addColorStop(1, 'rgba(255,255,255,0)');
cloudCtx.fillStyle = cloudGradient;
cloudCtx.fillRect(0, 0, 128, 128);
const cloudTexture = new THREE.CanvasTexture(cloudCanvas);
cloudTexture.colorSpace = THREE.SRGBColorSpace;
for (let k = 0; k < 14; k++) {
    const a = rng(0, Math.PI * 2), r = rng(380, 700), y = rng(110, 320);
    for (let j = 0; j < 5; j++) {
        const puff = new THREE.Sprite(new THREE.SpriteMaterial({
            map: cloudTexture, transparent: true, opacity: rng(0.55, 0.95), depthWrite: false, fog: false
        }));
        const w = rng(110, 220);
        puff.scale.set(w, w * 0.5, 1);
        puff.position.set(Math.cos(a) * r + rng(-120, 120), y + rng(-15, 15), Math.sin(a) * r + rng(-120, 120));
        scene.add(puff);
    }
}

//sea: a mirror with a dark blue, glossy layer over it
const sea = new Reflector(new THREE.PlaneGeometry(4000, 4000), {
    textureWidth: 1024, textureHeight: 1024, color: 0xaac4d8
});
sea.rotation.x = -Math.PI / 2;
sea.position.y = waterY;
scene.add(sea);
const seaTint = new THREE.Mesh(
    new THREE.PlaneGeometry(4000, 4000),
    new THREE.MeshPhongMaterial({
        color: 0x063a5e, transparent: true, opacity: 0.6, shininess: 150, specular: 0x88bbdd,
        polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4
    })
);
seaTint.rotation.x = -Math.PI / 2;
seaTint.position.y = waterY + 0.1;
scene.add(seaTint);

//ice: faceted, white at the top and bluer toward the water
function makeGlacierWall(width, height, depth) {
    const geo = new THREE.BoxGeometry(width, height, depth, 36, 8, 4);
    const p = geo.attributes.position;
    const blue = new THREE.Color(0x5fb4ea), white = new THREE.Color(0xf2fbff);
    const colors = [];
    for (let v = 0; v < p.count; v++) {
        let x = p.getX(v), y = p.getY(v), z = p.getZ(v);
        if (y > height / 2 - 0.01) {
            //ragged top with the odd tower
            y += (iceNoise(x, 1, z) * 0.5 + 0.1) * height * 0.28;
            if (iceNoise(Math.round(x / 12), 5, 5) > 0.7) y += height * 0.35;
        }
        x += iceNoise(x, y, 2) * 3;                 // creases down the face
        z += iceNoise(x, y + 1, z) * 5;
        p.setXYZ(v, x, y, z);

        const t = THREE.MathUtils.clamp((y + height / 2) / height * 1.3, 0, 1);
        const streak = 1 + iceNoise(Math.round(x / 6), 0, 0) * 0.06;   // vertical streaks
        const c = blue.clone().lerp(white, t).multiplyScalar(streak);
        colors.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const wall = new THREE.Mesh(geo, makeIceMaterial());
    wall.userData.height = height;
    return wall;
}

function makeIceberg(size, blueness) {
    const geo = new THREE.IcosahedronGeometry(1, 2);
    const p = geo.attributes.position;
    const deep = new THREE.Color(0x3d9fe0);
    const top = new THREE.Color(0xeaf7ff).lerp(new THREE.Color(0x7cc8f5), blueness);
    const stretch = rng(0.9, 1.9), sx = rng(0.8, 1.4), sz = rng(0.8, 1.4);
    const colors = [];
    for (let v = 0; v < p.count; v++) {
        let x = p.getX(v), y = p.getY(v), z = p.getZ(v);
        const r = 1 + iceNoise(x * 3, y * 3, z * 3) * 0.25;
        x *= r * sx;
        z *= r * sz;
        y = y > 0 ? y * stretch * r : y * 0.5;
        const pinch = y > 0.5 ? Math.max(0.35, 1 - (y - 0.5) * 0.6) : 1;   // narrower toward the top
        p.setXYZ(v, x * pinch * size, y * size, z * pinch * size);

        const c = deep.clone().lerp(top, THREE.MathUtils.clamp((y + 0.3) / 1.5, 0, 1));
        colors.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return new THREE.Mesh(geo, makeIceMaterial());
}

function makeIceMaterial() {
    return new THREE.MeshPhongMaterial({ vertexColors: true, flatShading: true, shininess: 70, specular: 0x88aacc, emissive: 0x2a5a8a });   // the emissive tint keeps the shadowed faces blue instead of grey
}

//somewhere in the open sea, well away from the track and its shoreline
const shoreSpots = track_curve.getSpacedPoints(300);
function randomSeaSpot(minR, maxR) {
    while (true) {
        const a = rng(0, Math.PI * 2), r = rng(minR, maxR);
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        let best = Infinity;
        for (const s of shoreSpots) best = Math.min(best, (s.x - x) ** 2 + (s.z - z) ** 2);
        if (Math.sqrt(best) > track_width / 2 + 60) return { x, z };
    }
}

//glacier walls looming around the horizon
for (let k = 0; k < 5; k++) {
    const a = (k + rng(-0.25, 0.25)) / 5 * Math.PI * 2;
    const r = rng(430, 520);
    const wall = makeGlacierWall(rng(220, 380), rng(70, 120), rng(50, 80));
    wall.position.set(Math.cos(a) * r, waterY + wall.userData.height / 2 - 10, Math.sin(a) * r);
    wall.rotation.y = Math.atan2(-Math.cos(a), -Math.sin(a));
    scene.add(wall);
}

//icebergs (farther ones are bigger so they still read from a distance)
for (let k = 0; k < 36; k++) {
    const spot = randomSeaSpot(90, 420);
    const berg = makeIceberg(rng(8, 20) + Math.hypot(spot.x, spot.z) * rng(0, 0.06), Math.random());
    berg.position.set(spot.x, waterY - 1, spot.z);
    berg.rotation.y = rng(0, Math.PI * 2);
    scene.add(berg);
}

//small flat ice floes bobbing on the water
const floeMaterial = new THREE.MeshPhongMaterial({ color: 0xf4fbff, flatShading: true });
for (let k = 0; k < 90; k++) {
    const spot = randomSeaSpot(40, 300);
    const floe = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), floeMaterial);
    floe.scale.set(rng(1.5, 6), rng(0.3, 1), rng(1.5, 6));
    floe.position.set(spot.x, waterY, spot.z);
    floe.rotation.y = rng(0, Math.PI * 2);
    scene.add(floe);
}

//Obstacle / Present Adding
const obs_count = 14;
const obstacles = [];
let obs_pos = [];

//rng for placement of objects
function rng(min, max) {
    return Math.random() * (max - min) + min
}

function addIceBlock(x, y, z, dist, lane) {
    const block = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 1.5, 1.5),
        new THREE.MeshPhongMaterial({ color: 0x60b9e8 })
    );
    block.position.set(x, y + 0.75, z);
    block.userData = { dist, lane };   // where it sits on the track (the AI penguins look at this)
    scene.add(block);
    obstacles.push(block);
}

//MAX X = -5.25
//MIN X = 5.25
//MAX Z = -63.75
//MIN Z = 15.25

//Add the ice blocks
let i = 0;
while (i < obs_count) {
    let dist = rng(40, track_length - 20);
    let lane = rng(-5.25, 5.25);
    let f = trackFrame(dist, lane);
    let xpos = f.x;
    let zpos = f.z;

    //Keep track of each obstacle's location (make sure no two obstacles are assigned to same location)
    let point = String(xpos) + " " + String(zpos);

    //Add ice block and advance only if point is unique
    if (!obs_pos.includes(point)){
        obs_pos.push(point);
        addIceBlock(xpos, f.y, zpos, dist, lane);
        i++;
    }

}

//Presents: grab them to go faster. They sit in short lines along the track, never on top of ice.
const presents = [];
const MAX_PRESENTS = 10;
const PRESENT_BOOST = 0.06;   // each present adds this much to a penguin's cruising speed

function addPresent(x, y, z, dist, lane) {
    const gift = new THREE.Group();
    const wrap = new THREE.MeshPhongMaterial({ color: 0xe0334a });
    const ribbon = new THREE.MeshPhongMaterial({ color: 0xffd166 });
    gift.add(new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.1), wrap));
    gift.add(new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.15, 0.22), ribbon));
    gift.add(new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.15, 1.15), ribbon));
    const bow = new THREE.Mesh(new THREE.OctahedronGeometry(0.3), ribbon);
    bow.position.y = 0.7;
    gift.add(bow);
    gift.scale.setScalar(1.7);
    gift.position.set(x, y, z);
    gift.userData = { dist, lane, baseY: y };
    scene.add(gift);
    presents.push(gift);
}

function nearIce(dist, lane) {
    return obstacles.some(b => Math.abs(b.userData.dist - dist) < 6 && Math.abs(b.userData.lane - lane) < 3);
}

let lines = 0;
while (lines < 10) {
    const dist0 = rng(30, track_length - 50);
    const lane = rng(-4.5, 4.5);
    if ([0, 1, 2].some(k => nearIce(dist0 + k * 6, lane))) continue;
    for (let k = 0; k < 3; k++) {
        const f = trackFrame(dist0 + k * 6, lane);
        addPresent(f.x, f.y + 1.1, f.z, dist0 + k * 6, lane);
    }
    lines++;
}

//little shards that fly out when ice breaks or a present is picked up
const shards = [];
const shardGeometry = new THREE.TetrahedronGeometry(0.25);
const iceShardMaterial = new THREE.MeshPhongMaterial({ color: 0xbfe8ff, emissive: 0x4aa6e0 });
const giftShardMaterial = new THREE.MeshPhongMaterial({ color: 0xffd166, emissive: 0xaa8800 });
function spawnBurst(position, material, count) {
    for (let k = 0; k < count; k++) {
        const shard = new THREE.Mesh(shardGeometry, material);
        shard.position.copy(position);
        shard.userData = { vel: new THREE.Vector3(rng(-6, 6), rng(3, 9), rng(-6, 6)), life: 0.8 };
        scene.add(shard);
        shards.push(shard);
    }
}

//score readout
const hud = document.createElement('div');
hud.style.cssText = 'position:fixed;top:14px;left:18px;font:700 26px/1.3 system-ui,sans-serif;color:#fff;' +
    'text-shadow:0 2px 6px rgba(0,40,80,.7);pointer-events:none';
document.body.appendChild(hud);
let hudShown = -1;

const finish = new THREE.Mesh(
    new THREE.PlaneGeometry(track_width, 1),
    new THREE.MeshBasicMaterial({ color: 0xffd166, side: THREE.DoubleSide })
);
const finishFrame = trackFrame(track_length, 0);
finish.rotation.set(-Math.PI / 2, 0, Math.atan2(-finishFrame.dir.x, -finishFrame.dir.z));
finish.position.set(finishFrame.x, finishFrame.y - 0.07, finishFrame.z);
scene.add(finish);


//penguins
function createPenguin(color) {
    const penguin = new THREE.Group();
    const black = new THREE.MeshPhongMaterial({ color });
    const white = new THREE.MeshPhongMaterial({ color: 0xffffff });
    const orange = new THREE.MeshPhongMaterial({ color: 0xffa533 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), black);
    body.scale.set(0.65, 1.0, 0.65);
    body.position.y = 1;
    penguin.add(body);
    const belly = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), white);
    belly.scale.set(0.48, 0.7, 0.12);
    belly.position.set(0, 0.95, -0.58);
    penguin.add(belly);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.48, 16, 12), black);
    head.position.set(0, 2.0, 0);
    penguin.add(head);

    for (const x of [-0.20, 0.20]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), white);
        eye.position.set(x, 2.10, -0.41);
        penguin.add(eye);
    }

    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.4, 8), orange);
    beak.rotation.x = -Math.PI / 2;
    beak.position.set(0, 1.91, -0.55);
    penguin.add(beak);

    penguin.userData.wings = [];
    for (const side of [-1, 1]) {
        const wing = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), black);
        wing.geometry.translate(0, -1, 0);   // pivot at the shoulder so the flipper swings from the top
        wing.scale.set(0.20, 0.48, 0.25);
        wing.position.set(side * 0.70, 1.58, 0);
        wing.userData.side = side;
        penguin.add(wing);
        penguin.userData.wings.push(wing);
    }

    scene.add(penguin);
    penguin.matrixAutoUpdate = false;
    return penguin;
}

const penguins = [
    { mesh: createPenguin(0x181818), dist: 8, lane: 0, speed: 18, vel: 18, flap: 0, slope: 0, spin: 0, spinning: false, roll: 0, rolling: false, rollCooldown: 0, presents: 0 },
    { mesh: createPenguin(0x314a8a), dist: 8, lane: -3, speed: 16, vel: 16, flap: 2, slope: 0, spin: 0, spinning: false, roll: 0, rolling: false, rollCooldown: 0, presents: 0, ai: true, skill: 0.8, seen: new Set() },
    { mesh: createPenguin(0x6a3c75), dist: 8, lane: 3, speed: 17, vel: 17, flap: 4, slope: 0, spin: 0, spinning: false, roll: 0, rolling: false, rollCooldown: 0, presents: 0, ai: true, skill: 0.65, seen: new Set() }
];

const player = penguins[0];
const keys = { left: false, right: false, up: false };
const clock = new THREE.Clock();

//Fly-over before the race: the camera circles the island while the penguins wait, then settles in behind them
const INTRO_TIME = 10;   // seconds (Enter skips it)
let introTime = 0;
const introCenter = new THREE.Vector3();
for (const s of shoreSpots) introCenter.add(s);
introCenter.divideScalar(shoreSpots.length);

function onKeyDown(event) {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp'].includes(event.key)) {
        event.preventDefault();
    }
    if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a') keys.left = true;
    if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd') keys.right = true;
    if (event.key === 'ArrowUp' || event.key.toLowerCase() === 'w') keys.up = true;

    if (event.key === 'Enter') introTime = INTRO_TIME;   // skip the fly-over

    if (event.code === 'Space') {
        event.preventDefault();   // stops the page from scrolling
        if (introTime >= INTRO_TIME) startRoll(player);
    }
}

function onKeyUp(event) {
    if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a') keys.left = false;
    if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd') keys.right = false;
    if (event.key === 'ArrowUp' || event.key.toLowerCase() === 'w') keys.up = false;
}

document.addEventListener('keydown', onKeyDown);
document.addEventListener('keyup', onKeyUp);
window.addEventListener('resize', onWindowResize);

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}


const penguinBox = new THREE.Box3();
const otherBox = new THREE.Box3();

// puts the penguin at its distance/lane along the track
function placeOnTrack(p) {
    const f = trackFrame(p.dist, p.lane);
    p.x = f.x; p.y = f.y; p.z = f.z; p.dir = f.dir; p.slope = f.slope;
}

// places the penguin's mesh at (x, y, z), facing along the track, tilted with the slope, plus its hit spin and front roll, lying down
function updatePenguinMatrix(p) {
    const heading = Math.atan2(-p.dir.x, -p.dir.z);
    const hop = Math.sin(p.roll / 2);   // a little lift mid-roll so the tumbling body clears the ground
    p.mesh.matrix.copy(
        translationMatrix(p.x, p.y + hop, p.z)
            .multiply(new THREE.Matrix4().makeRotationY(heading))
            .multiply(new THREE.Matrix4().makeRotationX(Math.atan(p.slope)))
            .multiply(new THREE.Matrix4().makeRotationY(p.spin))
            .multiply(translationMatrix(0, 0.7, 0))                   // front roll: tumble forward around the middle of the body
            .multiply(new THREE.Matrix4().makeRotationX(-p.roll))
            .multiply(translationMatrix(0, -0.7, 0))
            .multiply(translationMatrix(0, 0.7, 1.25))              // lift onto the track and centre the body on its position
            .multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2))   // lay the penguin down, head first
    );
    p.mesh.matrixWorldNeedsUpdate = true;   // so collision boxes see the new position right away
}

// the one overlap test for everything: returns the first thing in the list (ice, presents, other penguins' meshes)
// whose bounding box overlaps the penguin's, or null. `shrink` pulls both boxes in a little so near misses don't count.
function findCollision(p, things, shrink = 0) {
    penguinBox.setFromObject(p.mesh).expandByScalar(-shrink);

    for (const thing of things) {
        otherBox.setFromObject(thing).expandByScalar(-shrink);

        if (penguinBox.intersectsBox(otherBox)) return thing;
    }
    return null;
}

// Space: tumble forward. Smashes through any ice on the way (see hitIce).
function startRoll(p) {
    if (p.rolling || p.spinning || p.rollCooldown > 0) return;
    p.rolling = true;
    p.roll = 0;
}

// the ice always shatters. Mid-roll the penguin just keeps going; otherwise it spins out, drops a present and loses its speed
function hitIce(p, block) {
    scene.remove(block);
    obstacles.splice(obstacles.indexOf(block), 1);
    spawnBurst(block.position, iceShardMaterial, 12);

    if (p.rolling || p.spinning) return;
    p.spinning = true;
    p.spin = 0;
    p.presents = Math.max(0, p.presents - 1);
    p.vel = 4.5;
}

// presents are collected on contact and the penguin carries straight on
function collectPresent(p, gift) {
    scene.remove(gift);
    presents.splice(presents.indexOf(gift), 1);
    spawnBurst(gift.position, giftShardMaterial, 8);
    p.presents = Math.min(MAX_PRESENTS, p.presents + 1);
}

// penguins can't pass through each other: side by side they get nudged apart, and the one behind falls in behind the one in front
function separatePenguins() {
    for (let a = 0; a < penguins.length; a++) {
        for (let b = a + 1; b < penguins.length; b++) {
            const pa = penguins[a], pb = penguins[b];
            if (pa.dist >= track_length || pb.dist >= track_length) continue;   // penguins that have crossed the finish line are out of the way
            if (!findCollision(pa, [pb.mesh], 0.4)) continue;

            const front = pa.dist >= pb.dist ? pa : pb;
            const back = front === pa ? pb : pa;
            const overlapAlong = 2.6 - (front.dist - back.dist);
            const overlapSide = 1.9 - Math.abs(pa.lane - pb.lane);
            if (overlapAlong <= 0 || overlapSide <= 0) continue;

            let stillOverlapping = true;
            if (overlapSide < overlapAlong) {
                const dir = pa.lane >= pb.lane ? 1 : -1;
                pa.lane = THREE.MathUtils.clamp(pa.lane + dir * overlapSide / 2, -5, 5);
                pb.lane = THREE.MathUtils.clamp(pb.lane - dir * overlapSide / 2, -5, 5);
                stillOverlapping = Math.abs(pa.lane - pb.lane) < 1.9;   // pinned against the edge of the track
            }
            if (stillOverlapping) {
                back.dist = front.dist - 2.6;
                back.vel = Math.min(back.vel, front.vel);
            }

            for (const p of [pa, pb]) {
                placeOnTrack(p);
                updatePenguinMatrix(p);
            }
        }
    }
}

// the computer penguins: drift toward presents just ahead, and usually roll through ice that's about to hit them
function aiDrive(p, dt) {
    let nearest = null;
    for (const gift of presents) {
        const ahead = gift.userData.dist - p.dist;
        if (ahead > 0 && ahead < 45 && (!nearest || ahead < nearest.userData.dist - p.dist)) nearest = gift;
    }
    if (nearest) {
        p.lane += THREE.MathUtils.clamp(nearest.userData.lane - p.lane, -6 * dt, 6 * dt);
    }

    for (const block of obstacles) {
        const ahead = block.userData.dist - p.dist;
        if (ahead > 0 && ahead < p.vel * 0.3 && Math.abs(block.userData.lane - p.lane) < 1.8 && !p.seen.has(block)) {
            p.seen.add(block);
            if (Math.random() < p.skill) startRoll(p);
        }
    }
}

function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);
    if (introTime < INTRO_TIME) introTime += dt;
    const racing = introTime >= INTRO_TIME;

    if (racing && keys.left) player.lane -= 12 * dt;
    if (racing && keys.right) player.lane += 12 * dt;

    for (let i = 0; i < penguins.length; i++) {
        const p = penguins[i];

        //hit spin (after smacking ice) and front roll (Space), each on its own timer
        if (p.spinning) {
            p.spin += (Math.PI * 2 / 0.5) * dt;
            if (p.spin >= Math.PI * 2) {
                p.spin = 0;
                p.spinning = false;
            }
        }
        if (p.rolling) {
            p.roll += (Math.PI * 2 / 0.5) * dt;
            if (p.roll >= Math.PI * 2) {
                p.roll = 0;
                p.rolling = false;
                p.rollCooldown = 0.8;   // can't chain rolls back to back
            }
        }
        p.rollCooldown = Math.max(0, p.rollCooldown - dt);

        if (racing && p.ai) aiDrive(p, dt);
        p.lane = THREE.MathUtils.clamp(p.lane, -5, 5);

        const target = p.speed * (1 + PRESENT_BOOST * p.presents) + (i === 0 && keys.up ? 9 : 0);
        const gravity = p.slope < 0 ? 75 : 30;                      // downhill speeds you up more than uphill slows you
        if (racing) {
            p.vel += (-p.slope * gravity + (target - p.vel) * 0.8) * dt;   // gravity along the slope, drive pulls back toward cruising speed
            p.vel = Math.max(p.vel, 4.5);
        }

        //flipper wag: swings out and in around a slightly-out resting angle, quicker the faster the penguin is going
        p.flap += (6 + (racing ? p.vel : 0) * 1.2) * dt;   // gentle idle wag while waiting at the start
        for (const wing of p.mesh.userData.wings) {
            wing.rotation.z = wing.userData.side * (0.25 + 0.3 * Math.sin(p.flap));
        }

        if (racing) p.dist = Math.min(track_length, p.dist + p.vel * dt);
        placeOnTrack(p);

        updatePenguinMatrix(p);
    }

    //collisions: ice and presents, then penguins against each other
    for (const p of penguins) {
        const block = findCollision(p, obstacles);
        if (block) hitIce(p, block);

        const gift = findCollision(p, presents);
        if (gift) collectPresent(p, gift);
    }
    separatePenguins();

    //presents spin and bob, shards fly and fade
    for (const gift of presents) {
        gift.rotation.y += 2 * dt;
        gift.position.y = gift.userData.baseY + Math.sin(clock.elapsedTime * 3 + gift.userData.dist) * 0.25;
    }
    for (let k = shards.length - 1; k >= 0; k--) {
        const shard = shards[k];
        shard.userData.vel.y -= 25 * dt;
        shard.position.addScaledVector(shard.userData.vel, dt);
        shard.userData.life -= dt;
        shard.scale.setScalar(Math.max(0, shard.userData.life / 0.8));
        if (shard.userData.life <= 0) {
            scene.remove(shard);
            shards.splice(k, 1);
        }
    }

    if (player.presents !== hudShown) {
        hudShown = player.presents;
        hud.textContent = '🎁 ' + player.presents + ' / ' + MAX_PRESENTS;
    }

    const chasePos = new THREE.Vector3(player.x - player.dir.x * 15, player.y + 8, player.z - player.dir.z * 15);
    const chaseLook = new THREE.Vector3(player.x + player.dir.x * 9, player.y + 1 + player.slope * 9, player.z + player.dir.z * 9);
    if (racing) {
        camera.position.lerp(chasePos, 0.1);
        camera.lookAt(chaseLook);
    } else {
        //swing around the island while sinking toward the start line, then settle in behind the penguins
        const t = introTime / INTRO_TIME;
        const ease = t * t * (3 - 2 * t);
        const settle = THREE.MathUtils.smoothstep(t, 0.7, 1);
        const angle = Math.atan2(player.z - introCenter.z, player.x - introCenter.x) - (1 - ease) * Math.PI * 1.25;
        const radius = THREE.MathUtils.lerp(300, 200, ease);
        const flyPos = new THREE.Vector3(
            introCenter.x + Math.cos(angle) * radius,
            player.y + THREE.MathUtils.lerp(140, 30, ease),
            introCenter.z + Math.sin(angle) * radius
        );
        const flyLook = introCenter.clone().lerp(chaseLook, ease);
        camera.position.copy(flyPos).lerp(chasePos, settle);
        camera.lookAt(flyLook.lerp(chaseLook, settle));
    }
    sky.position.copy(camera.position);
    renderer.render(scene, camera);
}

animate();