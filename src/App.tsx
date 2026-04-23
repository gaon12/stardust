import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	ActionBar,
	DragOverlay,
	EmptyQueueState,
	HeaderBar,
	NoticeStack,
	QueueTable,
	QueueToolbar,
	SettingsModal,
	SummarySection,
} from "./compressor/components";
import {
	type AudioMode,
	type DocumentCompressionScope,
	type DocumentItem,
	detectNotFoundError,
	extractFilePath,
	formatDuplicateMessage,
	formatUnsupportedMessage,
	getAllowedVideoContainers,
	getFileNameFromPath,
	initialDocuments,
	isSupportedExtension,
	type MediaTargetFormat,
	type NoticeItem,
	type NoticeKind,
	normalizePathKey,
	type OutputMode,
	type SettingsTab,
	supportedTypesText,
	type ThemeMode,
	type VideoCodec,
	type VideoContainer,
} from "./compressor/model";
import "./App.css";

type CompressDocumentRequest = {
	path: string;
	outputMode: OutputMode;
	outputSuffix: string;
	specificOutputPath: string;
	newFolderName: string;
	keepOriginal: boolean;
	reuseCompressedPath?: string | null;
	documentOptions: {
		pdfScope: DocumentCompressionScope;
		pdfMediaFormat: MediaTargetFormat;
		officeXmlScope: DocumentCompressionScope;
		officeXmlMediaFormat: MediaTargetFormat;
		officeBinaryScope: DocumentCompressionScope;
	};
};

type DocumentProbeItem = {
	path: string;
	name: string;
	originalBytes: number;
	extension: string;
};

type ProbeDocumentsResponse = {
	items: DocumentProbeItem[];
	missingPaths: string[];
	directoryPaths: string[];
};

const DOCUMENT_EXTENSIONS = [
	"doc",
	"docx",
	"xls",
	"xlsx",
	"ppt",
	"pptx",
	"odf",
	"odt",
	"odp",
	"ods",
	"pdf",
];

type CompressDocumentResponse = {
	outputPath: string | null;
	originalBytes: number;
	compressedBytes: number;
	savedBytes: number;
	discarded: boolean;
	messages: string[];
};

type HashCacheItem = {
	outputPath: string | null;
	compressedBytes: number;
	savedBytes: number;
	discarded: boolean;
};

