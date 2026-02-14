export type NotificationEvent = {
	type: "idle" | "prompting" | "error";
	project: string;
	directory: string;
	message: string;
	timestamp: string;
};

export type Notifier = {
	name: string;
	notify: (event: NotificationEvent) => Promise<void>;
};
