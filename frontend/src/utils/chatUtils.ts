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

        case "group_avatar_updated": {
            const updatedBy = meta.updatedBy;
            const updatedByName = meta.updatedByName || "Một thành viên";
            const isMe = updatedBy?.toString() === currentUserId;
            return isMe ? "Bạn đã đổi ảnh đại diện nhóm" : `${updatedByName} đã đổi ảnh đại diện nhóm`;
        }

        case "group_name_updated": {
            const updatedBy = meta.updatedBy;
            const updatedByName = meta.updatedByName || "Một thành viên";
            const isMe = updatedBy?.toString() === currentUserId;
            const targetName = String(meta.newName || "").trim();

            if (!targetName) {
                return isMe ? "Bạn đã đổi tên nhóm" : `${updatedByName} đã đổi tên nhóm`;
            }

            return isMe
                ? `Bạn đã đổi tên nhóm thành ${targetName}`
                : `${updatedByName} đã đổi tên nhóm thành ${targetName}`;
        }

        case "message_pinned": {
            const actionBy = meta.actionBy;
            const actionByName = meta.actionByName || "Một thành viên";
            const isMe = actionBy?.toString() === currentUserId;
            return isMe ? "Bạn đã ghim một tin nhắn" : `${actionByName} đã ghim một tin nhắn`;
        }

        case "message_unpinned": {
            const actionBy = meta.actionBy;
            const actionByName = meta.actionByName || "Một thành viên";
            const isMe = actionBy?.toString() === currentUserId;
            return isMe ? "Bạn đã bỏ ghim một tin nhắn" : `${actionByName} đã bỏ ghim một tin nhắn`;
        }

        case "call_started":
            return "Cuộc gọi đã bắt đầu";
        case "call_ended":
            return "Cuộc gọi đã kết thúc";
        case "call": {
            const callTypeLabel = meta.callType === "video" ? "Cuộc gọi video" : "Cuộc gọi thoại";
            const suffix = meta.mode === "group" ? " nhóm" : "";
            const participants = Array.isArray(meta.participants) ? meta.participants : [];
            const myParticipant = participants.find((participant: any) => {
                const participantId = participant?.userId?._id || participant?.userId;
                return participantId?.toString?.() === currentUserId?.toString();
            });
            const otherDeclined = participants.some((participant: any) => {
                const participantId = participant?.userId?._id || participant?.userId;
                return participantId?.toString?.() !== currentUserId?.toString() && participant?.status === "declined";
            });

            if (meta.overallStatus === "missed") {
                return `${callTypeLabel}${suffix} nhỡ`;
            }

            if (meta.overallStatus === "canceled") {
                if (myParticipant?.status === "declined") {
                    return `${callTypeLabel}${suffix} đã từ chối`;
                }
                if (otherDeclined) {
                    return `${callTypeLabel}${suffix} đã bị từ chối`;
                }
                return `${callTypeLabel}${suffix} đã hủy`;
            }

            return `${callTypeLabel}${suffix}`;
        }

        case "approval_mode_changed": {
            const changedBy = meta.changedBy;
            const changedByName = meta.changedByName || "Một quản trị viên";
            const isApprovalRequired = meta.isApprovalRequired;
            const isMe = changedBy?.toString() === currentUserId;

            const name = isMe ? "Bạn" : changedByName;
            const statusStr = isApprovalRequired ? "bật" : "tắt";

            return `${name} đã ${statusStr} chế độ phê duyệt thành viên mới`;
        }

        case "group_avatar_permission_changed": {
            const changedBy = meta.changedBy;
            const changedByName = meta.changedByName || "Một quản trị viên";
            const allowMembersChangeAvatar = meta.allowMembersChangeAvatar;
            const isMe = changedBy?.toString() === currentUserId;

            const name = isMe ? "Bạn" : changedByName;
            const statusStr = allowMembersChangeAvatar ? "bật" : "tắt";

            return `${name} đã ${statusStr} quyền cho thành viên đổi tên và ảnh nhóm`;
        }

        case "reminder_created_local": {
            const reminderContent = String(meta.reminderContent || "").trim();
            return reminderContent
                ? `Bạn đã tạo nhắc hẹn mới: ${reminderContent}`
                : "Bạn đã tạo nhắc hẹn mới";
        }

        case "shared_reminder_created": {
            const reminderContent = String(meta.reminderContent || "").trim();
            const creatorId = String(meta.creatorId || "").trim();
            const creatorName = String(meta.creatorName || "Một thành viên").trim();
            const actor = creatorId && creatorId === currentUserId ? "Bạn" : creatorName;

            return reminderContent
                ? `${actor} đã tạo nhắc hẹn chung: ${reminderContent}`
                : `${actor} đã tạo nhắc hẹn chung`;
        }

        case "shared_reminder_participation_changed": {
            const actorId = String(meta.actorId || "").trim();
            const actorNameRaw = String(meta.actorName || "Một thành viên").trim();
            const actorName = actorId && actorId === currentUserId ? "Bạn" : actorNameRaw;
            const action = String(meta.action || "").trim().toLowerCase();
            const reminderContent = String(meta.reminderContent || "").trim();

            if (action === 'joined') {
                return reminderContent
                    ? `${actorName} đã tham gia nhắc hẹn: ${reminderContent}`
                    : `${actorName} đã tham gia nhắc hẹn`;
            }

            if (action === 'declined') {
                return reminderContent
                    ? `${actorName} đã rời nhắc hẹn: ${reminderContent}`
                    : `${actorName} đã rời nhắc hẹn`;
            }

            return content || "Cập nhật tham gia nhắc hẹn chung";
        }

        case "shared_reminder_cancelled": {
            const actorId = String(meta.actorId || "").trim();
            const actorNameRaw = String(meta.actorName || "Một thành viên").trim();
            const actorName = actorId && actorId === currentUserId ? "Bạn" : actorNameRaw;
            const reminderContent = String(meta.reminderContent || "").trim();
            return reminderContent
                ? `${actorName} đã hủy nhắc hẹn chung: ${reminderContent}`
                : `${actorName} đã hủy nhắc hẹn chung`;
        }

        case "shared_reminder_updated": {
            const actorId = String(meta.actorId || "").trim();
            const actorNameRaw = String(meta.actorName || "Một thành viên").trim();
            const actorName = actorId && actorId === currentUserId ? "Bạn" : actorNameRaw;
            const reminderContent = String(meta.reminderContent || "").trim();
            return reminderContent
                ? `${actorName} đã chỉnh sửa nhắc hẹn chung: ${reminderContent}`
                : `${actorName} đã chỉnh sửa nhắc hẹn chung`;
        }

        default:
            return content || "Thông báo hệ thống";
    }
};
