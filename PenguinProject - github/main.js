import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

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
    color: 0x91dff2,
    shininess: 100
});

const snow = new THREE.Mesh(new THREE.PlaneGeometry(100, 150), snowMaterial);
snow.rotation.x = -Math.PI / 2;
snow.position.set(0, -0.13, -30);
scene.add(snow);
const track = new THREE.Mesh(new THREE.PlaneGeometry(12, 92), iceMaterial);
track.rotation.x = -Math.PI / 2;
track.position.set(0, -0.10, -30);
scene.add(track);

//Obstacle / Present Adding
const obs_count = 3;
const obstacles = [];
let obs_pos = [];

//rng for placement of objects
function rng(min, max) {
    return Math.random() * (max - min) + min
}

function addIceBlock(x, z) {
    const block = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 1.5, 1.5),
        new THREE.MeshPhongMaterial({ color: 0x60b9e8 })
    );
    block.position.set(x, 0.75, z);
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
    let xpos = rng(-5.25, 5.25);
    let zpos = rng(-63.75, 15.25);
    
    //Keep track of each obstacle's location (make sure no two obstacles are assigned to same location)
    let point = String(xpos) + " " + String(zpos);
    
    //Add ice block and advance only if point is unique
    if (!obs_pos.includes(point)){
        obs_pos.push(point);
        addIceBlock(xpos, zpos);
        i++;
    }
    
}

const finish = new THREE.Mesh(
    new THREE.PlaneGeometry(12, 1),
    new THREE.MeshBasicMaterial({ color: 0xffd166, side: THREE.DoubleSide })
);
finish.rotation.x = -Math.PI / 2;
finish.position.set(0, -0.07, -65);
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

    for (const side of [-1, 1]) {
        const wing = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), black);
        wing.scale.set(0.20, 0.48, 0.25);
        wing.position.set(side * 0.70, 1.10, 0);
        penguin.add(wing);
    }

    scene.add(penguin);
    penguin.matrixAutoUpdate = false;
    return penguin;
}

const penguins = [
    { mesh: createPenguin(0x181818), x: 0, z: 8, speed: 6, spin: 0 },
    { mesh: createPenguin(0x314a8a), x: -3, z: 8, speed: 5.3, spin: 0 },
    { mesh: createPenguin(0x6a3c75), x: 3, z: 8, speed: 5.7, spin: 0 }
];

const player = penguins[0];
const keys = { left: false, right: false, up: false };
const clock = new THREE.Clock();

function onKeyDown(event) {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp'].includes(event.key)) {
        event.preventDefault();
    }
    if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a') keys.left = true;
    if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd') keys.right = true;
    if (event.key === 'ArrowUp' || event.key.toLowerCase() === 'w') keys.up = true;

    if (event.code === 'Space') {
        event.preventDefault();   // stops the page from scrolling
        if (!player.spinning) {
            player.spinning = true;
            if (player.touching) {
                scene.remove(player.touching);
                obstacles.splice(obstacles.indexOf(player.touching), 1);
                player.touching = null;
            }
        }
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
const blockBox = new THREE.Box3();

// places the penguin's mesh at (x, z) and turns it by its spin angle
function updatePenguinMatrix(p) {
    p.mesh.matrix.copy(
        translationMatrix(p.x, 0, p.z).multiply(new THREE.Matrix4().makeRotationY(p.spin))
    );
}

// pushes the penguin out of any ice block it overlaps and returns that block (or null)
function onIceBlockCollision(p) {
    penguinBox.setFromObject(p.mesh);

    for (const block of obstacles) {
        blockBox.setFromObject(block);

        if (penguinBox.intersectsBox(blockBox)) {
            p.z += blockBox.max.z - penguinBox.min.z;
            updatePenguinMatrix(p);
            return block;
        }
    }
    return null;
}

function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);
    if (keys.left) player.x -= 5 * dt;
    if (keys.right) player.x += 5 * dt;
    player.x = THREE.MathUtils.clamp(player.x, -5, 5);

    if (player.spinning) {
        player.spin += (Math.PI * 2 / 0.5) * dt;       
        if (player.spin >= Math.PI * 2) {
            player.spin = 0;
            player.spinning = false;
        }
    }

    for (let i = 0; i < penguins.length; i++) {
        const p = penguins[i];
        const speed = p.speed + (i === 0 && keys.up ? 3 : 0);
        p.z = Math.max(-65, p.z - speed * dt);

        updatePenguinMatrix(p);
        p.touching = onIceBlockCollision(p);
    }

    const desiredCameraPosition = new THREE.Vector3(player.x, 8, player.z + 15);
    camera.position.lerp(desiredCameraPosition, 0.1);
    camera.lookAt(player.x, 1, player.z - 9);
    renderer.render(scene, camera);
}

animate();
