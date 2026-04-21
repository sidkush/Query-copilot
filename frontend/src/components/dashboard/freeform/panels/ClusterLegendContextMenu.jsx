import { useStore } from '../../../../store';

export default function ClusterLegendContextMenu({ clusterId, clusterIndex, dimension }) {
  const createSet = useStore((s) => s.createSetFromClusterAnalystPro);
  return (
    <div role="menu" className="cluster-legend-context-menu">
      <button
        type="button"
        onClick={() => createSet(clusterId, clusterIndex, dimension)}
      >
        Create Set From Cluster
      </button>
    </div>
  );
}
