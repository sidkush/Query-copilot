// Plan 7 T19 — findResizeTarget: choose the ancestor whose proportional
// value actually controls a given axis's pixel size.
//
// In a container-horz row, each child's `w` is its share of the row's
// width; `h` is always 100000 (child fills the row vertically). A user
// dragging the S handle of a child in a horz row wants to grow the
// ROW's h in the vert parent, not the child's h. Similarly, a user
// dragging E on a leaf in a vert column wants to grow the COLUMN's w.
//
// Returns the id of the zone to pass to `resizeZone(tree, id, { w|h })`.
// Returns null when the root is the leaf, or when the leaf is not found.

type Axis = 'w' | 'h';
type Zone = {
  id: string;
  type: string;
  w: number;
  h: number;
  children?: Zone[];
};

function pathTo(tree: Zone, targetId: string, trail: Zone[] = []): Zone[] | null {
  const next = [...trail, tree];
  if (tree.id === targetId) return next;
  for (const child of tree.children ?? []) {
    const found = pathTo(child, targetId, next);
    if (found) return found;
  }
  return null;
}

export function findResizeTarget(root: Zone, leafId: string, axis: Axis): string | null {
  const path = pathTo(root, leafId);
  if (!path || path.length < 2) return null; // root itself or not found
  // Walk from the leaf upward; find the first node whose parent's split
  // axis matches the requested axis. That node's value is what controls
  // the pixel size along that axis.
  //
  //   parent.type === 'container-horz' → children's 'w' controls horz axis
  //   parent.type === 'container-vert' → children's 'h' controls vert axis
  const wantParentType = axis === 'w' ? 'container-horz' : 'container-vert';
  for (let i = path.length - 1; i >= 1; i--) {
    const parent = path[i - 1];
    if (parent.type === wantParentType) return path[i].id;
  }
  return null;
}
