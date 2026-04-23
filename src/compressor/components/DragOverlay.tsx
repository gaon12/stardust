import { UploadCloud, X } from "lucide-react";

type DragOverlayProps = {
	isVisible: boolean;
	supportedTypesText: string;
	onClose: () => void;
};

function DragOverlay({
	isVisible,
	supportedTypesText,
	onClose,
}: DragOverlayProps) {
	if (!isVisible) {
		return null;
	}

	return (
		<div className="drop-overlay">
			<div className="drop-overlay-card">
				<UploadCloud size={46} />
				<strong>여기에 문서를 놓으면 바로 추가됩니다</strong>
				<p>{supportedTypesText}</p>
				<button type="button" className="overlay-close" onClick={onClose}>
					<X size={16} /> 닫기
				</button>
			</div>
		</div>
	);
}

export default DragOverlay;
