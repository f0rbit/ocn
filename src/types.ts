import { z } from "zod";

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
	question_title?: string;
	is_subtask?: boolean;
	timestamp: string;
};

export const InstanceStateSchema = z.object({
	id: z.string(),
	pid: z.number(),
	directory: z.string(),
	project: z.string(),
	status: z.enum(["idle", "busy", "prompting", "error"]),
	session_id: z.string(),
	last_transition: z.string(),
	updated_at: z.string(),
	error_message: z.string().optional(),
	permission_title: z.string().optional(),
	question_title: z.string().optional(),
});

export type InstanceState = z.infer<typeof InstanceStateSchema>;
