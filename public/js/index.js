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
camera.position.set(750.0, 630.0, 170.0);
camera.updateMatrix();
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
  color: 0xff00ff,
  polygonOffset: true,
  polygonOffsetFactor: 1,
  polygonOffsetUnits: 1
  // wireframe: true,
  // wireframeLinewidth: 2
});
const meshLoader = new GLTFLoader();
meshLoader.load(
  "../models/wiregibsolid.gltf",
  (gltf) => {
    rock = gltf.scene;
    rock.traverse((node) => {
      if (!node.isMesh) return;
      node.material = wireMaterial;
    });
    
    rock.children[2].updateMatrix();
    rock.children[2].scale.set(1, 1, 1);
    rock.children[2].updateMatrix();
    // scene.add(rock);
    
    let rockGeo = new THREE.WireframeGeometry(rock.children[2].geometry);
    console.log(rock.children[2].geometry);
    rockWire = new THREE.LineSegments(rockGeo);
    rockWire.material.color.set(0xffffff);
    rockWire.material.linewidth = 2;
    // scene.add(rockWire);

    rockGroup = new THREE.Group();
    rockGroup.add(rock.children[2]);
    rockGroup.add(rockWire);

    scene.add(rockGroup);

    console.log(rockGroup);
  },
  (xhr) => {
    console.log(`${((xhr.loaded / xhr.total) * 100).toFixed(2)}% loaded`);
  },
  (error) => {
    console.error(error);
  }
);

// Renderer
let canvas = document.getElementsByClassName("webgl")[0];

const renderer = new THREE.WebGLRenderer({
  canvas: canvas,
  antialias: true
});
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(dim.width, dim.height);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(1000, 0, 0);
controls.addEventListener("change", () => renderer.render(scene, camera));

// Main Loop
const loop = () => {
  renderer.render(scene, camera);
  requestAnimationFrame(loop);

  // console.log(camera.position, camera.rotation)

  // rockGroup.rotation.y += 0.001;
};
loop();
