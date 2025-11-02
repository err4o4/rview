import * as THREE from "three"

/**
 * Vertex shader for distance-based point scaling.
 * Scales points based on their distance from a reference position (TF frame).
 * Farther points are rendered larger for better visibility.
 *
 * Note: 'color' attribute is automatically provided by Three.js when vertexColors is enabled
 */
export const distanceScaledVertexShader = `
  uniform vec3 tfPosition;
  uniform float baseSize;
  uniform bool enableScaling;

  varying vec3 vColor;

  void main() {
    vColor = color;

    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    float pointSize = baseSize;

    if (enableScaling) {
      // Calculate distance from this point to TF position
      float dist = distance(position, tfPosition);

      // Scale from 1x below 1m, then linearly from 1x at 1m to 30x at 100m
      float scale = 1.0;
      if (dist < 1.0) {
        scale = 1.0;
      } else {
        // Linear interpolation from 1x at 1m to 30x at 100m
        // scale = 1.0 + (dist - 1.0) * (29.0 / 99.0)
        scale = 1.0 + (dist - 1.0) * 0.75;
        //scale = dist * 2.0;
      }
      pointSize *= scale;
    }

    gl_PointSize = pointSize * (300.0 / -mvPosition.z);
  }
`

/**
 * Fragment shader for rendering points as circles.
 * Discards pixels outside circular shape for clean point appearance.
 */
export const distanceScaledFragmentShader = `
  varying vec3 vColor;

  void main() {
    // Circular point shape
    vec2 center = gl_PointCoord - vec2(0.5);
    if (length(center) > 0.5) discard;

    gl_FragColor = vec4(vColor, 1.0);
  }
`

/**
 * Creates a ShaderMaterial for point cloud rendering with distance-based scaling.
 *
 * @param baseSize - Base point size
 * @param enableScaling - Whether to enable distance-based scaling
 * @param tfPosition - Reference position for distance calculation (TF frame position)
 * @returns Configured ShaderMaterial
 */
export function createDistanceScalingMaterial(
  baseSize: number,
  enableScaling: boolean,
  tfPosition: THREE.Vector3 = new THREE.Vector3(0, 0, 0)
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      tfPosition: { value: tfPosition },
      baseSize: { value: baseSize },
      enableScaling: { value: enableScaling }
    },
    vertexShader: distanceScaledVertexShader,
    fragmentShader: distanceScaledFragmentShader,
    vertexColors: true
  })
}
