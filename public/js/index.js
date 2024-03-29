import * as THREE from "three";
import { OrbitControls } from "OrbitControls";
import { GLTFLoader } from "GLTFLoader";
import { ConvexGeometry } from "ConvexGeometry";
import { MeshPhongMaterial } from "three";
import { lltp } from "LLTP";
import * as stopData from "../data/stops.json" assert { type: "json" };
// import * as routePathData from "../data/routePathData.json" assert { type: "json" };
import * as timingsData from "../data/timings.json" assert {type: "json"};

const dim = {
  width: window.innerWidth,
  height: window.innerHeight,
};

const busIDs = ["1", "2", "3", "4", "7", "8S", "9"];

const routeColours = {
  1: 0x12A321,
  2: 0xFAA11F,
  3: 0xED008C,
  4: 0x276BB4,
  7: 0x6D6E72,
  "8S": 0x000000,
  9: 0x009EDF,
};

const busColours = {
  1: 0x129325,
  2: 0xFA9105,
  3: 0xEE309F,
  4: 0x1F5BA0,
  7: 0x4A4A4B,
  "8S": 0x111111,
  9: 0x008EBF,
};

const uniforms = {
  time: { value: 0 },
};

const proxyURL = "/proxy/";

// Settings
var BUS_GLOW = true;
var TABLE_SHOWN = false;
var SIDEBAR_SHOWN = false;
var TABLE_ID = 0;
var TABLE_VARIANT = 0; // For type of table, initially weekdays
var CURRENT_MODEL; // Will be set later

// Globally store last fetched stops
var lastStopIDs = {
  1: [],
  2: [],
  3: [],
  4: [],
  7: [],
  "8S": [],
  9: [],
};

window.addEventListener("resize", () => {
  dim.width = window.innerWidth;
  dim.height = window.innerHeight;

  camera.aspect = dim.width / dim.height;
  camera.updateProjectionMatrix();

  //localToCameraAxesPlacement = new THREE.Vector3(0.45 * camera.aspect, -0.45, -2);

  renderer.setSize(dim.width, dim.height);
});

// Create the scene
const scene = new THREE.Scene();

