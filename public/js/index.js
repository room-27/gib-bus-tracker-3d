import * as THREE from "three";
import { OrbitControls } from "OrbitControls";
import { GLTFLoader } from "GLTFLoader";
import { lltp } from "LLTP";
import * as stopData from "../data/stops.json" assert { type: "json" };
import * as routePathData from "../data/routePathData.json" assert { type: "json" };

const dim = {};
dim.width = window.innerWidth;
dim.height = window.innerHeight;

const busIDs = ["1", "2", "3", "4", "7", "8", "9"];

const routeColours = {
  1: 0x41ad48,
  2: 0xfaa11f,
  3: 0xed008c,
  4: 0x276bb4,
  7: 0x6d6e72, //0x6d6e72 too dark
  8: 0x000000,
  9: 0x009edf,
  // N1: 0xa10800,
};

const uniforms = {
  time: { value: 0 },
};

const proxyURL = "/proxy/";

var lastStopIDs = {
  1: [],
  2: [],
  3: [],
  4: [],
  7: [],
  8: [],
  9: [],
};

window.addEventListener("resize", () => {
  dim.width = window.innerWidth;
  dim.height = window.innerHeight;

  camera.aspect = dim.width / dim.height;
  camera.updateProjectionMatrix();

  localToCameraAxesPlacement = new THREE.Vector3(0, 0, -2);

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
camera.rotation.setFromVector3(cameraDirection, camera.rotation.order);
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
const wireMaterial = new THREE.MeshStandardMaterial({
  color: 0xbebebe,
  roughness: 0.7,
  metalness: 0.35,
  flatShading: false,
  polygonOffset: true,
  polygonOffsetFactor: 1,
  polygonOffsetUnits: 1,
});
const meshLoader = new GLTFLoader();
meshLoader.load(
  "../models/wiregib.gltf",
  (gltf) => {
    // Although scene has only one element usually, it may have a Light, Camera etc.,
    // that I may not remember to remove (when updating mesh).
    rock = gltf.scene;
    rock.traverse((node) => {
      if (!node.isMesh) return;
      node.material = wireMaterial;
    });

    rockGroup = new THREE.Group();
    rockGroup.add(rock.children[0]);

    scene.add(rockGroup);

    // Now the stops can be projected onto the terrain, since the mesh is loaded.
    projectStops();

    // routePath();
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
controls.addEventListener("change", () => renderer.render(scene, camera));

camera.updateProjectionMatrix();

// Bus Stop LLTP
var stopsRaw = Object.values(stopData)[0].routes;
var stops = new THREE.Group();
var curves = new THREE.Group();
var downRay = new THREE.Raycaster();

function projectStops() {
  for (var route of busIDs) {
    var routeStops = new THREE.Group();
    var routeCurves = new THREE.Group();
    var stopsPos = [];
    var routeStopsRaw = stopsRaw[route];
    var routeColour = routeColours[route];
    for (var l in routeStopsRaw) {
      if (l === undefined || l.length == 0) continue;
      let stopPos = lltp(routeStopsRaw[l][0], routeStopsRaw[l][1]);

      // Find where the terrain height is at this stop, 'drop' it in place.
      let intersect, intersectOther;
      stops.updateMatrixWorld();
      downRay.set(stopPos, new THREE.Vector3(0, -1, 0));
      intersectOther = downRay.intersectObjects(stops.children, true);
      intersect = downRay.intersectObjects(rockGroup.children, true);

      if (typeof intersectOther !== "undefined" && intersectOther.length > 0) {
        // Check for existing markers at this position, if so place on top of them.
        let intersectPoint = intersectOther[0].point;
        intersectPoint.y += 2;
        stopsPos.push(intersectPoint);
      } else if (typeof intersect !== "undefined" && intersect.length > 0) {
        // If not, place on ground.
        let intersectPoint = intersect[0].point;
        intersectPoint.y += 3;
        stopsPos.push(intersectPoint);
      } else continue;
    }
    for (var p = 0; p < stopsPos.length; p++) {
      var stopSphere = new THREE.Mesh(
        new THREE.SphereGeometry(8, 8, 6),
        new THREE.MeshBasicMaterial({ color: routeColour })
      );
      stopSphere.position.copy(stopsPos[p]);
      stopSphere.name = "stop";
      routeStops.add(stopSphere);

      // Create bezier curves between stops.
      var curve = new THREE.CurvePath();
      if (p == Object.keys(stopsPos).length - 1) {
        // If last stop, join with first.
        curve = bezierPath(stopsPos[p], stopsPos[0]);
      } else {
        curve = bezierPath(stopsPos[p], stopsPos[p + 1]);
      }

      var curveMaterial = new THREE.LineDashedMaterial({
        color: routeColour,
        linewidth: 1,
        scale: 1,
        dashSize: 8,
        gapSize: 8,
        onBeforeCompile: (shader) => {
          shader.uniforms.time = uniforms.time;
          shader.fragmentShader = `
            uniform float time;
            ${shader.fragmentShader}
          `.replace("vLineDistance,", "vLineDistance - ( 14.0 * time ),");
        },
      });
      var curvePoints = curve.getPoints(10);
      var curveGeometry = new THREE.BufferGeometry().setFromPoints(curvePoints);
      var curvedLine = new THREE.Line(curveGeometry, curveMaterial);
      routeCurves.add(curvedLine);
      curvedLine.computeLineDistances();
    }
    routeStops.name = "r" + route + "_stops";
    stops.add(routeStops);
    curves.add(routeCurves);
  }
  stops.name = "stops";
  scene.add(stops);
  scene.add(curves);
}

function bezierPath(start, end) {
  var distance = Math.hypot(start.x - end.x, start.z - end.z);
  var height = Math.max(start.y, end.y) + 10 + distance / 8;
  var midpoint = new THREE.Vector3(
    (start.x + end.x) / 2,
    height,
    (start.z + end.z) / 2
  );
  var curve = new THREE.QuadraticBezierCurve3(start, midpoint, end);
  var curvePath = new THREE.CurvePath();
  curvePath.add(curve);
  return curvePath;
}

function fetchBusData() {
  var baseUrl = proxyURL + "https://track.bus.gi/busTracker.php?id=";
  var busStopIDs = {};
  var fetches = [];
  for (var i of busIDs) {
    const ii = i; // Seems to 'forget' which index we are on if not stored
    var url = baseUrl + ii;
    fetches.push(
      fetch(url, { "Content-Type": "text/plain" })
        .then((response) => {
          return response.text();
        })
        .then((html) => {
          var parser = new DOMParser();
          var document = parser.parseFromString(html, "text/html");
          var stopRegex = /R\d\/c(\d{1,2}a?)\.png/;
          var imageIDs = [];
          var images = Array.prototype.slice.call(
            document.getElementsByTagName("img")
          );
          images.forEach((image) => {
            let src = image.src;
            if (src.includes("background")) {
              return; // Skip background image for each route
            } else {
              let match = stopRegex.exec(src);
              if (match) {
                imageIDs.push(match[1]);
              }
            }
          });
          busStopIDs[ii] = imageIDs;
        })
    );
  }

  // Wait for all fetches to complete before continuing
  Promise.all(fetches).then(() => {
    // check if dict is same as previous dict:
    if (JSON.stringify(busStopIDs) == JSON.stringify(lastStopIDs)) {
      return;
    } else {
      lastStopIDs = busStopIDs;
      getBuses(stopIDToCoords(busStopIDs));
    }
  });

  setTimeout(fetchBusData, 10000);
}

function stopIDToCoords(busStopIDs) {
  var busStopCoords = {
    1: [],
    2: [],
    3: [],
    4: [],
    7: [],
    8: [],
    9: [],
  };
  for (var i of busIDs) {
    var routeStopIDs = busStopIDs[i];
    var routeStopCoords = [];
    for (var j = 0; j < routeStopIDs.length; j++) {
      var stopID = routeStopIDs[j];
      var between = false;

      if (stopID.endsWith("a")) {
        between = true;
        stopID = stopID.slice(0, -1);
      }
      var stopCoords = Object.values(stopData)[0].routes[i][stopID - 1];
      routeStopCoords.push(stopCoords); // TODO: get correct stop, get midpoint if between
    }
    busStopCoords[i] = routeStopCoords;
  }
  return busStopCoords;
}

function getBuses(busData) {
  // (TESTING) Get buses from dict if any changes.

  // Clear last 'frame'
  scene.remove(scene.getObjectByName("lastBuses"));

  var allBuses = new THREE.Group();
  for (var i of busIDs) {
    var buses = new THREE.Group();
    var busesPos = [];
    var routeBusData = busData[i];
    for (var b = 0; b < routeBusData.length; b++) {
      if (routeBusData[b] === undefined || routeBusData[b].length == 0)
        continue;
      let busPos = lltp(routeBusData[b][0], routeBusData[b][1]);

      // Need to know if other objects in the way
      allBuses.updateMatrixWorld();
      downRay.set(busPos, new THREE.Vector3(0, -1, 0));

      let intersectOther = downRay.intersectObjects(allBuses.children, true);
      let intersect = downRay.intersectObjects(scene.children, true);

      if (typeof intersectOther !== "undefined" && intersectOther.length > 0) {
        // Check for existing buses at this position MAYBE
        let intersectPoint = intersectOther[0].point;
        intersectPoint.y += 0;
        busesPos.push(intersectPoint);
      } else if (typeof intersect !== "undefined" && intersect.length > 0) {
        // If not, place above stops
        let intersectPoint = intersect[0].point;
        intersectPoint.y += 60;
        busesPos.push(intersectPoint);
      } else continue;
    }
    for (var p = 0; p < busesPos.length; p++) {
      var aBus = bus(i);
      aBus.position.copy(busesPos[p]);
      aBus.name = "bus";
      buses.add(aBus);
    }
    buses.name = "r" + i + "_buses";
    allBuses.add(buses);
  }
  allBuses.name = "lastBuses";
  scene.add(allBuses);
}

function bus(route) {
  // Create a bus.
  var busGeometry = new THREE.ConeGeometry(10, 44, 4);
  var busMaterial = new THREE.MeshBasicMaterial({ color: routeColours[route] });
  var bus = new THREE.Mesh(busGeometry, busMaterial);
  bus.rotation.x = Math.PI;
  return bus;
}

function routePath() {
  // (TESTING) Read data from file, join coordinates and create a detailled road path for each route.
  var routePaths = new THREE.Group();
  var routePathsRaw = Object.values(routePathData)[0].features;

  for (var i = 0; i < routePathsRaw.length; i++) {
    var routePath = routePathsRaw[i];
    var routePathGeoData = routePath.geometry.coordinates;
    var routeColour = parseInt(routePath.properties.colour, 16);
    var routePathGeometry = new THREE.BufferGeometry();
    var points = [];

    // for each pair of coordinates, create a line
    for (const pairGroup of routePathGeoData) {
      for (const pair of pairGroup) {
        let point = lltp(pair[1], pair[0]);
        points.push(point);
      }
    }

    routePathGeometry.setFromPoints(points);
    var routePathMaterial = new THREE.LineBasicMaterial({
      color: new THREE.Color(routeColour),
      linewidth: 1,
    });

    var routePathMesh = new THREE.Line(routePathGeometry, routePathMaterial);
    routePaths.add(routePathMesh);
  }

  scene.add(routePaths);
}

// Lighting
var ambientLight = new THREE.AmbientLight(0xffffff, 1.1);
var dirLight = new THREE.DirectionalLight(0x9999ff, 0.5);
var dirLight2 = new THREE.DirectionalLight(0xff9999, 0.5);
var dirLightTarget = new THREE.Object3D();
var dirLightTarget2 = new THREE.Object3D();
var pointLight = new THREE.PointLight(0xffffff, 0.3, 0, 0.3);

dirLight.position.set(250, 120, 1640);
dirLight.castShadow = true;
dirLightTarget.position.set(100, 120, -910);
dirLight.target = dirLightTarget;

dirLight2.position.set(20, 120, -1670);
dirLight2.castShadow = true;
dirLightTarget2.position.set(450, 120, 500);
dirLight2.target = dirLightTarget2;

pointLight.position.set(-550, 400, 100);

scene.add(
  ambientLight,
  dirLight,
  dirLightTarget,
  dirLight2,
  dirLightTarget2,
  pointLight
);

// Coordinate Debug Info
// var raycaster = new THREE.Raycaster();
// var mouse = new THREE.Vector2();

// document.addEventListener(
//   "click",
//   (event) => {
//     mouse.x = (event.clientX / dim.width) * 2 - 1;
//     mouse.y = -(event.clientY / dim.height) * 2 + 1;
//     // console.log(mouse)

//     raycaster.setFromCamera(mouse, camera);
//     var intersects = raycaster.intersectObjects(rockGroup.children);
//     if (intersects.length > 0) {
//       console.log(intersects[0].point);
//       // dirLightTarget.position.copy(intersects[0].point);
//     }
//   },
//   false
// );

var localToCameraAxesPlacement = new THREE.Vector3(0, 0, -2);
var axesHelper = new THREE.AxesHelper(0.2);
// scene.add(axesHelper);

// Clock for some animation
var clock = new THREE.Clock();

// Start fetching bus data from server
fetchBusData();

// Main Loop
const loop = () => {
  // Tick
  uniforms.time.value = clock.getElapsedTime();

  var axesPlacement = camera.localToWorld(localToCameraAxesPlacement.clone());
  axesHelper.position.copy(axesPlacement);

  renderer.render(scene, camera);
  requestAnimationFrame(loop);
};
loop();
