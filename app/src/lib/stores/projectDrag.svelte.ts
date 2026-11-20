// Which project is being dragged in the project panel (dataTransfer contents are
// unreadable while the pointer is still moving, so the tree items share it here).
export const projectDrag = $state<{ id: number | null }>({ id: null });
