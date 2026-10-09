import type { ApplicationStage as S } from "@prisma/client";

// ENROLLED is reachable only through the enroll endpoint (it creates the student record).
export const TRANSITIONS: Record<S, S[]> = {
  ENQUIRY: ["APPLIED", "DECLINED"],
  APPLIED: ["ASSESSED", "WAITLISTED", "DECLINED"],
  ASSESSED: ["OFFERED", "WAITLISTED", "DECLINED"],
  WAITLISTED: ["OFFERED", "DECLINED"],
  OFFERED: ["ACCEPTED", "DECLINED"],
  ACCEPTED: ["DECLINED"],
  ENROLLED: [],
  DECLINED: [],
};
export const canMove = (from: S, to: S) => TRANSITIONS[from].includes(to);
