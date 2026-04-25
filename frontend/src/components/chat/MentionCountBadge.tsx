import { Badge } from '../ui/badge';

const MentionCountBadge = ({ count }: { count: number }) => {
  const label = count > 9 ? "@9+" : `@${count}`;

  return (
    <div className="pulse-ring absolute z-20 -top-1 -left-1">
      <Badge
        variant="secondary"
        className="h-5 min-w-5 px-1 flex items-center justify-center text-[10px] font-bold border border-blue-500/20 bg-blue-500 text-white shadow-md"
        title={`${count} lượt nhắc đến chưa đọc`}
      >
        {label}
      </Badge>
    </div>
  );
};

export default MentionCountBadge;
