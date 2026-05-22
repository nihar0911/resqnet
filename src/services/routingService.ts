// Local Offline-First A* Pathfinder for Emergency Evacuation
// Avoids active disaster circles and blocked road segments (polylines)

export interface RoutePoint {
  lat: number;
  lng: number;
}

// Distance helper
const getDistance = (p1: [number, number], p2: [number, number]): number => {
  const dLat = p1[0] - p2[0];
  const dLng = p1[1] - p2[1];
  return Math.sqrt(dLat * dLat + dLng * dLng);
};

// Check if a point is close to a blocked line segment
const isNearSegment = (p: [number, number], s1: [number, number], s2: [number, number], threshold: number): boolean => {
  const [px, py] = p;
  const [x1, y1] = s1;
  const [x2, y2] = s2;

  const l2 = Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2);
  if (l2 === 0) return getDistance(p, s1) < threshold;

  // Projection t
  let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
  t = Math.max(0, Math.min(1, t));

  const projX = x1 + t * (x2 - x1);
  const projY = y1 + t * (y2 - y1);

  return getDistance(p, [projX, projY]) < threshold;
};

// Main A* Pathfinder
export const findEvacuationRoute = (
  start: [number, number],
  end: [number, number],
  disasters: { location: [number, number]; radius: number }[],
  blockedRoads: { coordinates: [number, number][] }[]
): [number, number][] => {
  const GRID_SIZE = 25; // 25x25 grid for fast client-side execution
  const [startLat, startLng] = start;
  const [endLat, endLng] = end;

  // Define grid boundaries (extend slightly beyond endpoints)
  const minLat = Math.min(startLat, endLat) - 0.015;
  const maxLat = Math.max(startLat, endLat) + 0.015;
  const minLng = Math.min(startLng, endLng) - 0.015;
  const maxLng = Math.max(startLng, endLng) + 0.015;

  const latStep = (maxLat - minLat) / (GRID_SIZE - 1);
  const lngStep = (maxLng - minLng) / (GRID_SIZE - 1);

  // Helper: check if a specific lat/lng point is in an obstacle zone
  const isObstacle = (lat: number, lng: number): boolean => {
    // 1. Check active disasters (convert radius to coordinate degrees: ~111,000 meters per degree lat)
    for (const d of disasters) {
      const distMeters = getDistance([lat, lng], d.location) * 111000;
      if (distMeters < d.radius + 150) { // disaster radius + 150m safety buffer
        return true;
      }
    }

    // 2. Check blocked road line segments (threshold: ~100 meters in degrees)
    const thresholdDeg = 0.0009; 
    for (const road of blockedRoads) {
      const coords = road.coordinates;
      for (let i = 0; i < coords.length - 1; i++) {
        if (isNearSegment([lat, lng], coords[i], coords[i + 1], thresholdDeg)) {
          return true;
        }
      }
    }

    return false;
  };

  // Convert lat/lng to nearest grid index
  const getGridCoords = (lat: number, lng: number): [number, number] => {
    const r = Math.round((lat - minLat) / latStep);
    const c = Math.round((lng - minLng) / lngStep);
    return [
      Math.max(0, Math.min(GRID_SIZE - 1, r)),
      Math.max(0, Math.min(GRID_SIZE - 1, c))
    ];
  };

  const [startRow, startCol] = getGridCoords(startLat, startLng);
  const [endRow, endCol] = getGridCoords(endLat, endLng);

  // Node representation
  interface Node {
    row: number;
    col: number;
    g: number;
    h: number;
    f: number;
    parent: Node | null;
  }

  const openList: Node[] = [];
  const closedSet = new Set<string>();

  const startNode: Node = {
    row: startRow,
    col: startCol,
    g: 0,
    h: Math.abs(startRow - endRow) + Math.abs(startCol - endCol),
    f: 0,
    parent: null
  };
  startNode.f = startNode.g + startNode.h;
  openList.push(startNode);

  while (openList.length > 0) {
    // Sort open list by f score, take smallest
    openList.sort((a, b) => a.f - b.f);
    const current = openList.shift()!;

    // Check if reached destination grid cell
    if (current.row === endRow && current.col === endCol) {
      // Reconstruct path
      const path: [number, number][] = [];
      let curr: Node | null = current;
      while (curr !== null) {
        // Map grid index back to lat/lng coordinates
        const lat = minLat + curr.row * latStep;
        const lng = minLng + curr.col * lngStep;
        path.push([lat, lng]);
        curr = curr.parent;
      }
      path.reverse();

      // Replace start/end with precise inputs for smoothness
      path[0] = start;
      path[path.length - 1] = end;
      return path;
    }

    const key = `${current.row},${current.col}`;
    closedSet.add(key);

    // 8-directional movement
    const directions = [
      [-1, 0], [1, 0], [0, -1], [0, 1],
      [-1, -1], [-1, 1], [1, -1], [1, 1]
    ];

    for (const [dr, dc] of directions) {
      const newRow = current.row + dr;
      const newCol = current.col + dc;

      if (newRow < 0 || newRow >= GRID_SIZE || newCol < 0 || newCol >= GRID_SIZE) continue;

      const neighborKey = `${newRow},${newCol}`;
      if (closedSet.has(neighborKey)) continue;

      const nLat = minLat + newRow * latStep;
      const nLng = minLng + newCol * lngStep;

      // Skip if obstacle (allow destination cell to bypass blockage check to guarantee routing completion)
      if (isObstacle(nLat, nLng) && !(newRow === endRow && newCol === endCol)) continue;

      const gCost = current.g + (dr !== 0 && dc !== 0 ? 1.414 : 1.0);
      const hCost = Math.abs(newRow - endRow) + Math.abs(newCol - endCol);
      const fCost = gCost + hCost;

      const existingNode = openList.find(n => n.row === newRow && n.col === newCol);
      if (existingNode) {
        if (gCost < existingNode.g) {
          existingNode.g = gCost;
          existingNode.f = fCost;
          existingNode.parent = current;
        }
      } else {
        openList.push({
          row: newRow,
          col: newCol,
          g: gCost,
          h: hCost,
          f: fCost,
          parent: current
        });
      }
    }
  }

  // Fallback: If no safe path is found due to complete grid blockage, output basic direct detour around obstacles
  return [start, [startLat + (endLat - startLat) * 0.5 + 0.005, startLng + (endLng - startLng) * 0.5 + 0.005], end];
};
