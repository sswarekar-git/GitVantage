import type { GraphRow } from './graphLayout';

const LANE_WIDTH = 14;
const ROW_HEIGHT = 24;
const DOT_RADIUS = 4;

const LANE_COLORS = [
  'var(--vscode-charts-blue)',
  'var(--vscode-charts-orange)',
  'var(--vscode-charts-green)',
  'var(--vscode-charts-purple)',
  'var(--vscode-charts-red)',
  'var(--vscode-charts-yellow)',
];

function laneColor(lane: number): string {
  return LANE_COLORS[lane % LANE_COLORS.length];
}

function laneX(lane: number): number {
  return lane * LANE_WIDTH + LANE_WIDTH / 2;
}

interface GraphCellProps {
  row: GraphRow;
  laneCount: number;
}

export function GraphCell({ row, laneCount }: GraphCellProps) {
  const width = Math.max(laneCount, row.lane + 1) * LANE_WIDTH + 4;
  const midY = ROW_HEIGHT / 2;
  const dotX = laneX(row.lane);

  const passthroughLanes = row.activeLanesBefore.filter(
    (l) => l !== row.lane && !row.closedLanes.includes(l),
  );

  return (
    <svg width={width} height={ROW_HEIGHT} class="graph-cell">
      {passthroughLanes.map((lane) => (
        <line
          key={`pt-${lane}`}
          x1={laneX(lane)}
          y1={0}
          x2={laneX(lane)}
          y2={ROW_HEIGHT}
          stroke={laneColor(lane)}
          stroke-width={1.5}
        />
      ))}

      {row.laneContinuesFromAbove && (
        <line x1={dotX} y1={0} x2={dotX} y2={midY} stroke={laneColor(row.lane)} stroke-width={1.5} />
      )}

      {row.parentLanes.includes(row.lane) && (
        <line x1={dotX} y1={midY} x2={dotX} y2={ROW_HEIGHT} stroke={laneColor(row.lane)} stroke-width={1.5} />
      )}

      {row.closedLanes.map((lane) => (
        <line
          key={`close-${lane}`}
          x1={laneX(lane)}
          y1={0}
          x2={dotX}
          y2={midY}
          stroke={laneColor(lane)}
          stroke-width={1.5}
        />
      ))}

      {row.parentLanes
        .filter((lane) => lane !== row.lane)
        .map((lane) => (
          <line
            key={`fork-${lane}`}
            x1={dotX}
            y1={midY}
            x2={laneX(lane)}
            y2={ROW_HEIGHT}
            stroke={laneColor(lane)}
            stroke-width={1.5}
          />
        ))}

      <circle cx={dotX} cy={midY} r={DOT_RADIUS} fill={laneColor(row.lane)} />
    </svg>
  );
}
