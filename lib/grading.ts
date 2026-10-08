export const COMPONENTS = { CA1: 20, CA2: 20, EXAM: 60 } as const; // total 100
export type Component = keyof typeof COMPONENTS;
export const gradeFor = (total: number, scale: { minScore: number; grade: string; remark: string }[]) =>
  [...scale].sort((a, b) => b.minScore - a.minScore).find((g) => total >= g.minScore) ?? null;
