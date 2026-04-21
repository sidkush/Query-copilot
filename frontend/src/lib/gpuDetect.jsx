// Component-only entry for the GPU tier system. The hooks, context, and
// detection helpers live in `gpuDetect.js` so this file exports only React
// components — keeping `react-refresh/only-export-components` happy.

import { GPUTierContext, getGPUTier } from "./gpuDetect.js";

export function GPUTierProvider({ children }) {
  const tier = getGPUTier();
  return <GPUTierContext.Provider value={tier}>{children}</GPUTierContext.Provider>;
}
