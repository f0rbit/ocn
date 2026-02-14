export type OcnStatus = "idle" | "busy" | "prompting" | "error";

export type OcnEvent = {
	source: "plugin" | "sse" | "runbook";
	status: OcnStatus;
	directory: string;
	project: string;
	pid: number;
	session_id?: string;
	error_message?: string;
	permission_title?: string;
	is_subtask?: boolean;
	timestamp: string;
};

export type InstanceState = {
	pid: number;
	directory: string;
	project: string;
	status: OcnStatus;
	last_transition: string;
	session_id?: string;
};
