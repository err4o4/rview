import * as THREE from "three"

/**
 * Transforms a position from ROS coordinate system to Three.js world space.
 * ROS uses: x=forward, y=left, z=up
 * Three.js uses: x=right, y=up, z=forward
 *
 * @param position - Position in ROS coordinate system
 * @returns Transformed position in Three.js world space
 */
export function transformToWorldSpace(position: THREE.Vector3): THREE.Vector3 {
  const transformed = position.clone()
  transformed.applyAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2)
  transformed.applyAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI)
  return transformed
}

/**
 * Transforms a rotation from ROS coordinate system to Three.js world space.
 * Applies the same coordinate system transformation as position.
 *
 * @param rotation - Rotation in ROS coordinate system
 * @returns Transformed rotation in Three.js world space
 */
export function transformRotationToWorldSpace(rotation: THREE.Quaternion): THREE.Quaternion {
  const transformedRotation = rotation.clone()
  transformedRotation.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2))
  transformedRotation.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI))
  return transformedRotation
}
