const PREFIX = "[ocn]";

export type Logger = {
	info: (msg: string, data?: Record<string, unknown>) => void;
	error: (msg: string, data?: Record<string, unknown>) => void;
	debug: (msg: string, data?: Record<string, unknown>) => void;
};

export function create_logger(verbose = false): Logger {
	const write = (level: string, msg: string, data?: Record<string, unknown>) => {
		const line = data ? `${PREFIX} ${level}: ${msg} ${JSON.stringify(data)}` : `${PREFIX} ${level}: ${msg}`;
		process.stderr.write(`${line}\n`);
	};

	return {
		info: (msg, data) => write("INFO", msg, data),
		error: (msg, data) => write("ERROR", msg, data),
		debug: (msg, data) => {
			if (verbose) write("DEBUG", msg, data);
		},
	};
}
