import { useMemo, useState } from "react";
import "./App.css";

type ThemeMode = "light" | "dark";
type FileStatus = "done" | "processing" | "queued";
type CompressionLevel = "low" | "normal" | "high";

type DocumentItem = {
	id: number;
	name: string;
	originalSize: string;
	estimatedSize: string;
	type: "pdf" | "docx" | "pptx" | "xlsx";
	status: FileStatus;
	progress?: number;
};

const documentItems: DocumentItem[] = [
	{
		id: 1,
		name: "사업계획서_2024.pdf",
		originalSize: "24.8 MB",
		estimatedSize: "8.7 MB",
		type: "pdf",
		status: "done",
	},
	{
		id: 2,
		name: "마케팅_보고서.docx",
		originalSize: "15.2 MB",
		estimatedSize: "5.1 MB",
		type: "docx",
		status: "processing",
		progress: 72,
	},
	{
		id: 3,
		name: "분기_실적_발표.pptx",
		originalSize: "32.6 MB",
		estimatedSize: "11.3 MB",
		type: "pptx",
		status: "queued",
	},
	{
		id: 4,
		name: "데이터_분석_결과.xlsx",
		originalSize: "18.4 MB",
		estimatedSize: "6.2 MB",
		type: "xlsx",
		status: "done",
	},
	{
		id: 5,
		name: "계약서_템플릿.pdf",
		originalSize: "9.7 MB",
		estimatedSize: "3.4 MB",
		type: "pdf",
		status: "done",
	},
	{
		id: 6,
		name: "업무_매뉴얼.docx",
		originalSize: "12.1 MB",
		estimatedSize: "4.0 MB",
		type: "docx",
		status: "done",
	},
	{
		id: 7,
		name: "제안서_최종본.pdf",
		originalSize: "22.3 MB",
		estimatedSize: "7.8 MB",
		type: "pdf",
		status: "done",
	},
];

const toolbarItems = [
	{ icon: "+", label: "추가" },
	{ icon: "🗑", label: "제거" },
	{ icon: "⌫", label: "모두 제거" },
	{ icon: "⚙", label: "설정" },
];

const statusLabel: Record<FileStatus, string> = {
	done: "완료",
	processing: "압축 중",
	queued: "대기",
};

const formatThemeLabel = (theme: ThemeMode) =>
	theme === "dark" ? "다크" : "라이트";

function App() {
	const [theme, setTheme] = useState<ThemeMode>(() => {
		if (typeof window === "undefined") {
			return "light";
		}

		return window.matchMedia("(prefers-color-scheme: dark)").matches
			? "dark"
			: "light";
	});
	const [compressionLevel, setCompressionLevel] =
		useState<CompressionLevel>("normal");
	const [keepOriginal, setKeepOriginal] = useState(true);

	const completedCount = useMemo(
		() => documentItems.filter((item) => item.status === "done").length,
		[],
	);
	const overallProgress = 68;

	return (
		<div className="app-root" data-theme={theme}>
			<main className="app-shell">
				<header className="app-header">
					<div className="brand-wrap">
						<div className="brand-icon" aria-hidden>
							📄
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
							onClick={() =>
								setTheme((prev) => (prev === "light" ? "dark" : "light"))
							}
							aria-label={`${formatThemeLabel(theme)} 모드 전환`}
						>
							<span className="theme-icon" aria-hidden>
								{theme === "dark" ? "🌙" : "☀"}
							</span>
							<span className="switch-track">
								<span className="switch-thumb" />
							</span>
						</button>

						<div className="toolbar">
							{toolbarItems.map((item) => (
								<button
									key={item.label}
									type="button"
									className="toolbar-button"
								>
									<span aria-hidden>{item.icon}</span>
									<span>{item.label}</span>
								</button>
							))}
						</div>
					</div>
				</header>

				<section className="upload-zone">
					<div className="upload-copy">
						<span className="upload-icon" aria-hidden>
							☁
						</span>
						<div>
							<strong>문서를 여기로 끌어오거나 파일 선택</strong>
							<p>PDF, DOCX, PPTX, XLSX, TXT 파일 지원</p>
						</div>
					</div>
					<button type="button" className="solid-button">
						파일 선택
					</button>
				</section>

				<section className="table-card" aria-label="문서 처리 목록">
					<table>
						<thead>
							<tr>
								<th>파일명</th>
								<th>원본 크기</th>
								<th>예상 크기</th>
								<th>상태</th>
							</tr>
						</thead>
						<tbody>
							{documentItems.map((item) => (
								<tr key={item.id}>
									<td>
										<div className="file-name-cell">
											<span className={`file-badge ${item.type}`}>
												{item.type.toUpperCase()}
											</span>
											<span>{item.name}</span>
										</div>
									</td>
									<td>{item.originalSize}</td>
									<td>{item.estimatedSize}</td>
									<td>
										<div className="status-cell">
											<span className={`status-chip ${item.status}`}>
												<span className="status-dot" aria-hidden />
												{item.status === "processing" && item.progress
													? `${statusLabel[item.status]} ${item.progress}%`
													: statusLabel[item.status]}
											</span>
											{item.status === "processing" && item.progress && (
												<div className="row-progress" aria-hidden>
													<span style={{ width: `${item.progress}%` }} />
												</div>
											)}
										</div>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</section>

				<section className="summary-grid">
					<article className="summary-card progress-card">
						<h2>전체 진행률</h2>
						<div className="summary-main">
							<strong>{overallProgress}%</strong>
							<span>7개 중 5개 완료</span>
						</div>
						<div className="large-progress" aria-hidden>
							<span style={{ width: `${overallProgress}%` }} />
						</div>
						<p>남은 시간: 약 00:01:24</p>
					</article>

					<article className="summary-card done-card">
						<h2>완료된 항목</h2>
						<strong>{completedCount} 개</strong>
						<p>절약된 용량</p>
						<b>184 MB</b>
					</article>
				</section>

				<section className="settings-card">
					<h2>압축 설정</h2>
					<div className="settings-grid">
						<div className="level-group">
							<span>압축 수준</span>
							{(
								[
									{ value: "low", label: "낮음" },
									{ value: "normal", label: "보통" },
									{ value: "high", label: "높음" },
								] as const
							).map((level) => (
								<button
									key={level.value}
									type="button"
									className={compressionLevel === level.value ? "active" : ""}
									onClick={() => setCompressionLevel(level.value)}
								>
									{level.label}
								</button>
							))}
						</div>

						<div className="path-group">
							<span>출력 폴더</span>
							<div className="path-control">
								<div className="path-field">
									C:\Users\user\Documents\문서압축
								</div>
								<button type="button">찾아보기</button>
							</div>
						</div>

						<label className="keep-toggle">
							<span>원본 유지</span>
							<input
								type="checkbox"
								checked={keepOriginal}
								onChange={(event) =>
									setKeepOriginal(event.currentTarget.checked)
								}
							/>
						</label>
					</div>
				</section>

				<footer className="action-row">
					<button type="button" className="cta-start">
						▶ 압축 시작
					</button>
					<button type="button" className="cta-neutral">
						❙❙ 일시정지
					</button>
					<button type="button" className="cta-clean">
						🧹 완료 항목 정리
					</button>
				</footer>
			</main>
		</div>
	);
}

export default App;
