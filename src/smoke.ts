type CommandResult =
	| {
			ok: true;
			exit_code: number;
			stdout: string;
	  }
	| {
			ok: false;
			error: string;
	  };

const REQUIRED_KEYS = ["version", "total", "idle", "busy", "prompting", "error", "instances"] as const;

function describe_error(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function is_record(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function run_command(command: string[]): Promise<CommandResult> {
	try {
		const process_handle = Bun.spawn(command, { stdout: "pipe", stderr: "ignore" });
		const [exit_code, stdout] = await Promise.all([process_handle.exited, new Response(process_handle.stdout).text()]);
		return { ok: true, exit_code, stdout };
	} catch (error) {
		return { ok: false, error: describe_error(error) };
	}
}

function has_status_shape(value: unknown): boolean {
	if (!is_record(value)) return false;
	const record = value;
	return REQUIRED_KEYS.every((key) => Object.hasOwn(record, key)) && Array.isArray(record.instances);
}

function parse_json(value: string): unknown | null {
	try {
		return JSON.parse(value);
	} catch {
		return null;
	}
}

function failure(message: string): number {
	console.error(`smoke: ${message}`);
	return 1;
}

export async function main(): Promise<number> {
	const json_result = await run_command(["bun", "scripts/ocn-tmux-status", "--json"]);
	if (!json_result.ok) return failure(`tmux status failed: ${json_result.error}`);
	if (json_result.exit_code !== 0) return failure(`tmux status exited ${json_result.exit_code}`);

	const status = parse_json(json_result.stdout);
	if (!has_status_shape(status)) return failure("tmux status returned an invalid JSON contract");

	const table_result = await run_command(["bun", "scripts/ocn-status"]);
	if (!table_result.ok) return failure(`status CLI failed: ${table_result.error}`);
	if (table_result.exit_code !== 0) return failure(`status CLI exited ${table_result.exit_code}`);

	console.log("smoke: ok");
	return 0;
}

if (import.meta.main)
	void main().then((exit_code) => {
		process.exitCode = exit_code;
	});
