import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Loader2, Check } from "lucide-react";

export default function RequestsTab({ sentRequests, incomingRequests, processingId, onCancel, onAccept, onReject }: { sentRequests: any[]; incomingRequests: any[]; processingId: string | null; onCancel: (id: string) => Promise<void>; onAccept: (id: string) => Promise<void>; onReject: (id: string) => Promise<void>; }) {
    return (
        <div className="grid grid-cols-1 gap-6">
            <div>
                <h4 className="text-sm font-semibold text-foreground mb-3">LỜI MỜI ĐÃ GỬI</h4>
                {sentRequests.length > 0 ? (
                    <div className="space-y-2">
                        {sentRequests.map((r) => (
                            <div key={r._id} className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border/40">
                                <Avatar className="h-10 w-10"><AvatarImage src={r.to.avatarUrl} /><AvatarFallback>{r.to.displayName.charAt(0)}</AvatarFallback></Avatar>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-foreground truncate">{r.to.displayName}</p>
                                    <p className="text-xs text-muted-foreground truncate">{r.message || r.to.email}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button size="sm" variant="outline" onClick={async () => { await onCancel(r._id); }}>Hủy</Button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="h-40 flex items-center justify-center text-muted-foreground">Chưa gửi lời mời nào</div>
                )}
            </div>

            <div>
                <h4 className="text-sm font-semibold text-foreground mb-3">LỜI MỜI ĐẾN</h4>
                {incomingRequests.length > 0 ? (
                    <div className="space-y-2">
                        {incomingRequests.map((request) => {
                            const isProcessing = processingId === request._id;
                            return (
                                <div key={request._id} className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border/40">
                                    <Avatar className="h-10 w-10"><AvatarImage src={request.from.avatarUrl} /><AvatarFallback>{request.from.displayName.charAt(0)}</AvatarFallback></Avatar>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-foreground truncate">{request.from.displayName}</p>
                                        <p className="text-xs text-muted-foreground truncate">{request.message || request.from.email}</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Button size="sm" disabled={isProcessing} onClick={async () => { await onAccept(request._id); }} className="h-8">{isProcessing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Đồng ý</Button>
                                        <Button size="sm" variant="outline" disabled={isProcessing} onClick={async () => { await onReject(request._id); }} className="h-8">Từ chối</Button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="h-40 flex items-center justify-center text-muted-foreground">Không có lời mời đến</div>
                )}
            </div>
        </div>
    );
}
