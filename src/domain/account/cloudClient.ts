import type { ClaimPayload } from './claim';

/**
 * THE CLOUD CALL BOUNDARY.
 *
 * Two RPCs, named as the schema names them. Everything above this line works in
 * domain terms; everything below it is transport. Injecting it is what lets the
 * whole identity wave be proven against a real local Postgres — or against a
 * scripted double — without the domain knowing which.
 */
export interface CloudAccountClient {
  bootstrapAccount(input: BootstrapInput): Promise<CloudCall>;
  claimLocalHousehold(input: ClaimInput): Promise<CloudCall>;
}

export interface BootstrapInput {
  claimKey: string;
  timezone: string;
  deviceId: string | null;
}

export interface ClaimInput extends BootstrapInput {
  payload: ClaimPayload;
}

/**
 * Transport succeeded or it did not — separately from whether the server
 * agreed. A refusal is an answer; a dropped connection is not, and only one of
 * them is worth retrying with the same claim key.
 */
export type CloudCall =
  | { kind: 'ok'; body: unknown }
  /** Reachable, but it said no. Retrying the same request will say no again. */
  | { kind: 'rejected'; detail: string }
  /** Unreachable or interrupted. The server may or may not have committed. */
  | { kind: 'unreachable'; detail: string };
