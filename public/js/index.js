import * as THREE from "three";
import { OrbitControls } from "OrbitControls";
import { GLTFLoader } from "GLTFLoader";

const dim = {};
dim.width = window.innerWidth;
dim.height = window.innerHeight;

window.addEventListener("resize", () => {
  dim.width = window.innerWidth;
  dim.height = window.innerHeight;

  camera.aspect = dim.width / dim.height;
  camera.updateProjectionMatrix();

  renderer.setSize(dim.width, dim.height);
});

// Create the scene
const scene = new THREE.Scene();

// Create the camera
const camera = new THREE.PerspectiveCamera(
  75,
  dim.width / dim.height,
  1,
  10000
);

const cameraStart = new THREE.Vector3(-850.0, 700.0, -340.0);
const cameraDirection = new THREE.Vector3(
  -1.6196953785926882,
  -0.6711233295446031,
  -1.6493299762217073
);

camera.position.copy(cameraStart);
camera.rotation.copy(cameraDirection);
camera.updateMatrix();
camera.updateProjectionMatrix();
scene.add(camera);

// Testing Cube
// const cube = new THREE.Mesh(
//   new THREE.BoxGeometry(1, 1, 1),
//   new THREE.MeshBasicMaterial({ color: 0xfff })
// );
// scene.add(cube);

// Load Mesh
var rock, rockWire, rockGroup;
const wireMaterial = new THREE.MeshBasicMaterial({
  color: 0x333333,
  polygonOffset: true,
  polygonOffsetFactor: 1,
  polygonOffsetUnits: 1,
  // wireframe: true,
  // wireframeLinewidth: 2
});
const meshLoader = new GLTFLoader();
meshLoader.load(
  "../models/wiregib.gltf",
  (gltf) => {
    rock = gltf.scene;
    rock.traverse((node) => {
      if (!node.isMesh) return;
      node.material = wireMaterial;
    });
    // Although scene has only one element usually, it may have a Light, Camera etc.,
    // that I may not remember to remove (when updating mesh).

    let rockGeo = new THREE.WireframeGeometry(rock.children[0].geometry); // Copy geometry, render wireframe on top of original.
    console.log(rock.children[0].geometry);
    rockWire = new THREE.LineSegments(rockGeo);
    rockWire.material.color.set(0xffffff);
    rockWire.material.linewidth = 1;

    rockWire.updateMatrix();

    rockGroup = new THREE.Group();
    rockGroup.add(rock.children[0]);
    rockGroup.add(rockWire);

    scene.add(rockGroup);

    console.log(rockGroup);
  },
  (xhr) => {
    console.log(`${((xhr.loaded / xhr.total) * 100).toFixed(2)}% loaded`); // Progress indicator
  },
  (error) => {
    console.error(error);
  }
);

// Renderer
let canvas = document.getElementsByClassName("webgl")[0];

const renderer = new THREE.WebGLRenderer({
  canvas: canvas,
  antialias: true,
});
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(dim.width, dim.height);
renderer.setClearColor(0x000000, 0.0);

// Controls
const controls = new OrbitControls(camera, renderer.domElement);

const cameraTarget = cameraStart.add(cameraDirection.multiplyScalar(100)); // Add direction vector to start to obtain a point in this direction to target
console.log(cameraStart, cameraDirection);
console.log(cameraTarget);
controls.addEventListener("change", () => renderer.render(scene, camera));

camera.updateProjectionMatrix();

// Main Loop
const loop = () => {
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
  console.log(camera)
};
loop();
