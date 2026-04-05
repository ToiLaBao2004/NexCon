export const getSystemMessageText = (
    message: any,
    currentUserId: string
) => {
    const type = message.type;
    if (type !== 'system') return message.content || "";

    let systemType = message.systemType;
    let metadata = message.metadata || {};
    let content = message.content || "";

    if (!systemType && content.trim().startsWith('{')) {
        try {
            const payload = JSON.parse(content);
            if (payload.type === 'members-added') {
                systemType = 'member_added';
                metadata = {
                    addedBy: payload.addedBy,
                    addedUserIds: payload.addedUserIds,
                    addedUserNames: payload.addedUserNamesString,
                    addedByName: 'Ai đó' // Fallback cho tin nhắn cũ
                };
            }
        } catch (e) {
            // Bỏ qua nếu ko parse được
        }
    }

    if (!systemType) return content || "Thông báo hệ thống";
    const meta = metadata instanceof Map ? Object.fromEntries(metadata) : metadata;

    switch (systemType) {
        case "member_added": {
            const addedBy = meta.addedBy;
            const addedUserIds = Array.isArray(meta.addedUserIds) ? meta.addedUserIds : [];
            const currentIdStr = currentUserId?.toString();

            const isMeAdding = addedBy?.toString() === currentIdStr;
            const isMeAdded = addedUserIds.some((id: any) => id.toString() === currentIdStr);

            const names = meta.addedUserNames || "thành viên mới";
            const adderName = meta.addedByName || "Một người dùng";

            if (isMeAdding) return `Bạn đã thêm ${names} vào nhóm`;
            if (isMeAdded) return `Bạn đã được ${adderName} thêm vào nhóm`;
            return `${names} được ${adderName} thêm vào nhóm`;
        }

        case "member_kicked": {
            const kickedUserId = meta.kickedUserId || meta.removedUserId;
            const adminId = meta.adminId || meta.removedBy;
            const isMeKicking = adminId?.toString() === currentUserId;
            const isMeKicked = kickedUserId?.toString() === currentUserId;

            const kickedName = meta.kickedUserName || meta.removedUserName || "một thành viên";
            const adminName = meta.adminName || meta.removedByName || "Quản trị viên";

            if (isMeKicking) return `Bạn đã xóa ${kickedName} khỏi nhóm`;
            if (isMeKicked) return `Bạn đã bị xóa khỏi nhóm bởi ${adminName}`;
            return `${adminName} đã đưa ${kickedName} ra khỏi nhóm`;
        }

        case "group_disbanded": {
            const disbandedBy = meta.disbandedBy;
            const isMeDisbanding = disbandedBy?.toString() === currentUserId;

            if (isMeDisbanding) return "Bạn đã giải tán nhóm";
            return "Nhóm đã bị giải tán";
        }

        case "member_left": {
            const leftUserId = meta.leftUserId ?? meta.userId;
            const isMeLeaving = leftUserId?.toString() === currentUserId;
            const userName = meta.leftUserName ?? meta.userName ?? "Một thành viên";
            return isMeLeaving ? "Bạn đã rời khỏi nhóm" : `${userName} đã rời khỏi nhóm`;
        }

        case "admin_transferred": {
            const appointedBy = meta.appointedBy;
            const appointedUserId = meta.appointedUserId;
            const appointedUserName = meta.appointedUserInfo?.displayName || "một thành viên";
            const isMeAppointedBy = appointedBy?.toString() === currentUserId;
            const isMeAppointed = appointedUserId?.toString() === currentUserId;

            if (isMeAppointedBy) return `Bạn đã chuyển quyền trưởng nhóm cho ${appointedUserName}`;
            if (isMeAppointed) return "Bạn đã trở thành trưởng nhóm mới";
            return `${appointedUserName} đã trở thành trưởng nhóm mới`;
        }

        case "call_started":
            return "Cuộc gọi đã bắt đầu";
        case "call_ended":
            return "Cuộc gọi đã kết thúc";

        case "approval_mode_changed": {
            const changedBy = meta.changedBy;
            const changedByName = meta.changedByName || "Một quản trị viên";
            const isApprovalRequired = meta.isApprovalRequired;
            const isMe = changedBy?.toString() === currentUserId;

            const name = isMe ? "Bạn" : changedByName;
            const statusStr = isApprovalRequired ? "bật" : "tắt";

            return `${name} đã ${statusStr} chế độ phê duyệt thành viên mới`;
        }

        default:
            return content || "Thông báo hệ thống";
    }
};
