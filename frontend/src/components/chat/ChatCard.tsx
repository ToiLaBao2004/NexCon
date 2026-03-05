import { Card } from "../ui/card";
import { formatOnlineTime, cn } from "@/lib/utils";

interface CharCardProps {
	convoId: string;
	name: string;
	timestamp?: Date;
	isActive: boolean;
	onSelect: (id: string) => void;
	unreadCount?: number;
	leftSection: React.ReactNode;
	subtitle: React.ReactNode;
	rightSection?: React.ReactNode;
}

const ChatCard = (
	{
		convoId, name, timestamp, isActive, onSelect, unreadCount, leftSection, subtitle, rightSection
	}: CharCardProps) => {

	return (
		<Card
			key={convoId}
			className={cn("border-none p-3 cursor-pointer transition-smooth glass hover:bg-slate-100 dark:hover:bg-slate-800 group",
				isActive &&
				"ring-2 ring-blue-500/50 bg-linear-to-tr from-blue-500/10 to-blue-500/30"
			)}
			onClick={() => onSelect(convoId)}
		>
			<div className="flex items-center gap-3">
				<div className="relative">{leftSection}</div>

				<div className="flex-1 min-w-0">
					<div className="flex items-center justify-between mb-1">
						<h3 className={cn("font-semibold text-sm truncate",
							unreadCount && unreadCount > 0 && "text-foreground"
						)}
						>
							{name}
						</h3>

						<span
							className="text-xs text-muted-foreground"
						>{timestamp ? formatOnlineTime(timestamp) : ""}</span>
					</div>

					<div className="flex items-center justify-between">
						<div className="flex items-center gap-1 flex-1 min-w-0">{subtitle}</div>
					</div>
				</div>

				{rightSection && (
					<div className="flex items-center shrink-0">
						{rightSection}
					</div>
				)}
			</div>

		</Card>
	)
}
export default ChatCard;