// Create the camera
const camera = new THREE.PerspectiveCamera(
  70,
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

// Globally store stop positions once loaded
var stopPositions = { 1: {}, 2: {}, 3: {}, 4: {}, 7: {}, "8S": {}, 9: {} };

// Load Mesh
var rock, rockGroup;
const rockMaterial = new THREE.MeshStandardMaterial({
  color: 0xC1C1C1,
  roughness: 0.7,
  metalness: 0.35,
  flatShading: false,
  polygonOffset: true,
  polygonOffsetFactor: 1,
  polygonOffsetUnits: 1,
});
const meshLoader = new GLTFLoader();

const POSSIBLY_MOBILE = dim.height / dim.width > 1.0

function loadModel(modelPath) {
  // Put up loading overlay
  let loadingScreen = document.getElementById("loading");
  loadingScreen.classList.add("shown");

  meshLoader.load(
    modelPath,
    (gltf) => {
      // Clear last model
      if (typeof rock !== "undefined" && typeof rock.parent !== "undefined") {
        rockGroup.traverse((node) => {
          if (node.isMesh) node.geometry.dispose();
          rockGroup.remove(node);
        });

        scene.remove(rockGroup);
        scene.remove(stops);
      }
      
      // Although scene has only one element usually, it may have a Light, Camera etc.,
      // that I may not remember to remove (when updating mesh).
      rock = gltf.scene;
      rock.traverse((node) => {
        if (!node.isMesh) return;
        node.material = rockMaterial;
      });
      
      rockGroup = new THREE.Group();
      rockGroup.add(rock.children[0]);
      
      scene.add(rockGroup);
      
      // Project the paths on the rock mesh
      // routePath();
      
      // Now the stops can be projected onto the terrain, since the mesh is loaded.
      stops = new THREE.Group();
      stopPositions = projectStops();
      drawLinks(stopPositions, undefined);

      // Take down loading overlay
      loadingScreen.classList.remove("shown");
    },
    (xhr) => {
      // Progress indicator
      // Only ever 100% as one file is loaded. Temporarily disabled due to console spam.
      //console.log(`${((xhr.loaded / xhr.total) * 100).toFixed(2)}% loaded`);
    },
    (error) => {
      console.error(error);
      loadingScreen.classList.remove("shown");
    }
  );
}

// Only render smaller model on (assumed) mobile device load
if (POSSIBLY_MOBILE) {
  CURRENT_MODEL = "flat";
  loadModel("../models/wiregibflat.gltf");
} else {
  CURRENT_MODEL = "topological";
  loadModel("../models/wiregib.gltf");
  document.getElementById("modelToggle").classList.add("toggleEnabled");
}

// Renderer
const canvas = document.getElementsByClassName("webgl")[0];

const renderer = new THREE.WebGLRenderer({
  canvas: canvas,
  // Disable antialiasing if device is portrait
  antialias: !POSSIBLY_MOBILE,
});
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(dim.width, dim.height);
renderer.setClearColor(0x000000, 0.0);

// Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.addEventListener("change", () => renderer.render(scene, camera));

const cameraTarget = cameraStart.add(cameraDirection.multiplyScalar(100)); // Add direction vector to start to obtain a point in this direction to target
camera.updateProjectionMatrix();

// Bus Stop LLTP
const stopsRaw = Object.values(stopData)[0].routes;
var stops = new THREE.Group();
var downRay = new THREE.Raycaster();

function projectStops() {
  var allStops = {};

  for (const route of busIDs) {
    var routeStops = new THREE.Group();
    var stopsEntries = [];
    var routeStopsRaw = stopsRaw[route];
    var routeColour = routeColours[route];

    stops.updateMatrixWorld();
    for (var shelter in routeStopsRaw) {
      if (typeof shelter === "undefined" || shelter == {}) continue;
      var stopPos = lltp(routeStopsRaw[shelter].coords[0], routeStopsRaw[shelter].coords[1]);
      var stopName = routeStopsRaw[shelter].name;

      // Find where the terrain height is at this stop, 'drop' it in place.
      var intersect, intersectOther;
      downRay.set(stopPos, new THREE.Vector3(0, -1, 0));
      intersectOther = downRay.intersectObjects(stops.children, true);
      intersect = downRay.intersectObjects(rockGroup.children, true);

      if (typeof intersectOther !== "undefined" && intersectOther.length > 0) {
        // Check for existing markers (of previous routes) at this position, if so place on top of them.
        let intersectPoint = intersectOther[0].point;
        intersectPoint.y += 2;
        stopsEntries.push({pos: intersectPoint, name: stopName});
      } else if (typeof intersect !== "undefined" && intersect.length > 0) {
        // If not, place on ground.
        let intersectPoint = intersect[0].point;
        intersectPoint.y += 3;
        stopsEntries.push({pos: intersectPoint, name: stopName});
      } else continue;
    }
    var alreadyAdded = [];
    for (var p = 0; p < stopsEntries.length; p++) {
      var position = stopsEntries[p].pos;

      // Check if the sphere has already been added (on this route), then skip creating it.
      // Had to compare a unique property as object comparison is messy
      if (alreadyAdded.some(obj => obj.x == position.x)) {
        continue;
      }
      
      var stopSphere = new THREE.Mesh(
        new THREE.SphereGeometry(8, 8, 6),
        new THREE.MeshBasicMaterial({ color: routeColour })
      );
      stopSphere.position.copy(position);
      stopSphere.name = "stop_" + route + "_" + p;
      stopSphere.userData = {
        name: stopsEntries[p].name,
        id: p,
      }
      alreadyAdded.push(position);
      routeStops.add(stopSphere);
    }
    allStops[route] = stopsEntries;
    routeStops.name = "r" + route + "_stops";
    stops.add(routeStops);
  }
  stops.name = "stops";
  scene.add(stops);
  return allStops;
}

function drawLinks(stopsPos, busData) {
  // Clear last frame (else they keep stacking up)
  scene.remove(scene.getObjectByName("lastLinks"));
  var allCurves = new THREE.Group();

  for (const route of busIDs) {
    var routeCurves = new THREE.Group();
    var routeStops = stopsPos[route].map(
      shelter => shelter.pos
    );
    var routeColour = routeColours[route];
    var routeBusData;
    var curveMaterial = dashedCurveMaterial(routeColour);

    if (typeof busData !== "undefined") {
      // Change material to 'slower' dashes if no buses on route
      routeBusData = busData[route];
      if (routeBusData.data.length == 0) {
        curveMaterial = noBusCurveMaterial(routeColour);
      }
    }

    for (var p = 0; p < routeStops.length; p++) {
      // Create bezier curves between stops.
      var curve = new THREE.CurvePath();
      let routeLength = routeStops.length;
      if (p == routeLength - 1) {
        // If last stop, join with first.
        curve = bezierPath(routeStops[p], routeStops[0]);
      } else {
        curve = bezierPath(routeStops[p], routeStops[p + 1]);
      }

      var curvePoints = curve.getPoints(10);
      var curveGeometry = new THREE.BufferGeometry().setFromPoints(curvePoints);
      var curvedLine = new THREE.Line(curveGeometry, curveMaterial);
      curvedLine.name = "link_" + route + "_" + p;
      curvedLine.computeLineDistances();
      routeCurves.add(curvedLine);
    }
    routeCurves.name = "r" + route + "_links";
    allCurves.add(routeCurves);
  }
  allCurves.name = "lastLinks";
  scene.add(allCurves);
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
  for (let i of busIDs) {
    var url = baseUrl + i;
    fetches.push(
      fetch(url, { "Content-Type": "text/plain" })
        .then((response) => {
          return response.text();
        })
        .then((html) => {
          var parser = new DOMParser();
          var document = parser.parseFromString(html, "text/html");
          var stopRegex = /R\dS?\/c(\d{1,2}a?)\.png/;
          var imageIDs = [];
          var images = Array.prototype.slice.call(
            document.getElementsByTagName("img")
          );
          images.forEach((image) => {
            var src = image.src;
            if (src.includes("background")) {
              return; // Skip background image for each route
            } else {
              let match = stopRegex.exec(src);
              if (match) {
                imageIDs.push(match[1]);
              }
            }
          });
          busStopIDs[i] = imageIDs;
        })
    );
  }

  // Wait for all fetches to complete before continuing
  Promise.all(fetches).then(() => {
    // Check if dict is same as previous dict, if so then we're done:
    var busData = stopIDToCoords(busStopIDs);
    drawLinks(stopPositions, busData);
    if (JSON.stringify(busStopIDs) == JSON.stringify(lastStopIDs)) {
      return;
    } else {
      lastStopIDs = busStopIDs;
      getBuses(busData);
    }
  });
  setTimeout(fetchBusData, 10000);
}

function stopIDToCoords(busStopIDs) {
  var busData = {};

  for (var route of busIDs) {
    var routeStopIDs = busStopIDs[route];
    var routeStopCoords = [];
    var routeLinkData = [];

    for (var j = 0; j < routeStopIDs.length; j++) {
      var stopID = routeStopIDs[j];
      var between = false;

      if (stopID.endsWith("a")) {
        between = true;
        stopID = stopID.slice(0, -1);
      }

      var routeStopsData = Object.values(stopData)[0].routes[route];
      var stopCoords = routeStopsData[stopID - 1].coords;
      var stopName = routeStopsData[stopID - 1].name;
      var stopNameNext;
      if (between) {
        // Get two pairs of coordinates, find midpoint
        let a, b;
        a = routeStopsData[stopID - 1].coords;
        if (stopID == routeStopsData.length) {
          // stopID is 1-indexed, if bus passed last stop, 'next' stop would be the first stop
          b = routeStopsData[0].coords;
          stopNameNext = routeStopsData[0].name;
        } else {
          b = routeStopsData[stopID].coords;
          stopNameNext = routeStopsData[stopID].name;
        }
        // Arithmetic mean is approximately correct for negligible curvature, overwrite coords
        stopCoords = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      }
      routeStopCoords.push(stopCoords);
      routeLinkData.push({
        id: stopID,
        between: between,
        name: stopName,
        nameNext: stopNameNext,
      });
    }
    busData[route] = {
      coords: routeStopCoords,
      data: routeLinkData,
    };
  }
  return busData;
}

// Make buses globally accessible
var allBuses = new THREE.Group();

function getBuses(busData) {
  // Get buses from dict if any changes.

  // Clear last 'frame'
  scene.remove(allBuses);

  allBuses = new THREE.Group();

  for (var route of busIDs) {
    var buses = new THREE.Group();
    var busesPos = [];
    var routeBusCoords = busData[route].coords;
    var routeBusData = busData[route].data;

    for (var b = 0; b < routeBusCoords.length; b++) {
      if (typeof routeBusCoords[b] === "undefined" || routeBusCoords[b].length == 0)
        continue;
      var busPos = lltp(routeBusCoords[b][0], routeBusCoords[b][1]);

      // Need to know if other objects in the way
      allBuses.updateMatrixWorld();
      downRay.set(busPos, new THREE.Vector3(0, -1, 0));

      var intersectOther = downRay.intersectObjects(allBuses.children, true);
      var intersect = downRay.intersectObjects(scene.children, true);

      if (typeof intersectOther !== "undefined" && intersectOther.length > 0) {
        // Check for existing buses at this position MAYBE
        let intersectPoint = intersectOther[0].point;
        intersectPoint.y += 6;
        busesPos.push(intersectPoint);
      } else if (typeof intersect !== "undefined" && intersect.length > 0) {
        // If not, place above stops
        let intersectPoint = intersect[0].point;
        intersectPoint.y += 45;
        busesPos.push(intersectPoint);
      } else continue;
    }
    for (var p = 0; p < busesPos.length; p++) {
      var aBus = createBus(route);
      aBus.position.copy(busesPos[p]);

      // Get direction from here to the next stop
      const routeStopPositions = stopPositions[route].map(_ => _.pos);
      var dir = 0;
      if (routeBusData[p].id == routeStopPositions.length) {
        // If on last stop on route
        let p0 = routeStopPositions[parseInt(routeBusData[p].id) - 1];
        let p1 = routeStopPositions[0];
        dir = Math.atan2(p1.z - p0.z, p1.x - p0.x);
      } else {
        let p0 = routeStopPositions[parseInt(routeBusData[p].id) - 1];
        let p1 = routeStopPositions[parseInt(routeBusData[p].id)];
        dir = Math.atan2(p1.z - p0.z, p1.x - p0.x);
      }
      // Set rotation about y-axis, account for original dir not aligning with 'pointing' dir
      aBus.rotation.y = Math.PI - dir;
      aBus.name = "bus"
      // Store id, name, nameNext and between in object
      aBus.userData = routeBusData[p];
      buses.add(aBus);
    }
    buses.name = "r" + route + "_buses";
    allBuses.add(buses);
  }
  allBuses.name = "lastBuses";
  scene.add(allBuses);
}

function createBus(route) {
  // Create a bus and point light

  const busPoints = [
    new THREE.Vector3(-6, -6, -6),
    new THREE.Vector3(-14, 0, 0),
    new THREE.Vector3(-6, -6, 6),
    new THREE.Vector3(-6, 6, -6),
    new THREE.Vector3(-6, 6, 6),
    new THREE.Vector3(6, -6, -6),
    new THREE.Vector3(6, -6, 6),
    new THREE.Vector3(6, 6, -6),
    new THREE.Vector3(6, 6, 6),
  ];
  var busGeometry = new ConvexGeometry(busPoints);

  var busMaterial = new MeshPhongMaterial({})
  if (!POSSIBLY_MOBILE) {
    busMaterial = busMaterialFancy.clone();
    busMaterial.emissive = new THREE.Color(routeColours[route]);
  }
  busMaterial.color = new THREE.Color(busColours[route]);

  const bus = new THREE.Group();
  var busMesh = new THREE.Mesh(busGeometry, busMaterial);
  var busGlow = new THREE.PointLight(routeColours[route], 1.0, 120);
  
  busGlow.name = "busglow";
  busGlow.position.set(0, 0, 0);

  // Depending on setting, this will disable/enable bus lights by toggling visibility
  // On "mobile" devices, wait until scene redraw before choosing to add lights back or not (can still toggle if present on last refresh)
  if (BUS_GLOW) {
    bus.add(busGlow);
  } else {
    busGlow.intensity = 0.0;
    if (!POSSIBLY_MOBILE) bus.add(busGlow);
  }

  bus.add(busMesh);
  return bus;
}

function routePath() {
  // (TESTING) Read data from file, join coordinates and create a detailed road path for each route.
  var routePaths = new THREE.Group();
  var routePathsRaw = Object.values(routePathData)[0].features;
  var downRay = new THREE.Raycaster();

  for (var i = 0; i < routePathsRaw.length; i++) {
    var routePath = routePathsRaw[i];
    var routePathGeoData = routePath.geometry.coordinates;
    var routeColour = parseInt(routePath.properties.colour, 16);
    var routePathGeometry = new THREE.BufferGeometry();
    var points = [];

    // for each pair of coordinates, create a line
    for (const pairGroup of routePathGeoData) {
      var point;
      var intersect;
      for (const pair of pairGroup) {
        point = lltp(pair[1], pair[0]);
        downRay.set(point, new THREE.Vector3(0, -1, 0));
        intersect = downRay.intersectObjects(rockGroup.children, true);
        points.push(intersect[0].point);
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
const ambientLight = new THREE.AmbientLight(0xFFFFFF, 1.1);
var dirLight = new THREE.DirectionalLight(0x9999FF, 0.5);
var dirLight2 = new THREE.DirectionalLight(0xFF9999, 0.5);
var dirLightTarget = new THREE.Object3D();
var dirLightTarget2 = new THREE.Object3D();
var pointLight = new THREE.PointLight(0xFFFFFF, 0.3, 0, 0.3);

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

// Constant Materials
const busMaterialFancy = new THREE.MeshPhongMaterial({
  transparent: true,
  opacity: 0.9,
  emissiveIntensity: 0.2,
  specular: 0x333333,
  shininess: 40,
});
const dashedCurveMaterial = (lineCol) => {
  return new THREE.LineDashedMaterial({
    color: lineCol,
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
};
const noBusCurveMaterial = (lineCol) => {
  return new THREE.LineDashedMaterial({
    color: lineCol,
    linewidth: 1,
    scale: 1,
    dashSize: 4,
    gapSize: 12,
  });
};

///Coordinate Debug Info
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

// var localToCameraAxesPlacement = new THREE.Vector3(0.45 * camera.aspect, -0.45, -2);
// const axesHelper = new THREE.AxesHelper(0.2);
// scene.add(axesHelper);

// Compass
const compass = document.getElementById("compass");
var compassDirection = new THREE.Vector3();
var compassSpherical = new THREE.Spherical();

// Clock for some animation
const clock = new THREE.Clock();

// Start fetching bus data from server
fetchBusData();

// Object selection via raycasting
var mousecaster = new THREE.Raycaster();
renderer.domElement.addEventListener("click", mousecast, false);

var _mouse = {x: 0, y: 0};
var selectedPos;
var selectedObject;

function mousecast(event) {
  
  var rect = renderer.domElement.getBoundingClientRect();
  _mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  _mouse.y = - ((event.clientY - rect.top) / rect.height) * 2 + 1;

  mousecaster.setFromCamera(_mouse, camera);

  var intersectStops = mousecaster.intersectObjects(stops.children);
  var intersectBuses = mousecaster.intersectObjects(allBuses.children);

  if (typeof selectedObject !== "undefined") {
    selectedObject.material.color.setHex(selectedObject.material.userData.oldColor); // Revert colour change
  }

  if ((typeof intersectStops === "undefined" || intersectStops.length == 0)
   && (typeof intersectBuses === "undefined" || intersectBuses.length == 0)) {
    // Nothing we care about has been clicked
    selectedObject = undefined;

  } else if (typeof intersectBuses !== "undefined" && intersectBuses.length > 0) {
    // A bus has been clicked
    var selectedBus = intersectBuses[0];
    selectedObject = selectedBus.object;
    
    // Lighten colour upon selection
    selectedObject.material.userData.oldColor = selectedObject.material.color.getHex();
    selectedObject.material.color.set(RGB_Log_Blend(0.15, selectedObject.material.color.getStyle(), "rgb(245,255,235)"));

    // Recursive option finds the mesh part, which is child of the overall bus (with userData in it)
    displayStopInfo(selectedObject.parent.userData);

  } else {
    // A bus stop has been clicked
    var selectedStop = intersectStops[0];
    selectedPos = intersectStops[0].point;
    selectedObject = selectedStop.object;
    displayStopInfo(selectedObject.userData);

    // Lighten colour upon selection
    selectedObject.material.userData.oldColor = selectedObject.material.color.getHex();
    selectedObject.material.color.set(RGB_Log_Blend(0.3, selectedObject.material.color.getStyle(), "rgb(245,255,235)"));
  }
}

function displayStopInfo(userData) {
  if (!SIDEBAR_SHOWN) {
    let toggle = document.getElementsByClassName("navToggle")[0];
    let sidebar = document.getElementById("sidebar");
    sidebar.classList.toggle("openMenu")
    toggle.children[0].classList.toggle("rotateArrow")
    SIDEBAR_SHOWN = true;
  }

  var headerElement = document.getElementById("stopName");
  var pElement = document.getElementById("stopInfo");
  if (headerElement) {
    if (userData.between) {
      headerElement.textContent = userData.name + " → " + userData.nameNext;
    } else {
      headerElement.textContent = userData.name;
    }
  }
  if (pElement) {
    pElement.textContent = "Stop / Bus ID #" + (userData.id + 1) + "";
    // Remove?
  }
}

// GUI

function toggle_busglow() {
  // Invert last value *before* updating
  BUS_GLOW = !BUS_GLOW;

  scene.traverse((child) => {
    if (child.name == "busglow") {
      child.intensity = BUS_GLOW ? 1.0 : 0.0;
    }
  })
}

// Navbar

function initSidebarToggle() {
  var toggle = document.getElementsByClassName("navToggle")[0];
  var sidebar = document.getElementById("sidebar");
  toggle.addEventListener("click", () => {
    if (!TABLE_SHOWN) {
      SIDEBAR_SHOWN = !SIDEBAR_SHOWN;
      sidebar.classList.toggle("openMenu");
      toggle.children[0].classList.toggle("rotateArrow");
    }
  })
}

function initBusLightToggle() {
  var toggle = document.getElementById("busLightToggle");
  toggle.addEventListener("click", () => {
    if (!TABLE_SHOWN) {
      toggle_busglow();
      toggle.classList.toggle("toggleEnabled");
    }
  })
}

function initModelToggle() {
  var toggle = document.getElementById("modelToggle");
  toggle.addEventListener("click", () => {
    toggle.classList.toggle("toggleEnabled");
    // Switch between topological and flat rock models
    if (CURRENT_MODEL == "topological") {
      loadModel("../models/wiregibflat.gltf");
      CURRENT_MODEL = "flat";
    } else {
      loadModel("../models/wiregib.gltf");
      CURRENT_MODEL = "topological";
    }
  })
}

// Navigation Tabs

function initNavTabs() {
  var tabs = document.getElementsByClassName("navLink");
  for (let tab of tabs) {
    tab.addEventListener("click", (event) => {
      if (tab.classList.contains("activeNavLink")) return;
      highlightCurrentTab(tab);

      if (event.target.id == "navTabTimings") {
        TABLE_SHOWN = true;
        document.getElementById("timings").classList.add("openTimings");
        document.getElementById("sidebar").classList.add("inAnotherTab");
        return
      }
      TABLE_SHOWN = false;
      document.getElementById("timings").classList.remove("openTimings");
      document.getElementById("sidebar").classList.remove("inAnotherTab");
    })
  }
}

function initTimings() {
  drawTables(TABLE_ID, TABLE_VARIANT);
  var tableIndexButtons = [
    document.getElementById("tableIndexDown"),
    document.getElementById("tableIndexUp"),
  ];
  var tableVariantButton = document.getElementById("tableVariantToggle");

  tableIndexButtons[0].addEventListener("click", () => {
    // Keep in range of bus route list
    TABLE_ID = (TABLE_ID + 6) % 7;
    drawTables(TABLE_ID, TABLE_VARIANT);
  })
  tableIndexButtons[1].addEventListener("click", () => {
    TABLE_ID = (TABLE_ID + 1) % 7;
    drawTables(TABLE_ID, TABLE_VARIANT);
  })
  tableVariantButton.addEventListener("click", () => {
    let desc = document.getElementById("dayTypeDescriptor");
    // Toggle variant and div text
    TABLE_VARIANT = 1 - TABLE_VARIANT;
    desc.innerText = (TABLE_VARIANT == 0) ? "Monday to Friday" : "Weekends and Public Holidays"
    
    drawTables(TABLE_ID, TABLE_VARIANT);
  })
}

function highlightCurrentTab(currentTab) {
  var tabs = document.getElementsByClassName("navLink");
  for (var tab of tabs) {
    tab.classList.remove("activeNavLink");
  }
  currentTab.classList.add("activeNavLink");
}

function drawTables(id, variant) {
  const tableElements = document.getElementsByClassName("alternateRows");
  const tableData = timingsData.default.routes[busIDs[id]];
  const headerColour = new THREE.Color().set(routeColours[busIDs[id]]).getStyle();
  const colours = [
    RGB_Log_Blend(0.8, headerColour, "rgb(255,255,255)"), // Lightest
    RGB_Log_Blend(0.6, headerColour, "rgb(255,255,255)"), // Lighter
    headerColour,
  ];
  
  for (let i = 0; i < tableElements.length; i++) {
    const tableElement = tableElements[i];
    var tHeaderRow = tableElement.tHead.children[0];
    tHeaderRow.style.background = headerColour;
    var tHead = tHeaderRow.children[0]
    
    var tableDataDirectional;
    var tContents;
    
    var tBody = document.createElement("tbody");
    tableElement.replaceChild(tBody, tableElement.getElementsByTagName("tbody")[0]);

    if (typeof tableData === "undefined") {
      // May be useful when out of date, just remove from file
      tHead.innerText = "Missing Data...";
      tableElements[1].tHead.classList.add("noWayBack");
      continue;
    }
    
    // Choose direction based on selection
    if (i == 0) {
      tableDataDirectional = tableData.A_to_B;
    } else {
      if (typeof tableData.B_to_A !== "undefined") {
        tableDataDirectional = tableData.B_to_A;
        tableElement.tHead.classList.remove("noWayBack");
      } else {
        tableElement.tHead.classList.add("noWayBack");
        break;
      }
    }

    var title = tableDataDirectional.title;
    tHead.innerText = title;
    tHead.colSpan = 6;
  
    if (variant == 0) {
      tContents = tableDataDirectional.variants.weekday.rows;
    } else {
      tContents = tableDataDirectional.variants.weekend.rows;
    }
    
    tContents.forEach((row, i) => {
      var tRow = tBody.insertRow();
      tRow.style.background = colours[i % 2]; // Even rows (1-indexed) darker
      if (row.length == 1) {
        // Bypass loop, set colspan to 6
        let time = row[0];
        let tD = tRow.insertCell(0);
        tD.innerText = time;
        tD.colSpan = 6;
        return;
      }
      for (var i = 0; i < row.length; i++) {
        var time = row[i]
        var tD = tRow.insertCell(i)
        tD.innerText = time;
        if (row.length < 6 && i == row.length - 1) {
          // Allocate remaining space to last (empty) cell
          tD.colSpan = 6 - i;
        }
      }
    })
    
    tableElement.replaceChild(tBody, tableElement.getElementsByTagName("tbody")[0]);
  }
}

initSidebarToggle();
initBusLightToggle();
initModelToggle();
initNavTabs();
initTimings();

function compassPoint() {
  // Compass rotation (https://jsfiddle.net/atulmourya/tcb3rz8d/2/) and a stretch for 3D effect
  camera.getWorldDirection(compassDirection);
  compassSpherical.setFromVector3(compassDirection);
  // compassSpherical.phi is pi looking straight down, zero straight up, and pi/2 along horizon
  let stretchFactor = - Math.cos(compassSpherical.phi);
  compass.style.transform = `rotateZ(${(180 * compassSpherical.theta / Math.PI) - 180}deg)`;
  compass.parentElement.style.transform = `scaleY(${stretchFactor})`;
}

// Main Loop
const loop = () => {
  // Tick
  uniforms.time.value = clock.getElapsedTime();
  
  // AxesHelper
  // var axesPlacement = camera.localToWorld(localToCameraAxesPlacement.clone());
  // axesHelper.position.copy(axesPlacement);

  compassPoint();
  
  // Only render if on main screen
  if (!TABLE_SHOWN) renderer.render(scene, camera);

  requestAnimationFrame(loop);
};

loop();
