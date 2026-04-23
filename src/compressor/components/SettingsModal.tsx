import {
	FileText,
	FolderOpen,
	ImageIcon,
	Video,
	Volume2,
	X,
} from "lucide-react";
import { useEffect, useRef } from "react";
import type {
	AudioMode,
	DocumentCompressionScope,
	MediaTargetFormat,
	OutputMode,
	SettingsTab,
	VideoContainer,
} from "../model";

type SettingsModalProps = {
	isOpen: boolean;
	onClose: () => void;
	activeTab: SettingsTab;
	onChangeTab: (tab: SettingsTab) => void;
	jpegQuality: number;
	onJpegQualityChange: (value: number) => void;
	pngCompressionLevel: number;
	onPngCompressionLevelChange: (value: number) => void;
	webpQuality: number;
	onWebpQualityChange: (value: number) => void;
	imageKeepMetadata: boolean;
	onImageKeepMetadataChange: (value: boolean) => void;
	pdfScope: DocumentCompressionScope;
	onPdfScopeChange: (value: DocumentCompressionScope) => void;
	pdfMediaFormat: MediaTargetFormat;
	onPdfMediaFormatChange: (value: MediaTargetFormat) => void;
	officeXmlScope: DocumentCompressionScope;
	onOfficeXmlScopeChange: (value: DocumentCompressionScope) => void;
	officeXmlMediaFormat: MediaTargetFormat;
	onOfficeXmlMediaFormatChange: (value: MediaTargetFormat) => void;
	officeBinaryScope: DocumentCompressionScope;
	onOfficeBinaryScopeChange: (value: DocumentCompressionScope) => void;
	audioMode: AudioMode;
	onAudioModeChange: (value: AudioMode) => void;
	audioBitrate: string;
	onAudioBitrateChange: (value: string) => void;
	audioLosslessCodec: string;
	onAudioLosslessCodecChange: (value: string) => void;
	videoCodec: string;
	onVideoCodecChange: (value: string) => void;
	videoContainer: string;
	onVideoContainerChange: (value: string) => void;
	videoContainerOptions: VideoContainer[];
	videoPreset: string;
	onVideoPresetChange: (value: string) => void;
	videoCrf: number;
	onVideoCrfChange: (value: number) => void;
	outputMode: OutputMode;
	onOutputModeChange: (mode: OutputMode) => void;
	outputSuffix: string;
	onOutputSuffixChange: (value: string) => void;
	specificOutputPath: string;
	onSpecificOutputPathChange: (value: string) => void;
	newFolderName: string;
	onNewFolderNameChange: (value: string) => void;
	keepOriginal: boolean;
	onKeepOriginalChange: (value: boolean) => void;
};

