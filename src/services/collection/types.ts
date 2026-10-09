import type { Collection } from "@/types/collection";

export interface LoadCollectionOptions {
  onUpdate: (collection: Collection | null) => void;
  signal?: AbortSignal;
}
