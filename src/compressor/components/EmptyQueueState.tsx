import { UploadCloud } from "lucide-react";

type EmptyQueueStateProps = {
	supportedTypesText: string;
	onOpenFilePicker: () => void;
};

function EmptyQueueState({
	supportedTypesText,
	onOpenFilePicker,
}: EmptyQueueStateProps) {
	return (
		<section className="upload-empty">
			<div className="upload-copy">
				<UploadCloud size={44} className="upload-icon" />
				<div>
					<strong>문서를 여기로 끌어오거나 파일 선택</strong>
					<p>{supportedTypesText}</p>
				</div>
			</div>
			<button type="button" className="solid-button" onClick={onOpenFilePicker}>
				파일 선택
			</button>
		</section>
	);
}

export default EmptyQueueState;
