import { describe, expect, it } from "vitest";
import {
  comparePipelinePriority,
  followupBucketFor,
  needsLeadOwner,
  pipelinePlaybook,
  pipelineStatusLabel
} from "@/lib/pipeline-insights";

function dayOffset(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

describe("pipeline insights", () => {
  it("classifies follow-up buckets", () => {
    expect(followupBucketFor(null)).toBe("none");
    expect(followupBucketFor(dayOffset(-1))).toBe("overdue");
    expect(followupBucketFor(dayOffset(0))).toBe("today");
  });

  it("flags linked quotes without an owner", () => {
    expect(
      needsLeadOwner({
        id: "lead-1",
        lead_code: "LD-001",
        status: "qualified",
        assigned_to: null,
        assigned_profile: null
      })
    ).toBe(true);
    expect(needsLeadOwner(null)).toBe(false);
  });

  it("prioritizes overdue and undated active deals", () => {
    expect(
      pipelinePlaybook({
        status: "negotiating",
        followup_date: dayOffset(-2),
        tags: ["hot"],
        open_count: 2,
        sent_date: dayOffset(-5)
      }).label
    ).toBe("Call now");

    expect(
      pipelinePlaybook({
        status: "viewed",
        followup_date: null,
        tags: null,
        open_count: 1,
        sent_date: dayOffset(-1)
      }).label
    ).toBe("Call while interest is fresh");
  });

  it("sorts the queue by playbook priority and humanizes statuses", () => {
    const overdue = {
      status: "negotiating",
      followup_date: dayOffset(-1),
      tags: null,
      open_count: 0,
      sent_date: dayOffset(-4)
    };
    const onTrack = {
      status: "sent",
      followup_date: dayOffset(3),
      tags: null,
      open_count: 0,
      sent_date: dayOffset(-1)
    };

    expect(comparePipelinePriority(overdue, onTrack)).toBeLessThan(0);
    expect(pipelineStatusLabel("refresh_requested")).toBe("Revision requested");
  });
});
