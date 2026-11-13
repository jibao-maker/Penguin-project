# Penguin Racing Game

A small 3D penguin race built with [Three.js](https://threejs.org/) and bundled with [Vite](https://vitejs.dev/). You steer a penguin down an icy track against two computer-controlled penguins, dodge (or break) ice blocks, and head for the finish line.

## Running the project

You need [Node.js](https://nodejs.org/) (LTS version). From the folder that contains `package.json`:

```
npm install
npx vite
```

Open the address Vite prints (usually `http://localhost:5173`). Opening `index.html` directly will not work, because the code uses ES module imports.

## Controls

| Key | Action |
| --- | --- |
| `A` / Left arrow | Steer left |
| `D` / Right arrow | Steer right |
| `W` / Up arrow | Speed boost (+3 forward speed while held) |
| `Space` | Spin 360° and smash the ice block you are touching |

## How it was implemented

Everything lives in `main.js`. The sections below follow the order of the file.

### 1. Scene, camera and renderer

- A `THREE.Scene` with a light-blue background.
- A `PerspectiveCamera` (50° field of view) and a `WebGLRenderer` sized to the window, attached to the page with `document.body.appendChild(renderer.domElement)`.
- `OrbitControls` is imported and created, but it is disabled (`controls.enabled = false`), so the camera is driven only by the follow code in `animate()`.
- A `resize` listener keeps the camera aspect ratio and renderer size in sync with the window.

### 2. Environment

- Lighting: one `AmbientLight` for general brightness and one `DirectionalLight` as the sun.
- Ground: two flat `PlaneGeometry` meshes rotated -90° on the x-axis so they lie flat. A large white one is the snow, and a narrower light-blue shiny one (`MeshPhongMaterial` with `shininess`) is the ice track, 12 units wide and 92 long.
- Finish line: a yellow `PlaneGeometry` (`MeshBasicMaterial`, so lighting does not affect it) at `z = -65`.

The track runs along the negative z-axis. Going "forward" means z gets smaller.

### 3. Ice blocks

- Each block is a `THREE.Mesh` made of a 1.5-unit `BoxGeometry` and a blue `MeshPhongMaterial`. Its y-position is `0.75` so the cube rests on the ground.
- `addIceBlock(x, z)` creates a block, adds it to the scene, and pushes it into the `obstacles` array. The array is how the collision code finds every block.
- Blocks are placed randomly. A `while` loop runs until `obs_count` (3) blocks exist. Each pass picks a random x between -5.25 and 5.25 and a random z between -63.75 and 15.25 using the `rng(min, max)` helper, which wraps `Math.random()`.
- The `obs_pos` array stores each position as a string and the loop skips a position that is already in it. Random decimals almost never repeat, so this check rarely triggers.

### 4. Penguins

- `createPenguin(color)` builds one penguin as a `THREE.Group` of simple shapes: a squashed sphere for the body, a thin white sphere for the belly, a sphere head, two small eyes, a cone beak and two squashed-sphere wings. The penguin faces the -z direction (the direction of travel).
- The three penguins are plain objects, `{ mesh, x, z, speed, spin }`. The game state (position, speed and spin angle) is stored in these numbers, not read back from the mesh.
- Each group has `matrixAutoUpdate = false`, so Three.js does not rebuild its matrix on its own. The game builds it by hand every frame with `updatePenguinMatrix(p)`:

  ```javascript
  translationMatrix(p.x, 0, p.z).multiply(new THREE.Matrix4().makeRotationY(p.spin))
  ```

  This moves the penguin to `(x, 0, z)` and turns it by `spin` radians around the vertical axis.
- `player` is the first penguin (black). The other two (blue and purple) are computer-controlled. They each have a fixed speed and drive straight with no steering.

### 5. Input

- `onKeyDown` and `onKeyUp` set the flags in the `keys` object (`left`, `right`, `up`). The animation loop reads the flags every frame, which gives smooth movement.
- Pressing Space starts a spin (see section 8). `event.preventDefault()` stops the browser from scrolling the page.

### 6. Game loop (`animate`)

`requestAnimationFrame` calls `animate()` every frame. Each call does the following:

1. Computes `dt`, the time since the last frame, capped at 0.05 seconds so a lag spike cannot cause a big jump. All movement is multiplied by `dt`, so speed does not depend on frame rate.
2. Moves the player left or right by 5 units per second and clamps x to between -5 and 5 so it stays on the track.
3. Advances the spin if one is running.
4. For each penguin, moves it forward by `speed * dt` (the player gets +3 while `W`/Up is held). The z-position is clamped so no penguin goes past `-65`. Then it updates the penguin's matrix and runs the collision check.
5. Moves the camera toward a spot behind and above the player with `lerp(..., 0.1)`, which gives a smooth trailing motion, and aims it at a point just ahead of the player with `lookAt`.
6. Renders the scene.

### 7. Collision detection

Collisions use `THREE.Box3`, an axis-aligned bounding box.

```javascript
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
```

- `setFromObject` fits a box around the penguin's whole group and around each block's cube.
- `intersectsBox` is true when the two boxes overlap on all three axes.
- On a hit, the penguin is pushed back along z by exactly the amount it sank into the block, so it rests against the block and cannot pass through. The player has to steer around it.
- The function returns the block that was hit, or `null`. The loop stores this in `p.touching` each frame, so the game always knows which block (if any) a penguin is pressed against.

The boxes are re-measured every frame, after the penguin's matrix has been updated, so they always match what is on screen.

### 8. Spin and smash (Space)

- Pressing Space sets `player.spinning = true`, but only if a spin is not already running.
- If `player.touching` is set, that block is removed right away with `scene.remove(block)`, and it is taken out of the `obstacles` array with `splice` so it can no longer collide.
- While `spinning` is true, `animate()` adds `2π / 0.5` radians per second to `player.spin`, one full turn in half a second. `updatePenguinMatrix` turns that angle into rotation. When the angle reaches 2π it resets to 0 and the spin ends.
- Because all penguins use the same `obstacles` array, a computer-controlled penguin stuck behind the removed block can move on again.

## Project structure

```
Penguin-project/
├── README.md
├── main.js                      (copy of the game code)
└── PenguinProject - github/
    ├── index.html               page that loads main.js as a module
    ├── main.js                  the game code
    ├── package.json             dependencies: three, vite
    └── postcss.config.js
```

Run the commands from the `PenguinProject - github` folder.

## Known limitations

- There is no win detection. The penguins stop at the finish line, but nothing announces a winner.
- There is no game over or restart. Hitting a block only stops the penguin until it steers around it.
- Blocks are placed at random, and the z range goes up to 15.25, while penguins start at `z = 8`. A block can occasionally spawn on or near the start line.
- The computer-controlled penguins do not steer, so they get stuck behind any block in their lane until the player breaks it.
- Bounding boxes are axis-aligned and include the wings, so a hit can register slightly before the visible surfaces touch. The box also changes size slightly during a spin.
- A removed block is taken out of the scene, but its geometry and material are not disposed of. That is fine for a few blocks.
