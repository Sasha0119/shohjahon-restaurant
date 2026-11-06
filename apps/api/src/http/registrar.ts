import { routes, type HttpMethod, type RateLimit, type RouteDef } from "@app/shared/api";
import { Router, type RequestHandler } from "express";
import type { AuthedStaff } from "../auth/session.ts";
import type { AuthedGuest } from "../sessions/service.ts";
import { errors } from "./errors.ts";

declare module "express-serve-static-core" {
  interface Request {
    /** Set by the staff auth middleware on staff routes. */
    staff?: AuthedStaff;
    /** Set by the guest auth middleware on guest routes. */
    guest?: AuthedGuest;
  }
}

export interface RegistrarDeps {
  limiters: Record<RateLimit, RequestHandler>;
  /** Loads req.staff from the session cookie (does not reject). */
  loadStaff: RequestHandler;
  /** Loads req.guest from the guest cookie, rejecting with 401/410 if there is no open session. */
  requireGuest: RequestHandler;
  /** Same, but also accepts a visit that ended in the last 24 h (routes with allowClosedSession). */
  requireGuestIncludingClosed: RequestHandler;
}

/**
 * Every endpoint is mounted through `on(method, path, handler)`, which looks
 * the route up in packages/shared/src/api/routes.ts and applies — from that
 * table, not from the handler — the rate limit and the access rule.
 * A handler can't forget its auth check, and an endpoint can't exist without
 * being documented.
 */
export function createRegistrar(deps: RegistrarDeps) {
  const router = Router();
  const mounted: RouteDef[] = [];

  function on(method: HttpMethod, path: string, ...handlers: RequestHandler[]) {
    const def = routes.find((r) => r.method === method && r.path === path);
    if (!def) throw new Error(`${method} ${path} is not declared in packages/shared/src/api/routes.ts`);
    if (mounted.includes(def)) throw new Error(`${method} ${path} mounted twice`);

    const chain: RequestHandler[] = [];
    if (def.rateLimit) chain.push(deps.limiters[def.rateLimit]);
    if (def.access.kind === "staff") chain.push(deps.loadStaff, requireRoles(def.access.roles));
    if (def.access.kind === "guest")
      chain.push(def.allowClosedSession ? deps.requireGuestIncludingClosed : deps.requireGuest);

    const expressPath = path.replace(/^\/api/, "");
    router[method.toLowerCase() as "get" | "post" | "patch" | "put" | "delete"](expressPath, ...chain, ...handlers);
    mounted.push(def);
  }

  return { router, on, mounted };
}

function requireRoles(roles: AuthedStaff["role"][]): RequestHandler {
  return (req, _res, next) => {
    if (!req.staff) return next(errors.unauthorized());
    if (!roles.includes(req.staff.role)) return next(errors.forbidden());
    next();
  };
}
