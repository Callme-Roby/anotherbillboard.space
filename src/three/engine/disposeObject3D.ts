import * as THREE from "three";

/** Disposes geometry + material(s) + any texture maps for one object and (by default) its descendants. */
export function disposeObject3D(root: THREE.Object3D, recursive = true): void {
  const visit = (object: THREE.Object3D) => {
    // THREE.Line, not LineSegments: LineSegments and LineLoop both
    // *extend* Line (checked against three.js's source), so testing the
    // subclass silently skipped plain Line objects — which the birds'
    // wings and bodies are (createBird.ts), the first in the scene.
    if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
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
