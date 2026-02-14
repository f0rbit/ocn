import type { OcnEvent } from "../types";

export type EventSource = {
	name: string;
	subscribe: (handler: (event: OcnEvent) => Promise<void>) => () => void;
};