function App() {
	const [theme, setTheme] = useState<ThemeMode>(() => {
		if (typeof window === "undefined") {
			return "light";
		}
		return window.matchMedia("(prefers-color-scheme: dark)").matches
			? "dark"
			: "light";
	});
	const [documents, setDocuments] = useState<DocumentItem[]>(initialDocuments);
	const [selectedId, setSelectedId] = useState<number | null>(null);
	const [isRunning, setIsRunning] = useState(false);
	const [activeProcessId, setActiveProcessId] = useState<number | null>(null);
	const [isFileDragging, setIsFileDragging] = useState(false);
	const [isSettingsOpen, setIsSettingsOpen] = useState(false);
	const [activeSettingsTab, setActiveSettingsTab] =
		useState<SettingsTab>("document");
	const [notices, setNotices] = useState<NoticeItem[]>([]);

	const [jpegQuality, setJpegQuality] = useState(82);
	const [pngCompressionLevel, setPngCompressionLevel] = useState(6);
	const [webpQuality, setWebpQuality] = useState(80);
	const [imageKeepMetadata, setImageKeepMetadata] = useState(true);
	const [pdfScope, setPdfScope] = useState<DocumentCompressionScope>("full");
	const [pdfMediaFormat, setPdfMediaFormat] =
		useState<MediaTargetFormat>("keep");
	const [officeXmlScope, setOfficeXmlScope] =
		useState<DocumentCompressionScope>("full");
	const [officeXmlMediaFormat, setOfficeXmlMediaFormat] =
		useState<MediaTargetFormat>("keep");
	const [officeBinaryScope, setOfficeBinaryScope] =
		useState<DocumentCompressionScope>("full");
	const [audioMode, setAudioMode] = useState<AudioMode>("lossy");
	const [audioBitrate, setAudioBitrate] = useState("192kbps");
	const [audioLosslessCodec, setAudioLosslessCodec] = useState("flac");
	const [videoCodec, setVideoCodec] = useState<VideoCodec>("h264");
	const [videoContainer, setVideoContainer] = useState<VideoContainer>("mp4");
	const [videoPreset, setVideoPreset] = useState("balanced");
	const [videoCrf, setVideoCrf] = useState(23);
	const [outputMode, setOutputMode] = useState<OutputMode>("suffix");
	const [outputSuffix, setOutputSuffix] = useState("_compressed");
	const [specificOutputPath, setSpecificOutputPath] = useState(
		"C:\\Users\\user\\Documents\\Output",
	);
	const [newFolderName, setNewFolderName] = useState("compressed_result");
	const [keepOriginal, setKeepOriginal] = useState(true);

	const dragDepthRef = useRef(0);
	const noticeIdRef = useRef(1);
	const processingLockRef = useRef(false);
	const processedByHashRef = useRef<Map<string, HashCacheItem>>(new Map());

	const videoContainerOptions = useMemo(
		() => getAllowedVideoContainers(videoCodec),
		[videoCodec],
	);
	const compressionSignature = useMemo(
		() =>
			JSON.stringify({
				pdfScope,
				pdfMediaFormat,
				officeXmlScope,
				officeXmlMediaFormat,
				officeBinaryScope,
			}),
		[
			officeBinaryScope,
			officeXmlMediaFormat,
			officeXmlScope,
			pdfMediaFormat,
			pdfScope,
		],
	);

	useEffect(() => {
		if (videoContainerOptions.includes(videoContainer)) {
			return;
		}
		setVideoContainer(videoContainerOptions[0]);
	}, [videoContainer, videoContainerOptions]);

	const pushNotice = useCallback((kind: NoticeKind, message: string) => {
		setNotices((previous) => {
			const nextNotice: NoticeItem = {
				id: noticeIdRef.current,
				kind,
				message,
			};
			noticeIdRef.current += 1;
			return [nextNotice, ...previous].slice(0, 4);
		});
	}, []);

	const dismissNotice = (id: number) => {
		setNotices((previous) => previous.filter((item) => item.id !== id));
	};

	const appendPaths = useCallback(
		async (incomingPaths: string[]) => {
			if (incomingPaths.length === 0) {
				return;
			}

			const duplicateNames: string[] = [];
			const uniqueKeys = new Set<string>();
			const queuedPaths: string[] = [];
			const existingKeys = new Set(
				documents.map((document) => normalizePathKey(document.path)),
			);

			for (const rawPath of incomingPaths) {
				const path = rawPath.trim();
				if (!path) {
					continue;
				}

				const key = normalizePathKey(path);
				if (uniqueKeys.has(key) || existingKeys.has(key)) {
					duplicateNames.push(getFileNameFromPath(path));
					continue;
				}

				uniqueKeys.add(key);
				queuedPaths.push(path);
			}

			if (duplicateNames.length > 0) {
				pushNotice("warning", formatDuplicateMessage(duplicateNames));
			}

			if (queuedPaths.length === 0) {
				return;
			}

			let probe: ProbeDocumentsResponse;
			try {
				probe = await invoke<ProbeDocumentsResponse>("probe_documents", {
					paths: queuedPaths,
				});
			} catch {
				pushNotice("error", "파일 정보를 불러오는 중 오류가 발생했습니다.");
				return;
			}

			if (probe.missingPaths.length > 0) {
				const names = probe.missingPaths.map(getFileNameFromPath);
				pushNotice("error", `${names.join(", ")} 파일을 찾을 수 없습니다.`);
			}

			if (probe.directoryPaths.length > 0) {
				const names = probe.directoryPaths.map(getFileNameFromPath);
				pushNotice(
					"warning",
					`${names.join(", ")} 항목은 폴더라서 추가하지 않았습니다.`,
				);
			}

			const supportedItems: Array<
				DocumentProbeItem & { extension: DocumentItem["type"] }
			> = [];
			const unsupportedNames: string[] = [];

			for (const item of probe.items) {
				if (isSupportedExtension(item.extension)) {
					supportedItems.push({
						...item,
						extension: item.extension,
					});
				} else {
					unsupportedNames.push(item.name);
				}
			}

			if (unsupportedNames.length > 0) {
				pushNotice("warning", formatUnsupportedMessage(unsupportedNames));
			}

			if (supportedItems.length === 0) {
				return;
			}

			setDocuments((previousDocuments) => {
				let nextId =
					previousDocuments.reduce(
						(maxId, item) => Math.max(maxId, item.id),
						0,
					) + 1;
				const existing = new Set(
					previousDocuments.map((document) => normalizePathKey(document.path)),
				);

				const newItems: DocumentItem[] = [];
				for (const item of supportedItems) {
					const key = normalizePathKey(item.path);
					if (existing.has(key)) {
						continue;
					}

					newItems.push({
						id: nextId,
						name: item.name,
						path: item.path,
						originalBytes: item.originalBytes,
						type: item.extension,
						status: "queued",
						progress: 0,
					});
					existing.add(key);
					nextId += 1;
				}

				return [...previousDocuments, ...newItems];
			});
		},
		[documents, pushNotice],
	);

	useEffect(() => {
		const hasFiles = (event: DragEvent) =>
			event.dataTransfer?.types.includes("Files") ?? false;

		const onDragEnter = (event: DragEvent) => {
			if (!hasFiles(event)) {
				return;
			}
			event.preventDefault();
			dragDepthRef.current += 1;
			setIsFileDragging(true);
		};

		const onDragOver = (event: DragEvent) => {
			if (!hasFiles(event)) {
				return;
			}
			event.preventDefault();
		};

		const onDragLeave = (event: DragEvent) => {
			if (!hasFiles(event)) {
				return;
			}
			event.preventDefault();
			dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
			if (dragDepthRef.current === 0) {
				setIsFileDragging(false);
			}
		};

		const onDrop = (event: DragEvent) => {
			if (!hasFiles(event)) {
				return;
			}
			event.preventDefault();
			dragDepthRef.current = 0;
			setIsFileDragging(false);
			const droppedPaths = Array.from(event.dataTransfer?.files ?? [])
				.map((file) => extractFilePath(file))
				.filter((path) => path.trim().length > 0);

			if (droppedPaths.length === 0) {
				pushNotice(
					"error",
					"드래그한 파일의 경로를 확인할 수 없습니다. 상단 '추가' 버튼을 사용해 주세요.",
				);
				return;
			}

			void appendPaths(droppedPaths);
		};

		window.addEventListener("dragenter", onDragEnter);
		window.addEventListener("dragover", onDragOver);
		window.addEventListener("dragleave", onDragLeave);
		window.addEventListener("drop", onDrop);

		return () => {
			window.removeEventListener("dragenter", onDragEnter);
			window.removeEventListener("dragover", onDragOver);
			window.removeEventListener("dragleave", onDragLeave);
			window.removeEventListener("drop", onDrop);
		};
	}, [appendPaths, pushNotice]);

	useEffect(() => {
		if (!isSettingsOpen) {
			return;
		}

		const onEscape = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				setIsSettingsOpen(false);
			}
		};

		window.addEventListener("keydown", onEscape);
		return () => window.removeEventListener("keydown", onEscape);
	}, [isSettingsOpen]);

	useEffect(() => {
		if (!isRunning || activeProcessId !== null || processingLockRef.current) {
			return;
		}

		const target = documents.find((item) => item.status === "queued");
		if (!target) {
			setIsRunning(false);
			return;
		}

		processingLockRef.current = true;
		setActiveProcessId(target.id);
		setDocuments((previous) =>
			previous.map((item) =>
				item.id === target.id
					? {
							...item,
							status: "processing",
							progress: Math.max(item.progress, 1),
						}
					: item,
			),
		);

		const progressTimer = window.setInterval(() => {
			setDocuments((previous) =>
				previous.map((item) => {
					if (item.id !== target.id || item.status !== "processing") {
						return item;
					}
					const nextProgress = Math.min(item.progress + 4, 94);
					return {
						...item,
						progress: nextProgress,
					};
				}),
			);
		}, 260);

		void (async () => {
			try {
				if (!target.path) {
					throw new Error("파일을 찾을 수 없습니다.");
				}

				let contentHash = target.contentHash;
				if (!contentHash) {
					contentHash = await invoke<string>("compute_file_hash", {
						path: target.path,
					});
					const normalized = contentHash.toLowerCase();
					contentHash = normalized;
					setDocuments((previous) =>
						previous.map((item) =>
							item.id === target.id
								? { ...item, contentHash: normalized }
								: item,
						),
					);
				}

				const cacheKey = `${contentHash}|${compressionSignature}`;
				const cached = processedByHashRef.current.get(cacheKey);

				if (cached?.discarded) {
					setDocuments((previous) =>
						previous.map((item) =>
							item.id === target.id
								? {
										...item,
										status: "done",
										progress: 100,
										compressedBytes: item.originalBytes,
										savedBytes: 0,
										discarded: true,
									}
								: item,
						),
					);
					pushNotice(
						"info",
						`${target.name}: 동일 해시 파일의 기존 결과를 재사용해 압축을 건너뛰었습니다.`,
					);
					return;
				}

				const request: CompressDocumentRequest = {
					path: target.path,
					outputMode,
					outputSuffix,
					specificOutputPath,
					newFolderName,
					keepOriginal,
					reuseCompressedPath: cached?.outputPath ?? null,
					documentOptions: {
						pdfScope,
						pdfMediaFormat,
						officeXmlScope,
						officeXmlMediaFormat,
						officeBinaryScope,
					},
				};

				const result = await invoke<CompressDocumentResponse>(
					"compress_document",
					{ request },
				);

				setDocuments((previous) =>
					previous.map((item) =>
						item.id === target.id
							? {
									...item,
									status: "done",
									progress: 100,
									compressedBytes: result.discarded
										? result.originalBytes
										: result.compressedBytes,
									outputPath: result.outputPath ?? undefined,
									savedBytes: result.savedBytes,
									discarded: result.discarded,
								}
							: item,
					),
				);

				processedByHashRef.current.set(cacheKey, {
					outputPath: result.outputPath,
					compressedBytes: result.compressedBytes,
					savedBytes: result.savedBytes,
					discarded: result.discarded,
				});

				if (result.discarded) {
					pushNotice(
						"warning",
						`${target.name}은(는) 압축 결과가 더 커서 압축본을 폐기했습니다.`,
					);
				}
				for (const message of result.messages) {
					pushNotice("info", `${target.name}: ${message}`);
				}
			} catch (error) {
				const notFound = detectNotFoundError(error);
				pushNotice(
					"error",
					notFound
						? `${target.name}: 파일을 찾을 수 없습니다.`
						: `${target.name} 압축 중 오류가 발생했습니다.`,
				);

				setDocuments((previous) =>
					previous.map((item) =>
						item.id === target.id
							? {
									...item,
									status: "done",
									progress: 100,
									compressedBytes: item.originalBytes,
									savedBytes: 0,
									discarded: true,
								}
							: item,
					),
				);
			} finally {
				window.clearInterval(progressTimer);
				processingLockRef.current = false;
				setActiveProcessId(null);
			}
		})();
	}, [
		activeProcessId,
		compressionSignature,
		documents,
		isRunning,
		keepOriginal,
		newFolderName,
		officeBinaryScope,
		officeXmlMediaFormat,
		officeXmlScope,
		outputMode,
		outputSuffix,
		pdfMediaFormat,
		pdfScope,
		pushNotice,
		specificOutputPath,
	]);

	const completedCount = useMemo(
		() => documents.filter((item) => item.status === "done").length,
		[documents],
	);

	const hasQueuedItems = useMemo(
		() => documents.some((item) => item.status === "queued"),
		[documents],
	);

	const overallProgress = useMemo(() => {
		if (documents.length === 0) {
			return 0;
		}

		const sum = documents.reduce((accumulator, item) => {
			if (item.status === "done") {
				return accumulator + 100;
			}
			if (item.status === "processing") {
				return accumulator + item.progress;
			}
			return accumulator;
		}, 0);
		return Math.round(sum / documents.length);
	}, [documents]);

	const savedBytes = useMemo(
		() =>
			documents.reduce(
				(accumulator, item) => accumulator + Math.max(item.savedBytes ?? 0, 0),
				0,
			),
		[documents],
	);

	const openFilePicker = async () => {
		try {
			const selected = await openDialog({
				multiple: true,
				directory: false,
				filters: [
					{
						name: "문서 파일",
						extensions: DOCUMENT_EXTENSIONS,
					},
				],
			});
			if (!selected) {
				return;
			}

			const selectedPaths = (
				Array.isArray(selected) ? selected : [selected]
			).map((value) => String(value));
			await appendPaths(selectedPaths);
		} catch {
			pushNotice("error", "파일 선택 창을 여는 중 오류가 발생했습니다.");
		}
	};

	const removeSelectedFile = () => {
		if (selectedId === null) {
			return;
		}
		if (selectedId === activeProcessId) {
			pushNotice("info", "현재 압축 중인 문서는 제거할 수 없습니다.");
			return;
		}
		setDocuments((previous) =>
			previous.filter((item) => item.id !== selectedId),
		);
		setSelectedId(null);
	};

	const removeDocument = (id: number) => {
		if (id === activeProcessId) {
			pushNotice("info", "현재 압축 중인 문서는 제거할 수 없습니다.");
			return;
		}
		setDocuments((previous) => previous.filter((item) => item.id !== id));
		setSelectedId((previous) => (previous === id ? null : previous));
	};

	const clearAllFiles = () => {
		if (activeProcessId !== null) {
			pushNotice("info", "압축 중에는 모두 제거를 사용할 수 없습니다.");
			return;
		}
		processedByHashRef.current.clear();
		setIsRunning(false);
		setDocuments([]);
		setSelectedId(null);
	};

	const clearCompleted = () => {
		setDocuments((previous) =>
			previous.filter((item) => item.status !== "done"),
		);
		setSelectedId(null);
	};

	const handleRunToggle = () => {
		if (isRunning) {
			setIsRunning(false);
			return;
		}

		if (activeProcessId !== null || !hasQueuedItems) {
			return;
		}

		setIsRunning(true);
	};

	const handleOpenDocument = async (document: DocumentItem) => {
		if (!document.path) {
			pushNotice("error", `${document.name}: 파일을 찾을 수 없습니다.`);
			return;
		}

		try {
			await openPath(document.path);
		} catch (error) {
			if (detectNotFoundError(error)) {
				pushNotice("error", `${document.name}: 파일을 찾을 수 없습니다.`);
				return;
			}
			pushNotice(
				"error",
				`${document.name} 파일을 여는 중 오류가 발생했습니다.`,
			);
		}
	};

	const getReducedSizeLabel = (document: DocumentItem) => {
		if (document.status !== "done") {
			return "-";
		}
		if (document.discarded) {
			return "0 MB (폐기)";
		}
		const reducedBytes = Math.max(document.savedBytes ?? 0, 0);
		return `${(reducedBytes / (1024 * 1024)).toFixed(1)} MB`;
	};

	const runButtonLabel = isRunning
		? "일시 정지"
		: activeProcessId !== null
			? "현재 파일 처리 중"
			: hasQueuedItems
				? "압축 시작"
				: "압축 완료";

	return (
		<div className="app-root" data-theme={theme}>
			<main className="app-shell">
				<HeaderBar
					theme={theme}
					onToggleTheme={() =>
						setTheme((previous) => (previous === "light" ? "dark" : "light"))
					}
					onAddFiles={openFilePicker}
					onRemoveSelected={removeSelectedFile}
					onClearAll={clearAllFiles}
					onOpenSettings={() => setIsSettingsOpen(true)}
					canRemoveSelected={selectedId !== null}
					hasDocuments={documents.length > 0}
				/>

				<NoticeStack notices={notices} onDismiss={dismissNotice} />

				{documents.length === 0 ? (
					<EmptyQueueState
						supportedTypesText={supportedTypesText}
						onOpenFilePicker={openFilePicker}
					/>
				) : (
					<>
						<QueueToolbar
							documentCount={documents.length}
							onOpenFilePicker={openFilePicker}
						/>
						<QueueTable
							documents={documents}
							selectedId={selectedId}
							onSelect={setSelectedId}
							onOpen={handleOpenDocument}
							onRemove={removeDocument}
							getReducedSizeLabel={getReducedSizeLabel}
						/>
					</>
				)}

				<SummarySection
					overallProgress={overallProgress}
					documentCount={documents.length}
					completedCount={completedCount}
					savedBytes={savedBytes}
				/>

				<ActionBar
					isRunning={isRunning}
					runButtonLabel={runButtonLabel}
					runDisabled={
						(!isRunning && !hasQueuedItems) ||
						(!isRunning && activeProcessId !== null)
					}
					onToggleRun={handleRunToggle}
					onClearCompleted={clearCompleted}
				/>
			</main>

			<SettingsModal
				isOpen={isSettingsOpen}
				onClose={() => setIsSettingsOpen(false)}
				activeTab={activeSettingsTab}
				onChangeTab={setActiveSettingsTab}
				jpegQuality={jpegQuality}
				onJpegQualityChange={setJpegQuality}
				pngCompressionLevel={pngCompressionLevel}
				onPngCompressionLevelChange={setPngCompressionLevel}
				webpQuality={webpQuality}
				onWebpQualityChange={setWebpQuality}
				imageKeepMetadata={imageKeepMetadata}
				onImageKeepMetadataChange={setImageKeepMetadata}
				pdfScope={pdfScope}
				onPdfScopeChange={setPdfScope}
				pdfMediaFormat={pdfMediaFormat}
				onPdfMediaFormatChange={setPdfMediaFormat}
				officeXmlScope={officeXmlScope}
				onOfficeXmlScopeChange={setOfficeXmlScope}
				officeXmlMediaFormat={officeXmlMediaFormat}
				onOfficeXmlMediaFormatChange={setOfficeXmlMediaFormat}
				officeBinaryScope={officeBinaryScope}
				onOfficeBinaryScopeChange={setOfficeBinaryScope}
				audioMode={audioMode}
				onAudioModeChange={setAudioMode}
				audioBitrate={audioBitrate}
				onAudioBitrateChange={setAudioBitrate}
				audioLosslessCodec={audioLosslessCodec}
				onAudioLosslessCodecChange={setAudioLosslessCodec}
				videoCodec={videoCodec}
				onVideoCodecChange={(value) => setVideoCodec(value as VideoCodec)}
				videoContainer={videoContainer}
				onVideoContainerChange={(value) =>
					setVideoContainer(value as VideoContainer)
				}
				videoContainerOptions={videoContainerOptions}
				videoPreset={videoPreset}
				onVideoPresetChange={setVideoPreset}
				videoCrf={videoCrf}
				onVideoCrfChange={setVideoCrf}
				outputMode={outputMode}
				onOutputModeChange={setOutputMode}
				outputSuffix={outputSuffix}
				onOutputSuffixChange={setOutputSuffix}
				specificOutputPath={specificOutputPath}
				onSpecificOutputPathChange={setSpecificOutputPath}
				newFolderName={newFolderName}
				onNewFolderNameChange={setNewFolderName}
				keepOriginal={keepOriginal}
				onKeepOriginalChange={setKeepOriginal}
			/>

			<DragOverlay
				isVisible={isFileDragging}
				supportedTypesText={supportedTypesText}
				onClose={() => setIsFileDragging(false)}
			/>
		</div>
	);
}

export default App;
