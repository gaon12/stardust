import {
	FileArchive,
	Moon,
	Plus,
	Settings,
	Sun,
	Trash,
	Trash2,
} from "lucide-react";
import { formatThemeLabel, type ThemeMode } from "../model";

type HeaderBarProps = {
	theme: ThemeMode;
	onToggleTheme: () => void;
	onAddFiles: () => void;
	onRemoveSelected: () => void;
	onClearAll: () => void;
	onOpenSettings: () => void;
	canRemoveSelected: boolean;
	hasDocuments: boolean;
};

function HeaderBar({
	theme,
	onToggleTheme,
	onAddFiles,
	onRemoveSelected,
	onClearAll,
	onOpenSettings,
	canRemoveSelected,
	hasDocuments,
}: HeaderBarProps) {
	return (
		<header className="app-header">
			<div className="brand-wrap">
				<div className="brand-icon" aria-hidden>
					<FileArchive size={24} />
				</div>
				<div>
					<h1>문서 압축기</h1>
					<p>문서 용량 최적화</p>
				</div>
			</div>

			<div className="header-actions">
				<button
					type="button"
					className="theme-toggle"
					onClick={onToggleTheme}
					aria-label={`${formatThemeLabel(theme)} 모드 전환`}
				>
					{theme === "dark" ? <Moon size={16} /> : <Sun size={16} />}
					<span className="switch-track" aria-hidden>
						<span className="switch-thumb" />
					</span>
				</button>

				<div className="toolbar">
					<button type="button" className="toolbar-button" onClick={onAddFiles}>
						<Plus size={17} />
						<span>추가</span>
					</button>
					<button
						type="button"
						className="toolbar-button"
						onClick={onRemoveSelected}
						disabled={!canRemoveSelected}
					>
						<Trash2 size={17} />
						<span>제거</span>
					</button>
					<button
						type="button"
						className="toolbar-button"
						onClick={onClearAll}
						disabled={!hasDocuments}
					>
						<Trash size={17} />
						<span>모두 제거</span>
					</button>
					<button
						type="button"
						className="toolbar-button"
						onClick={onOpenSettings}
					>
						<Settings size={17} />
						<span>설정</span>
					</button>
				</div>
			</div>
		</header>
	);
}

export default HeaderBar;
