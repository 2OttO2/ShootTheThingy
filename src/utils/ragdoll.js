/**
 * Facade do ragdoll — agora powered by Planck.js (Box2D).
 * Player continua importando daqui.
 */
export {
  createRagdoll,
  stepRagdoll,
  ragdollSnapshot,
  angleBetween,
  dist,
} from "../physics/planckRagdoll.js";

