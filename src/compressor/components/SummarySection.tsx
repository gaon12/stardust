import { formatBytesToMb } from "../model";

type SummarySectionProps = {
	overallProgress: number;
	documentCount: number;
	completedCount: number;
	savedBytes: number;
};

function SummarySection({
	overallProgress,
	documentCount,
	completedCount,
	savedBytes,
}: SummarySectionProps) {
	return (
		<section className="summary-grid">
			<article className="summary-card progress-card">
				<h2>전체 진행률</h2>
				<div className="summary-main">
					<strong>{overallProgress}%</strong>
					<span>
						{documentCount}개 중 {completedCount}개 완료
					</span>
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
				<b>{formatBytesToMb(savedBytes)}</b>
			</article>
		</section>
	);
}

export default SummarySection;
