import type { InstallmentSet } from "./installments.ts";
import type { TimelineSegment } from "./timeline.ts";

export type InstallmentSetDiff = {
  added: InstallmentSet;
  removed: InstallmentSet;
  unchanged: InstallmentSet;
};

function sortDescending(values: readonly number[]): InstallmentSet {
  return Object.freeze([...values].sort((left, right) => right - left));
}

export function diffInstallmentSets(before: InstallmentSet, after: InstallmentSet): InstallmentSetDiff {
  const beforeSet = new Set(before);
  const afterSet = new Set(after);

  return {
    added: sortDescending(after.filter((value) => !beforeSet.has(value))),
    removed: sortDescending(before.filter((value) => !afterSet.has(value))),
    unchanged: sortDescending(before.filter((value) => afterSet.has(value))),
  };
}

export type TimelineSegmentDiff = {
  segment: TimelineSegment;
  changeFromPrevious: InstallmentSetDiff | null;
};

export function diffTimelineSegments(
  segments: readonly TimelineSegment[],
): readonly TimelineSegmentDiff[] {
  return Object.freeze(
    segments.map((segment, index) => ({
      segment,
      changeFromPrevious:
        index === 0 ? null : diffInstallmentSets(segments[index - 1].installments, segment.installments),
    })),
  );
}
