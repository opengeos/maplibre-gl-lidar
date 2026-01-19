import type { CrossSectionLine, ProfilePoint, ElevationProfile } from '../core/types';
import type { PointCloudData } from '../loaders/types';

/**
 * Extracts elevation profile points from point cloud data along a cross-section line.
 * Calculates distances using Haversine formula and filters points within buffer distance.
 */
export class ElevationProfileExtractor {
  private static readonly EARTH_RADIUS_M = 6371000;

  /**
   * Extracts points within the buffer distance of a cross-section line.
   *
   * @param line - The cross-section line definition
   * @param pointCloudData - The point cloud data to extract from
   * @param coordinateOrigin - The coordinate origin [lng, lat, z]
   * @returns Elevation profile with sorted points and statistics
   */
  static extract(
    line: CrossSectionLine,
    pointCloudData: PointCloudData,
    coordinateOrigin: [number, number, number]
  ): ElevationProfile {
    const points: ProfilePoint[] = [];
    const { positions, intensities, classifications, pointCount } = pointCloudData;

    // Pre-compute line properties
    const lineStart = line.start;
    const lineEnd = line.end;
    const totalDistance = this.haversineDistance(lineStart, lineEnd);

    // Line vector for projection
    const dx = lineEnd[0] - lineStart[0];
    const dy = lineEnd[1] - lineStart[1];
    const lineLengthSq = dx * dx + dy * dy;

    // Extract points within buffer
    for (let i = 0; i < pointCount; i++) {
      // Reconstruct absolute coordinates
      const lng = positions[i * 3] + coordinateOrigin[0];
      const lat = positions[i * 3 + 1] + coordinateOrigin[1];
      const elevation = positions[i * 3 + 2];

      // Calculate perpendicular distance from line
      const { distance: distanceAlongLine, offset } = this.pointToLineDistance(
        [lng, lat],
        lineStart,
        lineEnd,
        lineLengthSq,
        totalDistance
      );

      // Check if point is within buffer
      if (offset <= line.bufferDistance && distanceAlongLine >= 0 && distanceAlongLine <= totalDistance) {
        const point: ProfilePoint = {
          distance: distanceAlongLine,
          elevation,
          offsetFromLine: offset,
          longitude: lng,
          latitude: lat,
          intensity: intensities ? intensities[i] : undefined,
          classification: classifications ? classifications[i] : undefined,
        };
        points.push(point);
      }
    }

    // Sort by distance along line
    points.sort((a, b) => a.distance - b.distance);

    // Calculate statistics
    const stats = this.calculateStats(points, totalDistance);

    return {
      line,
      points,
      stats,
    };
  }

