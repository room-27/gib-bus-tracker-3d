import { Vector3 } from "three";

// Latitude and Longitude to Position
const ZSpan = 3468.040161;
const XSpan = 1800.200012;
const ZMin = -1768.0;
const XMin = -906.093262;

// At min Z and X:
const latMax = 36.1550356;
const lonMin = -5.3674072;

// At max Z and X:
const latMin = 36.1089305;
const lonMax = -5.3376496;

export function lltp(lat, lon) {
  // Linear mapping to bounds, as area is small enough
  var z = ZMin + ZSpan + ((lat - latMin) / (latMin - latMax)) * ZSpan;
  var x = XMin + ((lon - lonMin) / (lonMax - lonMin)) * XSpan;
  // Start above all the terrain before using for downwards raycast
  return new Vector3(x, 200, z);
}
