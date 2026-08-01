import type { CommitInfo } from './protocol';

export interface GraphRow {
  sha: string;
  lane: number;
  /** Lanes this commit's parents occupy going forward (first entry is the primary/continuing lane). */
  parentLanes: number[];
  /** Other lanes (besides `lane`) that pointed at this commit and converge here (merge-in). */
  closedLanes: number[];
  /** Lanes alive going into this row, before it was processed — used to draw passthrough lines. */
  activeLanesBefore: number[];
  /** Whether `lane` was already active before this row (continues from above) vs. starting fresh here. */
  laneContinuesFromAbove: boolean;
}

export interface LaneState {
  activeLanes: (string | null)[];
}

// Assigns each commit a lane using the standard log-graph layout approach: walk
// commits newest-first, track which lane is "waiting" for each pending parent sha,
// and reuse/open/close lanes as commits satisfy or create those expectations.
// Kept pure and pagination-friendly — `priorState` lets a later page pick up the
// exact same lane assignment a fresh full-history walk would have produced, so
// lanes never jitter or renumber as more commits load in.
export function computeGraphLayout(
  commits: CommitInfo[],
  priorState?: LaneState,
): { rows: GraphRow[]; laneState: LaneState } {
  const activeLanes: (string | null)[] = priorState ? [...priorState.activeLanes] : [];
  const rows: GraphRow[] = [];

  const findFreeLane = (): number => {
    const idx = activeLanes.indexOf(null);
    if (idx !== -1) return idx;
    activeLanes.push(null);
    return activeLanes.length - 1;
  };

  for (const commit of commits) {
    const activeLanesBefore = activeLanes
      .map((sha, idx) => (sha !== null ? idx : -1))
      .filter((idx) => idx !== -1);

    const matchingLanes: number[] = [];
    activeLanes.forEach((sha, idx) => {
      if (sha === commit.sha) matchingLanes.push(idx);
    });

    let lane: number;
    let closedLanes: number[] = [];
    let laneContinuesFromAbove = false;
    if (matchingLanes.length > 0) {
      lane = matchingLanes[0];
      closedLanes = matchingLanes.slice(1);
      laneContinuesFromAbove = true;
      for (const l of matchingLanes) activeLanes[l] = null;
    } else {
      lane = findFreeLane();
    }

    const parentLanes: number[] = [];
    commit.parents.forEach((parentSha, idx) => {
      if (idx === 0) {
        activeLanes[lane] = parentSha;
        parentLanes.push(lane);
      } else {
        const existingIdx = activeLanes.indexOf(parentSha);
        if (existingIdx !== -1) {
          parentLanes.push(existingIdx);
        } else {
          const newLane = findFreeLane();
          activeLanes[newLane] = parentSha;
          parentLanes.push(newLane);
        }
      }
    });

    rows.push({ sha: commit.sha, lane, parentLanes, closedLanes, activeLanesBefore, laneContinuesFromAbove });
  }

  return { rows, laneState: { activeLanes: [...activeLanes] } };
}
