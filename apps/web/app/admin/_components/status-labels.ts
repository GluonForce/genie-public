import type { PillTone } from "@/components/ui/pill";

/** How each status is named and coloured on admin screens. */
export const statusLabels: Record<string, [string, PillTone]> = {
  recording: ["Recording", "neutral"],
  requirements_ready: ["User reading requirements", "neutral"],
  pending_review: ["Pending approval", "amber"],
  approved: ["Waiting for the builder", "neutral"],
  building: ["Building", "neutral"],
  build_failed: ["Build failed", "danger"],
  awaiting_qa: ["Ready for QA", "amber"],
  released: ["Live", "success"],
  expired: ["Expired", "neutral"],
  offline: ["Offline", "neutral"],
  declined: ["Declined", "danger"],
  user_declined: ["Declined by the user", "neutral"],
};
