import { AlertCircle, X } from "lucide-react";
import type { NoticeItem } from "../model";

type NoticeStackProps = {
	notices: NoticeItem[];
	onDismiss: (id: number) => void;
};

function NoticeStack({ notices, onDismiss }: NoticeStackProps) {
	if (notices.length === 0) {
		return null;
	}

	return (
		<section className="notice-stack" aria-live="polite">
			{notices.map((notice) => (
				<div key={notice.id} className={`notice ${notice.kind}`}>
					<AlertCircle size={16} />
					<p>{notice.message}</p>
					<button
						type="button"
						className="notice-dismiss"
						onClick={() => onDismiss(notice.id)}
						aria-label="알림 닫기"
					>
						<X size={14} />
					</button>
				</div>
			))}
		</section>
	);
}

export default NoticeStack;
