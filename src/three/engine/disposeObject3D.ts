import * as THREE from "three";

/** Disposes geometry + material(s) + any texture maps for one object and (by default) its descendants. */
export function disposeObject3D(root: THREE.Object3D, recursive = true): void {
  const visit = (object: THREE.Object3D) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
      object.geometry.dispose();
      const material = object.material;
      if (Array.isArray(material)) {
        material.forEach(disposeMaterial);
      } else {
        disposeMaterial(material);
      }
    }
  };

  if (recursive) {
    root.traverse(visit);
  } else {
    visit(root);
  }
}

function disposeMaterial(material: THREE.Material): void {
  const map = (material as THREE.MeshBasicMaterial).map;
  map?.dispose();
  material.dispose();
}
