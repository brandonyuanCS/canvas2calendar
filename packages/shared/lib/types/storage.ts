/**
 * Storage Interface Types
 * Cross-cutting concern types used across the storage package and its consumers
 * These define the contract for all storage implementations
 */

/**
 * Function or value that can be used to update storage
 * Supports both direct values and updater functions
 */
export type ValueOrUpdateType<D> = D | ((prev: D) => Promise<D> | D);

/**
 * Base storage interface contract
 * All storage implementations must conform to this interface
 */
export type BaseStorageType<D> = {
  get: () => Promise<D>;
  set: (value: ValueOrUpdateType<D>) => Promise<void>;
  getSnapshot: () => D | null;
  subscribe: (listener: () => void) => () => void;
};
