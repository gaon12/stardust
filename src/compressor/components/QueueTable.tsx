import { CheckCircle2, Clock3, LoaderCircle, X } from "lucide-react";
import {
	type DocumentItem,
	formatBytesToMb,
	getTypeGroup,
	statusLabel,
} from "../model";

type QueueTableProps = {
	documents: DocumentItem[];
	selectedId: number | null;
	onSelect: (id: number) => void;
	onOpen: (document: DocumentItem) => void;
	onRemove: (id: number) => void;
	getReducedSizeLabel: (document: DocumentItem) => string;
};

function QueueTable({
	documents,
	selectedId,
	onSelect,
	onOpen,
	onRemove,
	getReducedSizeLabel,
}: QueueTableProps) {
	return (
		<section className="table-card" aria-label="문서 처리 목록">
			<div className="table-scroll">
				<table>
					<colgroup>
						<col className="col-name" />
						<col className="col-origin" />
						<col className="col-reduced" />
						<col className="col-status" />
					</colgroup>
					<thead>
						<tr>
							<th className="table-col-name">파일명</th>
							<th className="table-col-size">원본 크기</th>
							<th className="table-col-size">줄어든 크기</th>
							<th className="table-col-status">상태</th>
						</tr>
					</thead>
					<tbody>
						{documents.map((item) => {
							return (
								<tr
									key={item.id}
									className={selectedId === item.id ? "selected-row" : ""}
									onClick={() => onSelect(item.id)}
								>
									<td>
										<div className="file-name-cell">
											<span
												className={`file-type-icon ${getTypeGroup(item.type)}`}
												aria-hidden
											>
												{item.type.toUpperCase()}
											</span>
											<button
												type="button"
												className="file-name-button"
												title={item.path || "경로 정보 없음"}
												onClick={(event) => {
													event.stopPropagation();
													onOpen(item);
												}}
											>
												{item.name}
											</button>
										</div>
									</td>
									<td className="table-col-size">
										{formatBytesToMb(item.originalBytes)}
									</td>
									<td className="table-col-size">
										<span className={item.discarded ? "reduced-discarded" : ""}>
											{getReducedSizeLabel(item)}
										</span>
									</td>
									<td className="table-col-status">
										<div className="status-cell">
											<div className="status-meta">
												<span className={`status-chip ${item.status}`}>
													{item.status === "done" && <CheckCircle2 size={15} />}
													{item.status === "processing" && (
														<LoaderCircle size={15} className="spin" />
													)}
													{item.status === "queued" && <Clock3 size={15} />}
													{item.status === "processing"
														? `${statusLabel[item.status]} ${item.progress}%`
														: statusLabel[item.status]}
												</span>
												{item.status === "processing" && (
													<div className="row-progress" aria-hidden>
														<span style={{ width: `${item.progress}%` }} />
													</div>
												)}
											</div>
											<button
												type="button"
												className="queue-remove"
												title="큐에서 제거"
												onClick={(event) => {
													event.stopPropagation();
													onRemove(item.id);
												}}
											>
												<X size={14} />
											</button>
										</div>
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
		</section>
	);
}

export default QueueTable;
