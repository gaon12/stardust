import { Pause, Play, Sparkles } from "lucide-react";

type ActionBarProps = {
	isRunning: boolean;
	runButtonLabel: string;
	runDisabled: boolean;
	onToggleRun: () => void;
	onClearCompleted: () => void;
};

function ActionBar({
	isRunning,
	runButtonLabel,
	runDisabled,
	onToggleRun,
	onClearCompleted,
}: ActionBarProps) {
	return (
		<footer className="action-row">
			<button
				type="button"
				className="cta-primary"
				onClick={onToggleRun}
				disabled={runDisabled}
			>
				{isRunning ? <Pause size={18} /> : <Play size={18} />} {runButtonLabel}
			</button>
			<button
				type="button"
				className="cta-secondary"
				onClick={onClearCompleted}
			>
				<Sparkles size={18} /> 완료 항목 정리
			</button>
		</footer>
	);
}

export default ActionBar;
