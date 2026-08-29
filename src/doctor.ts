import { constants, accessSync, existsSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import { ConfigSchema, load_config } from "./config";

type Severity = "ok" | "warn" | "fail";

type CheckResult = {
	severity: Severity;
	message: string;
};

type Check = () => CheckResult | Promise<CheckResult>;

const CONFIG_PATH = join(homedir(), ".config", "opencode", "ocn.json");
const OPENCODE_CONFIG_PATH = join(homedir(), ".config", "opencode", "opencode.jsonc");
const BIN_DIRECTORY = join(homedir(), ".local", "bin");

function describe_error(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function is_record(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function strip_jsonc_comments(input: string): string {
	let output = "";
	let in_string = false;
	let escaped = false;
	let line_comment = false;
	let block_comment = false;

	for (let index = 0; index < input.length; index += 1) {
		const character = input[index];
		const next_character = input[index + 1];

		if (line_comment) {
			if (character === "\n") {
				line_comment = false;
				output += character;
			} else {
				output += " ";
			}
			continue;
		}

		if (block_comment) {
			if (character === "*" && next_character === "/") {
				block_comment = false;
				output += "  ";
				index += 1;
			} else {
				output += character === "\n" ? "\n" : " ";
			}
			continue;
		}

		if (in_string) {
			output += character;
			if (escaped) {
				escaped = false;
			} else if (character === "\\") {
				escaped = true;
			} else if (character === '"') {
				in_string = false;
			}
			continue;
		}

		if (character === '"') {
			in_string = true;
			output += character;
			continue;
		}

		if (character === "/" && next_character === "/") {
			line_comment = true;
			output += "  ";
			index += 1;
			continue;
		}

		if (character === "/" && next_character === "*") {
			block_comment = true;
			output += "  ";
			index += 1;
			continue;
		}

		output += character;
	}

	return output;
}

function strip_jsonc_trailing_commas(input: string): string {
	let output = "";
	let in_string = false;
	let escaped = false;

	for (let index = 0; index < input.length; index += 1) {
		const character = input[index];

		if (in_string) {
			output += character;
			if (escaped) {
				escaped = false;
			} else if (character === "\\") {
				escaped = true;
			} else if (character === '"') {
				in_string = false;
			}
			continue;
		}

		if (character === '"') {
			in_string = true;
			output += character;
			continue;
		}

		if (character === ",") {
			let next_index = index + 1;
			while (/\s/.test(input[next_index] ?? "")) next_index += 1;
			if (input[next_index] === "}" || input[next_index] === "]") {
				index = next_index - 1;
				continue;
			}
		}

		output += character;
	}

	return output;
}

export type RegistrationProbe = "registered" | "missing" | "invalid";

export function probe_registration(input: string): RegistrationProbe {
	let parsed: unknown;
	try {
		parsed = JSON.parse(strip_jsonc_trailing_commas(strip_jsonc_comments(input)));
	} catch {
		return "invalid";
	}

	if (!is_record(parsed) || !Array.isArray(parsed.plugins)) return "missing";

	return parsed.plugins.some((plugin) => typeof plugin === "string" && plugin.includes("ocn"))
		? "registered"
		: "missing";
}

function check_config(): CheckResult {
	if (!existsSync(CONFIG_PATH)) {
		load_config(CONFIG_PATH);
		return { severity: "ok", message: `config defaults (no file at ${CONFIG_PATH})` };
	}

	try {
		ConfigSchema.parse(JSON.parse(readFileSync(CONFIG_PATH, "utf8")));
		load_config(CONFIG_PATH);
		return { severity: "ok", message: `config loaded from ${CONFIG_PATH}` };
	} catch (error) {
		return { severity: "fail", message: `config cannot be parsed at ${CONFIG_PATH}: ${describe_error(error)}` };
	}
}

function check_state_dir(): CheckResult {
	const config = load_config();
	if (!existsSync(config.state_dir)) {
		return { severity: "warn", message: `state directory is absent (${config.state_dir}); 0 records` };
	}

	try {
		if (!statSync(config.state_dir).isDirectory()) {
			return { severity: "fail", message: `state path is not a directory (${config.state_dir})` };
		}
		accessSync(config.state_dir, constants.W_OK);
		const records = readdirSync(config.state_dir).filter((entry) => entry.endsWith(".json")).length;
		return { severity: "ok", message: `state directory writable (${config.state_dir}); ${records} records` };
	} catch (error) {
		return {
			severity: "fail",
			message: `state directory is not writable (${config.state_dir}): ${describe_error(error)}`,
		};
	}
}

function package_name(package_path: string): string | null {
	try {
		const package_data: unknown = JSON.parse(readFileSync(package_path, "utf8"));
		if (!is_record(package_data) || typeof package_data.name !== "string") return null;
		return package_data.name;
	} catch {
		return null;
	}
}

function find_ocn_package(target_path: string): string | null {
	let directory = dirname(target_path);

	while (true) {
		if (package_name(join(directory, "package.json")) === "ocn") {
			const target_relative_path = relative(directory, target_path);
			const outside_package =
				target_relative_path === ".." ||
				target_relative_path.startsWith(`..${sep}`) ||
				isAbsolute(target_relative_path);
			if (!outside_package && target_relative_path.length > 0) return directory;
		}

		const parent = dirname(directory);
		if (parent === directory) return null;
		directory = parent;
	}
}

function check_executable(name: string): CheckResult {
	const executable_path = join(BIN_DIRECTORY, name);
	if (!existsSync(executable_path)) {
		return { severity: "fail", message: `${name} is missing at ${executable_path}` };
	}

	try {
		accessSync(executable_path, constants.X_OK);
		const target_path = realpathSync(executable_path);
		if (!statSync(target_path).isFile()) {
			return { severity: "fail", message: `${name} does not resolve to a file` };
		}
		const package_path = find_ocn_package(target_path);
		if (package_path === null) {
			return { severity: "fail", message: `${name} does not resolve inside an ocn package` };
		}
		return { severity: "ok", message: `${name} resolves to ${target_path}` };
	} catch (error) {
		return { severity: "fail", message: `${name} is not executable: ${describe_error(error)}` };
	}
}

function check_registration(): CheckResult {
	if (!existsSync(OPENCODE_CONFIG_PATH)) {
		return { severity: "warn", message: `registration config is absent (${OPENCODE_CONFIG_PATH})` };
	}

	try {
		const probe = probe_registration(readFileSync(OPENCODE_CONFIG_PATH, "utf8"));
		if (probe === "registered") return { severity: "ok", message: `ocn is registered in ${OPENCODE_CONFIG_PATH}` };
		if (probe === "invalid") {
			return { severity: "warn", message: `registration config is not valid JSONC (${OPENCODE_CONFIG_PATH})` };
		}
		return { severity: "warn", message: `ocn is not registered in the plugins array (${OPENCODE_CONFIG_PATH})` };
	} catch (error) {
		return { severity: "warn", message: `registration could not be inspected: ${describe_error(error)}` };
	}
}

async function check_service(): Promise<CheckResult> {
	let process_handle: Bun.Subprocess<"ignore", "pipe", "ignore">;
	try {
		process_handle = Bun.spawn(["opencode2", "api", "get", "/api/health"], {
			stdout: "pipe",
			stderr: "ignore",
		});
	} catch (error) {
		return { severity: "warn", message: `service probe unavailable: ${describe_error(error)}` };
	}

	try {
		let timeout_handle: ReturnType<typeof setTimeout> | undefined;
		const result = await Promise.race([
			process_handle.exited.then((exit_code) => ({ kind: "exit" as const, exit_code })),
			new Promise<{ kind: "timeout" }>((resolve) => {
				timeout_handle = setTimeout(() => resolve({ kind: "timeout" }), 5000);
			}),
		]);
		if (timeout_handle !== undefined) clearTimeout(timeout_handle);

		if (result.kind === "timeout") {
			process_handle.kill();
			return { severity: "warn", message: "service health probe timed out after 5s" };
		}

		const output = await new Response(process_handle.stdout).text();
		if (result.exit_code !== 0) {
			return { severity: "warn", message: `service is unreachable (exit ${result.exit_code})` };
		}

		const version = output.match(/"version"\s*:\s*"([^"]+)"/)?.[1] ?? "unknown version";
		return { severity: "ok", message: `service healthy (${version})` };
	} catch (error) {
		return { severity: "warn", message: `service health probe failed: ${describe_error(error)}` };
	}
}

async function run_check(check: Check): Promise<CheckResult> {
	try {
		return await check();
	} catch (error) {
		return { severity: "fail", message: `diagnostic failed: ${describe_error(error)}` };
	}
}

export async function main(): Promise<void> {
	const checks: Check[] = [
		check_config,
		check_state_dir,
		() => check_executable("ocn-tmux-status"),
		() => check_executable("ocn-status"),
		check_registration,
		check_service,
	];
	let failed = false;

	for (const check of checks) {
		const result = await run_check(check);
		console.log(`${result.severity}: ${result.message}`);
		failed = failed || result.severity === "fail";
	}

	process.exitCode = failed ? 1 : 0;
}

if (import.meta.main) void main();
