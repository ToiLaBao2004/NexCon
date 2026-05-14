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
	statusIcon?: React.ReactNode;
	titleAccessory?: React.ReactNode;
	density?: "default" | "people";
}

const ChatCard = (
	{
		convoId, name, timestamp, isActive, onSelect, unreadCount, leftSection, subtitle, rightSection, statusIcon, titleAccessory, density = "default"
	}: CharCardProps) => {
	const isPeopleDensity = density === "people";

	return (
		<Card
			key={convoId}
			className={cn(
				"border border-transparent cursor-pointer transition-colors bg-transparent shadow-none hover:bg-muted/60 group",
				isPeopleDensity ? "min-h-[84px] rounded-xl px-4 py-3.5" : "p-3",
				isActive &&
				"bg-primary/15 border-primary/25 shadow-[inset_3px_0_0_hsl(var(--primary))]"
			)}
			onClick={() => onSelect(convoId)}
		>
			<div className={cn("flex items-center", isPeopleDensity ? "gap-4" : "gap-3")}>
				<div className="relative">{leftSection}</div>

				<div className="flex-1 min-w-0">
					<div className="flex items-center justify-between mb-1">
						<div className="flex items-center gap-1 min-w-0 overflow-hidden">
							<h3 className={cn(isPeopleDensity ? "text-base truncate" : "text-sm truncate",
								unreadCount && unreadCount > 0 ? "font-bold text-foreground" : "font-semibold text-slate-800 dark:text-zinc-200"
							)}
							>
								{name}
							</h3>
						</div>
						{titleAccessory && <div className="flex-shrink-0 ml-1">{titleAccessory}</div>}


						<span
							className="text-xs text-muted-foreground ml-auto pl-2"
						>{timestamp ? formatOnlineTime(timestamp) : ""}</span>
					</div>

					<div className="flex items-center justify-between mt-0.5">
						<div className="flex items-center gap-1 flex-1 min-w-0">{subtitle}</div>
						{statusIcon && (
							<div className="ml-2 flex-shrink-0">
								{statusIcon}
							</div>
						)}
					</div>
				</div>

				{rightSection && (
					<div className="flex items-center shrink-0 ml-1">
						{rightSection}
					</div>
				)}
			</div>

		</Card>
	)
}
export default ChatCard;