  /**
   * Calculates the Haversine distance between two WGS84 points.
   *
   * @param p1 - First point [lng, lat]
   * @param p2 - Second point [lng, lat]
   * @returns Distance in meters
   */
  static haversineDistance(p1: [number, number], p2: [number, number]): number {
    const lat1 = this.toRadians(p1[1]);
    const lat2 = this.toRadians(p2[1]);
    const dLat = this.toRadians(p2[1] - p1[1]);
    const dLng = this.toRadians(p2[0] - p1[0]);

    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1) * Math.cos(lat2) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return this.EARTH_RADIUS_M * c;
  }

  /**
   * Calculates the distance along a line and perpendicular offset from a point.
   *
   * @param point - The point [lng, lat]
   * @param lineStart - Line start [lng, lat]
   * @param lineEnd - Line end [lng, lat]
   * @param lineLengthSq - Squared length of line vector (for efficiency)
   * @param totalLineDistance - Total line distance in meters
   * @returns Distance along line (m) and perpendicular offset (m)
   */
  private static pointToLineDistance(
    point: [number, number],
    lineStart: [number, number],
    lineEnd: [number, number],
    lineLengthSq: number,
    totalLineDistance: number
  ): { distance: number; offset: number } {
    // Project point onto line using parametric form
    const dx = lineEnd[0] - lineStart[0];
    const dy = lineEnd[1] - lineStart[1];
    const px = point[0] - lineStart[0];
    const py = point[1] - lineStart[1];

    // Projection parameter t (0 = at start, 1 = at end)
    let t = (px * dx + py * dy) / lineLengthSq;
    t = Math.max(0, Math.min(1, t)); // Clamp to line segment

    // Closest point on line
    const closestLng = lineStart[0] + t * dx;
    const closestLat = lineStart[1] + t * dy;

    // Calculate distances using Haversine
    const distanceAlongLine = t * totalLineDistance;
    const offset = this.haversineDistance(point, [closestLng, closestLat]);

    return { distance: distanceAlongLine, offset };
  }

  /**
   * Calculates profile statistics.
   *
   * @param points - Profile points
   * @param totalDistance - Total line distance
   * @returns Statistics object
   */
  private static calculateStats(
    points: ProfilePoint[],
    totalDistance: number
  ): ElevationProfile['stats'] {
    if (points.length === 0) {
      return {
        minElevation: 0,
        maxElevation: 0,
        meanElevation: 0,
        totalDistance,
        pointCount: 0,
      };
    }

    let minElevation = Infinity;
    let maxElevation = -Infinity;
    let sumElevation = 0;

    for (const point of points) {
      minElevation = Math.min(minElevation, point.elevation);
      maxElevation = Math.max(maxElevation, point.elevation);
      sumElevation += point.elevation;
    }

    return {
      minElevation,
      maxElevation,
      meanElevation: sumElevation / points.length,
      totalDistance,
      pointCount: points.length,
    };
  }

  /**
   * Converts degrees to radians.
   *
   * @param degrees - Angle in degrees
   * @returns Angle in radians
   */
  private static toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  /**
   * Creates a buffer polygon around a line for visualization.
   * Returns GeoJSON coordinates for a polygon.
   *
   * @param line - The cross-section line
   * @param numPoints - Number of points for end caps
   * @returns GeoJSON polygon coordinates
   */
  static createBufferPolygon(
    line: CrossSectionLine,
    numPoints: number = 8
  ): [number, number][] {
    const [startLng, startLat] = line.start;
    const [endLng, endLat] = line.end;
    const bufferDegrees = this.metersToDegrees(line.bufferDistance, (startLat + endLat) / 2);

    // Calculate perpendicular direction
    const dx = endLng - startLng;
    const dy = endLat - startLat;
    const len = Math.sqrt(dx * dx + dy * dy);
    const perpX = -dy / len;
    const perpY = dx / len;

    const coords: [number, number][] = [];

    // Left side of line (start to end)
    coords.push([startLng + perpX * bufferDegrees, startLat + perpY * bufferDegrees]);
    coords.push([endLng + perpX * bufferDegrees, endLat + perpY * bufferDegrees]);

    // End cap (semicircle around end point)
    for (let i = 0; i <= numPoints; i++) {
      const angle = Math.atan2(perpY, perpX) - Math.PI + (Math.PI * i) / numPoints;
      coords.push([
        endLng + Math.cos(angle) * bufferDegrees,
        endLat + Math.sin(angle) * bufferDegrees,
      ]);
    }

    // Right side of line (end to start)
    coords.push([endLng - perpX * bufferDegrees, endLat - perpY * bufferDegrees]);
    coords.push([startLng - perpX * bufferDegrees, startLat - perpY * bufferDegrees]);

    // Start cap (semicircle around start point)
    for (let i = 0; i <= numPoints; i++) {
      const angle = Math.atan2(perpY, perpX) + (Math.PI * i) / numPoints;
      coords.push([
        startLng + Math.cos(angle) * bufferDegrees,
        startLat + Math.sin(angle) * bufferDegrees,
      ]);
    }

    // Close the polygon
    coords.push(coords[0]);

    return coords;
  }

  /**
   * Converts meters to approximate degrees at a given latitude.
   *
   * @param meters - Distance in meters
   * @param latitude - Latitude for conversion
   * @returns Approximate degrees
   */
  private static metersToDegrees(meters: number, latitude: number): number {
    const latRadians = this.toRadians(latitude);
    return meters / (this.EARTH_RADIUS_M * Math.cos(latRadians) * (Math.PI / 180));
  }
}
