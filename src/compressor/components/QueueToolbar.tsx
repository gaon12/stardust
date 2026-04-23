import { FolderOpen } from "lucide-react";

type QueueToolbarProps = {
	documentCount: number;
	onOpenFilePicker: () => void;
};

function QueueToolbar({ documentCount, onOpenFilePicker }: QueueToolbarProps) {
	return (
		<section className="list-toolbar">
			<p>{documentCount}개 문서가 대기/처리 목록에 있습니다</p>
			<button type="button" className="solid-button" onClick={onOpenFilePicker}>
				<FolderOpen size={16} />
				파일 선택
			</button>
		</section>
	);
}

export default QueueToolbar;
