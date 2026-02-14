import type { InstanceState, OcnStatus } from "./types";

type StatusCounts = {
	idle: number;
	busy: number;
	prompting: number;
	error: number;
};

type Theme = {
	green: string;
	yellow: string;
	red: string;
	bg: string;
	muted: string;
};

const THEMES: Record<string, Theme> = {
	tokyonight: {
		green: "#9ece6a",
		yellow: "#e0af68",
		red: "#f7768e",
		bg: "#1a1b26",
		muted: "#565f89",
	},
	catppuccin: {
		green: "#a6e3a1",
		yellow: "#f9e2af",
		red: "#f38ba8",
		bg: "#1e1e2e",
		muted: "#585b70",
	},
	plain: {
		green: "green",
		yellow: "yellow",
		red: "red",
		bg: "default",
		muted: "white",
	},
};

export function count_statuses(states: InstanceState[]): StatusCounts {
	const counts: StatusCounts = { idle: 0, busy: 0, prompting: 0, error: 0 };
	for (const s of states) {
		if (s.status in counts) {
			counts[s.status]++;
		}
	}
	return counts;
}

export function render_tmux_status(states: InstanceState[], theme_name = "tokyonight"): string {
	if (states.length === 0) return "";

	const counts = count_statuses(states);
	const theme = THEMES[theme_name] ?? THEMES.tokyonight;

	if (counts.busy === 0 && counts.prompting === 0 && counts.error === 0) {
		return "";
	}

	const parts: string[] = [];

	if (counts.prompting > 0 || counts.error > 0) {
		const attention = counts.prompting + counts.error;
		parts.push(`#[fg=${theme.red},bg=${theme.bg},bold]${attention}!`);
	}

	if (counts.busy > 0) {
		parts.push(`#[fg=${theme.yellow},bg=${theme.bg}]${counts.busy}~`);
	}

	if (counts.idle > 0) {
		parts.push(`#[fg=${theme.green},bg=${theme.bg}]${counts.idle}✓`);
	}

	const prefix = `#[fg=${theme.muted},bg=${theme.bg}]ocn:`;
	return `${prefix}${parts.join(" ")} `;
}

export function render_json_status(states: InstanceState[]): string {
	const counts = count_statuses(states);
	return JSON.stringify({
		total: states.length,
		...counts,
		instances: states.map((s) => ({
			project: s.project,
			status: s.status,
			pid: s.pid,
		})),
	});
}
