import { ZodError } from "zod";

/** Wrap a route handler: thrown Responses (401/403/404) pass through, bad input -> 400. */
export const route =
  <A extends unknown[]>(fn: (...a: A) => Promise<Response>) =>
  async (...a: A): Promise<Response> => {
    try { return await fn(...a); }
    catch (e) {
      if (e instanceof Response) return e;
      if (e instanceof ZodError) return Response.json({ error: "Invalid input", issues: e.issues }, { status: 400 });
      console.error(e);
      return Response.json({ error: "Server error" }, { status: 500 });
    }
  };
