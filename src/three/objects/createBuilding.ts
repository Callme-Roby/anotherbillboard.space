import * as THREE from "three";

export interface BuildingDimensions {
  width: number;
  height: number;
  depth: number;
}

/**
 * A single unlit building volume: flat white `MeshBasicMaterial` box plus
 * black `EdgesGeometry` / `LineSegments` outline. No lights, no PBR — per
 * spec, buildings are meant to read as plain outlined shapes.
 *
 * The returned group is local-origin-at-base: the box occupies local
 * y ∈ [0, height], so stacking tiers is just adding their heights.
 */
export function createBuildingMesh(
  dimensions: BuildingDimensions,
  color: THREE.ColorRepresentation = 0xffffff,
): THREE.Group {
  const geometry = new THREE.BoxGeometry(
    dimensions.width,
    dimensions.height,
    dimensions.depth,
  );

  const material = new THREE.MeshBasicMaterial({ color });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = dimensions.height / 2;

  const edges = new THREE.EdgesGeometry(geometry);
  const lineMaterial = new THREE.LineBasicMaterial({ color: 0x0a0a0a });
  const outline = new THREE.LineSegments(edges, lineMaterial);
  outline.position.copy(mesh.position);

  const group = new THREE.Group();
  group.add(mesh, outline);
  return group;
}