function SettingsModal({
	isOpen,
	onClose,
	activeTab,
	onChangeTab,
	jpegQuality,
	onJpegQualityChange,
	pngCompressionLevel,
	onPngCompressionLevelChange,
	webpQuality,
	onWebpQualityChange,
	imageKeepMetadata,
	onImageKeepMetadataChange,
	pdfScope,
	onPdfScopeChange,
	pdfMediaFormat,
	onPdfMediaFormatChange,
	officeXmlScope,
	onOfficeXmlScopeChange,
	officeXmlMediaFormat,
	onOfficeXmlMediaFormatChange,
	officeBinaryScope,
	onOfficeBinaryScopeChange,
	audioMode,
	onAudioModeChange,
	audioBitrate,
	onAudioBitrateChange,
	audioLosslessCodec,
	onAudioLosslessCodecChange,
	videoCodec,
	onVideoCodecChange,
	videoContainer,
	onVideoContainerChange,
	videoContainerOptions,
	videoPreset,
	onVideoPresetChange,
	videoCrf,
	onVideoCrfChange,
	outputMode,
	onOutputModeChange,
	outputSuffix,
	onOutputSuffixChange,
	specificOutputPath,
	onSpecificOutputPathChange,
	newFolderName,
	onNewFolderNameChange,
	keepOriginal,
	onKeepOriginalChange,
}: SettingsModalProps) {
	const modalRef = useRef<HTMLElement | null>(null);

	useEffect(() => {
		if (!isOpen) {
			return;
		}

		const onMouseDown = (event: MouseEvent) => {
			const target = event.target;
			if (!(target instanceof Node)) {
				return;
			}
			if (!modalRef.current || modalRef.current.contains(target)) {
				return;
			}
			onClose();
		};

		window.addEventListener("mousedown", onMouseDown);
		return () => window.removeEventListener("mousedown", onMouseDown);
	}, [isOpen, onClose]);

	if (!isOpen) {
		return null;
	}

	return (
		<div className="modal-backdrop">
			<section ref={modalRef} className="settings-modal" aria-label="설정 모달">
				<header className="modal-header">
					<h2>설정</h2>
					<button
						type="button"
						className="modal-close"
						onClick={onClose}
						aria-label="설정 닫기"
					>
						<X size={16} />
					</button>
				</header>

				<div className="settings-tabs">
					<button
						type="button"
						className={activeTab === "document" ? "active" : ""}
						onClick={() => onChangeTab("document")}
					>
						<FileText size={14} /> 문서
					</button>
					<button
						type="button"
						className={activeTab === "image" ? "active" : ""}
						onClick={() => onChangeTab("image")}
					>
						<ImageIcon size={14} /> 이미지
					</button>
					<button
						type="button"
						className={activeTab === "audio" ? "active" : ""}
						onClick={() => onChangeTab("audio")}
					>
						<Volume2 size={14} /> 오디오
					</button>
					<button
						type="button"
						className={activeTab === "video" ? "active" : ""}
						onClick={() => onChangeTab("video")}
					>
						<Video size={14} /> 비디오
					</button>
					<button
						type="button"
						className={activeTab === "output" ? "active" : ""}
						onClick={() => onChangeTab("output")}
					>
						<FolderOpen size={14} /> 출력
					</button>
				</div>

				<div className="settings-panel">
					{activeTab === "document" && (
						<>
							<article className="format-setting-card">
								<h3>PDF</h3>
								<div className="output-options two-up">
									<label
										className={`output-option ${pdfScope === "image-only" ? "active" : ""}`}
									>
										<input
											type="radio"
											name="pdf-scope"
											checked={pdfScope === "image-only"}
											onChange={() => onPdfScopeChange("image-only")}
										/>
										<span>이미지 중심</span>
									</label>
									<label
										className={`output-option ${pdfScope === "full" ? "active" : ""}`}
									>
										<input
											type="radio"
											name="pdf-scope"
											checked={pdfScope === "full"}
											onChange={() => onPdfScopeChange("full")}
										/>
										<span>텍스트/구조 포함</span>
									</label>
								</div>
								<label className="setting-field">
									<span>내부 이미지 형식</span>
									<select
										value={pdfMediaFormat}
										onChange={(event) =>
											onPdfMediaFormatChange(
												event.currentTarget.value as MediaTargetFormat,
											)
										}
									>
										<option value="keep">원본 유지</option>
										<option value="jpg">JPG로 통일</option>
										<option value="png">PNG로 통일</option>
									</select>
								</label>
							</article>

							<article className="format-setting-card">
								<h3>DOCX/XLSX/PPTX/ODF 계열</h3>
								<div className="output-options two-up">
									<label
										className={`output-option ${officeXmlScope === "image-only" ? "active" : ""}`}
									>
										<input
											type="radio"
											name="office-xml-scope"
											checked={officeXmlScope === "image-only"}
											onChange={() => onOfficeXmlScopeChange("image-only")}
										/>
										<span>이미지만 최적화</span>
									</label>
									<label
										className={`output-option ${officeXmlScope === "full" ? "active" : ""}`}
									>
										<input
											type="radio"
											name="office-xml-scope"
											checked={officeXmlScope === "full"}
											onChange={() => onOfficeXmlScopeChange("full")}
										/>
										<span>이미지+텍스트 최적화</span>
									</label>
								</div>
								<label className="setting-field">
									<span>내부 미디어 형식</span>
									<select
										value={officeXmlMediaFormat}
										onChange={(event) =>
											onOfficeXmlMediaFormatChange(
												event.currentTarget.value as MediaTargetFormat,
											)
										}
									>
										<option value="keep">원본 유지</option>
										<option value="jpg">JPG로 통일</option>
										<option value="png">PNG로 통일</option>
									</select>
								</label>
							</article>

							<article className="format-setting-card">
								<h3>DOC/XLS/PPT (구형 바이너리)</h3>
								<div className="output-options two-up">
									<label
										className={`output-option ${officeBinaryScope === "image-only" ? "active" : ""}`}
									>
										<input
											type="radio"
											name="office-binary-scope"
											checked={officeBinaryScope === "image-only"}
											onChange={() => onOfficeBinaryScopeChange("image-only")}
										/>
										<span>이미지 중심</span>
									</label>
									<label
										className={`output-option ${officeBinaryScope === "full" ? "active" : ""}`}
									>
										<input
											type="radio"
											name="office-binary-scope"
											checked={officeBinaryScope === "full"}
											onChange={() => onOfficeBinaryScopeChange("full")}
										/>
										<span>전체 압축</span>
									</label>
								</div>
							</article>
						</>
					)}

					{activeTab === "image" && (
						<>
							<div className="format-setting-card">
								<h3>JPEG</h3>
								<label className="setting-field">
									<span>품질</span>
									<input
										type="range"
										min={20}
										max={100}
										value={jpegQuality}
										onChange={(event) =>
											onJpegQualityChange(Number(event.currentTarget.value))
										}
									/>
									<small>{jpegQuality}%</small>
								</label>
							</div>
							<div className="format-setting-card">
								<h3>PNG</h3>
								<label className="setting-field">
									<span>압축 레벨</span>
									<input
										type="range"
										min={0}
										max={9}
										value={pngCompressionLevel}
										onChange={(event) =>
											onPngCompressionLevelChange(
												Number(event.currentTarget.value),
											)
										}
									/>
									<small>{pngCompressionLevel}/9</small>
								</label>
							</div>
							<div className="format-setting-card">
								<h3>WebP</h3>
								<label className="setting-field">
									<span>품질</span>
									<input
										type="range"
										min={20}
										max={100}
										value={webpQuality}
										onChange={(event) =>
											onWebpQualityChange(Number(event.currentTarget.value))
										}
									/>
									<small>{webpQuality}%</small>
								</label>
							</div>
							<label className="setting-field inline-toggle">
								<span>원본 메타데이터 유지</span>
								<input
									type="checkbox"
									checked={imageKeepMetadata}
									onChange={(event) =>
										onImageKeepMetadataChange(event.currentTarget.checked)
									}
								/>
							</label>
						</>
					)}

					{activeTab === "audio" && (
						<>
							<div className="output-options two-up">
								<label
									className={`output-option ${audioMode === "lossy" ? "active" : ""}`}
								>
									<input
										type="radio"
										name="audio-mode"
										checked={audioMode === "lossy"}
										onChange={() => onAudioModeChange("lossy")}
									/>
									<span>손실 압축</span>
								</label>
								<label
									className={`output-option ${audioMode === "lossless" ? "active" : ""}`}
								>
									<input
										type="radio"
										name="audio-mode"
										checked={audioMode === "lossless"}
										onChange={() => onAudioModeChange("lossless")}
									/>
									<span>무손실 압축</span>
								</label>
							</div>

							{audioMode === "lossy" ? (
								<label className="setting-field">
									<span>오디오 비트레이트</span>
									<select
										value={audioBitrate}
										onChange={(event) =>
											onAudioBitrateChange(event.currentTarget.value)
										}
									>
										<option>96kbps</option>
										<option>128kbps</option>
										<option>192kbps</option>
										<option>256kbps</option>
										<option>320kbps</option>
									</select>
								</label>
							) : (
								<label className="setting-field">
									<span>무손실 코덱</span>
									<select
										value={audioLosslessCodec}
										onChange={(event) =>
											onAudioLosslessCodecChange(event.currentTarget.value)
										}
									>
										<option value="flac">FLAC</option>
										<option value="alac">ALAC</option>
										<option value="wavpack">WavPack</option>
									</select>
								</label>
							)}

							<label className="setting-field">
								<span>샘플링 레이트</span>
								<select defaultValue="48kHz">
									<option>44.1kHz</option>
									<option>48kHz</option>
								</select>
							</label>
						</>
					)}

					{activeTab === "video" && (
						<>
							<label className="setting-field">
								<span>비디오 코덱</span>
								<select
									value={videoCodec}
									onChange={(event) =>
										onVideoCodecChange(event.currentTarget.value)
									}
								>
									<option value="h264">H.264 (AVC)</option>
									<option value="h265">H.265 (HEVC)</option>
									<option value="av1">AV1</option>
									<option value="vp9">VP9</option>
								</select>
							</label>
							<label className="setting-field">
								<span>컨테이너</span>
								<select
									value={videoContainer}
									onChange={(event) =>
										onVideoContainerChange(event.currentTarget.value)
									}
								>
									{videoContainerOptions.map((container) => (
										<option key={container} value={container}>
											{container.toUpperCase()}
										</option>
									))}
								</select>
								<small>선택한 코덱과 호환되는 컨테이너만 표시됩니다.</small>
							</label>
							<label className="setting-field">
								<span>비디오 프리셋</span>
								<select
									value={videoPreset}
									onChange={(event) =>
										onVideoPresetChange(event.currentTarget.value)
									}
								>
									<option value="fast">빠름</option>
									<option value="balanced">균형</option>
									<option value="quality">고품질</option>
								</select>
							</label>
							<label className="setting-field">
								<span>CRF</span>
								<input
									type="range"
									min={16}
									max={36}
									value={videoCrf}
									onChange={(event) =>
										onVideoCrfChange(Number(event.currentTarget.value))
									}
								/>
								<small>{videoCrf} (낮을수록 고화질)</small>
							</label>
						</>
					)}

					{activeTab === "output" && (
						<>
							<div className="output-options">
								<label
									className={`output-option ${outputMode === "suffix" ? "active" : ""}`}
								>
									<input
										type="radio"
										name="output-mode"
										checked={outputMode === "suffix"}
										onChange={() => onOutputModeChange("suffix")}
									/>
									<span>현재 폴더 + 접미사</span>
								</label>
								<label
									className={`output-option ${outputMode === "folder" ? "active" : ""}`}
								>
									<input
										type="radio"
										name="output-mode"
										checked={outputMode === "folder"}
										onChange={() => onOutputModeChange("folder")}
									/>
									<span>특정 폴더</span>
								</label>
								<label
									className={`output-option ${outputMode === "new-folder" ? "active" : ""}`}
								>
									<input
										type="radio"
										name="output-mode"
										checked={outputMode === "new-folder"}
										onChange={() => onOutputModeChange("new-folder")}
									/>
									<span>폴더 생성 후 저장</span>
								</label>
							</div>

							{outputMode === "suffix" && (
								<label className="setting-field">
									<span>파일명 접미사</span>
									<input
										type="text"
										value={outputSuffix}
										onChange={(event) =>
											onOutputSuffixChange(event.currentTarget.value)
										}
									/>
								</label>
							)}

							{outputMode === "folder" && (
								<label className="setting-field">
									<span>출력 폴더</span>
									<div className="inline-path-row">
										<input
											type="text"
											value={specificOutputPath}
											onChange={(event) =>
												onSpecificOutputPathChange(event.currentTarget.value)
											}
										/>
										<button type="button">찾아보기</button>
									</div>
								</label>
							)}

							{outputMode === "new-folder" && (
								<label className="setting-field">
									<span>새 폴더 이름</span>
									<input
										type="text"
										value={newFolderName}
										onChange={(event) =>
											onNewFolderNameChange(event.currentTarget.value)
										}
									/>
								</label>
							)}

							<label className="setting-field inline-toggle">
								<span>원본 파일 유지</span>
								<input
									type="checkbox"
									checked={keepOriginal}
									onChange={(event) =>
										onKeepOriginalChange(event.currentTarget.checked)
									}
								/>
							</label>
						</>
					)}
				</div>

				<footer className="modal-actions">
					<button
						type="button"
						className="modal-action-btn secondary"
						onClick={onClose}
					>
						취소
					</button>
					<button
						type="button"
						className="modal-action-btn primary"
						onClick={onClose}
					>
						저장
					</button>
				</footer>
			</section>
		</div>
	);
}

export default SettingsModal;
