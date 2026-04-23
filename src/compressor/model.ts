export type ThemeMode = "light" | "dark";
export type FileStatus = "done" | "processing" | "queued";
export type SettingsTab = "document" | "image" | "audio" | "video" | "output";
export type OutputMode = "suffix" | "folder" | "new-folder";
export type NoticeKind = "warning" | "error" | "info" | "success";
export type AudioMode = "lossless" | "lossy";
export type VideoCodec = "h264" | "h265" | "av1" | "vp9";
export type VideoContainer = "mp4" | "mkv" | "webm" | "mov";
export type DocumentCompressionScope = "image-only" | "full";
export type MediaTargetFormat = "keep" | "jpg" | "png";

export type SupportedExtension =
	| "doc"
	| "docx"
	| "xls"
	| "xlsx"
	| "ppt"
	| "pptx"
	| "odf"
	| "odt"
	| "odp"
	| "ods"
	| "pdf";

export type DocumentItem = {
	id: number;
	name: string;
	path: string;
	originalBytes: number;
	type: SupportedExtension;
	status: FileStatus;
	progress: number;
	compressedBytes?: number;
	savedBytes?: number;
	discarded?: boolean;
};

export type NoticeItem = {
	id: number;
	kind: NoticeKind;
	message: string;
};

export type FileWithPath = File & {
	path?: string;
	webkitRelativePath?: string;
};

export const MB = 1024 * 1024;

export const SUPPORTED_EXTENSIONS: SupportedExtension[] = [
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

const SUPPORTED_EXTENSION_SET = new Set<string>(SUPPORTED_EXTENSIONS);

export const VIDEO_CONTAINERS_BY_CODEC: Record<VideoCodec, VideoContainer[]> = {
	h264: ["mp4", "mkv", "mov"],
	h265: ["mp4", "mkv", "mov"],
	av1: ["mkv", "webm", "mp4"],
	vp9: ["webm", "mkv"],
};

export const statusLabel: Record<FileStatus, string> = {
	done: "완료",
	processing: "압축 중",
	queued: "대기",
};

export const supportedTypesText =
	"DOC, DOCX, XLS, XLSX, PPT, PPTX, ODF, ODT, ODP, ODS, PDF 지원 (추후 추가 가능)";

export const initialDocuments: DocumentItem[] = [];

export const formatBytesToMb = (bytes: number) =>
	`${(bytes / MB).toFixed(1)} MB`;

export const formatThemeLabel = (theme: ThemeMode) =>
	theme === "dark" ? "다크" : "라이트";

export const formatUnsupportedMessage = (names: string[]) => {
	if (names.length === 1) {
		return `${names[0]} 파일은 지원하지 않습니다.`;
	}
	if (names.length <= 4) {
		return `${names.join(", ")} 파일은 지원하지 않습니다.`;
	}
	const preview = names.slice(0, 3).join(", ");
	return `${preview} 외 ${names.length - 3}개 파일은 지원하지 않습니다.`;
};

export const getExtension = (name: string) =>
	name.split(".").pop()?.toLowerCase() ?? "";

export const isSupportedExtension = (
	value: string,
): value is SupportedExtension => SUPPORTED_EXTENSION_SET.has(value);

export const extractFilePath = (file: File): string => {
	const fileWithPath = file as FileWithPath;
	return fileWithPath.path ?? fileWithPath.webkitRelativePath ?? "";
};

export const getTypeGroup = (type: SupportedExtension) => {
	if (type === "pdf") {
		return "pdf";
	}
	if (["ppt", "pptx", "odp"].includes(type)) {
		return "slide";
	}
	if (["xls", "xlsx", "ods"].includes(type)) {
		return "sheet";
	}
	return "doc";
};

export const getAllowedVideoContainers = (codec: VideoCodec) =>
	VIDEO_CONTAINERS_BY_CODEC[codec];

export const normalizeQueue = (
	items: DocumentItem[],
	shouldAssignProcessing: boolean,
) => {
	const next = [...items];
	const processingIndices = next
		.map((item, index) => (item.status === "processing" ? index : -1))
		.filter((index) => index !== -1);

	if (processingIndices.length > 1) {
		const [keepIndex, ...others] = processingIndices;
		for (const index of others) {
			next[index] = {
				...next[index],
				status: "queued",
				progress: 0,
			};
		}
		if (keepIndex !== undefined && next[keepIndex].progress >= 100) {
			next[keepIndex] = {
				...next[keepIndex],
				progress: 99,
			};
		}
	}

	const hasProcessing = next.some((item) => item.status === "processing");
	if (!hasProcessing && shouldAssignProcessing) {
		const queuedIndex = next.findIndex((item) => item.status === "queued");
		if (queuedIndex !== -1) {
			next[queuedIndex] = {
				...next[queuedIndex],
				status: "processing",
				progress: 0,
			};
		}
	}

	return next;
};

export const detectNotFoundError = (error: unknown) => {
	const text = String(error).toLowerCase();
	return [
		"not found",
		"no such file",
		"cannot find",
		"os error 2",
		"파일을 찾을 수",
	].some((keyword) => text.includes(keyword));
};
