type ApiPayload = {
  message?: unknown;
  code?: unknown;
  error?: unknown;
  title?: unknown;
};

type ApiErrorLike = {
  response?: {
    status?: number;
    data?: ApiPayload;
  };
  message?: unknown;
  code?: unknown;
  details?: ApiPayload;
};

type FieldHint = "email" | "password" | "currentPassword" | "newPassword" | "confirmPassword" | "otp" | "root";

const DEFAULT_ERROR_MESSAGE = "Đã xảy ra lỗi. Vui lòng thử lại.";

const CODE_MESSAGES: Record<string, string> = {
  PENDING_APPEAL_EXISTS: "Bạn đã có một kháng cáo đang chờ xem xét. Vui lòng chờ kết quả trước khi gửi kháng cáo mới.",
  COMMUNITY_STANDARD_VIOLATION: "Nội dung không phù hợp với tiêu chuẩn cộng đồng.",
  FRIEND_LIMIT_REACHED: "Bạn đã đạt giới hạn bạn bè.",
  PENDING_REQUEST_LIMIT_REACHED: "Bạn đã đạt giới hạn lời mời kết bạn đang chờ.",
};

const EXACT_MESSAGES: Record<string, string> = {
  "all fields are required": "Vui lòng nhập đầy đủ thông tin.",
  "all fields are required.": "Vui lòng nhập đầy đủ thông tin.",
  "passwords do not match": "Mật khẩu không khớp.",
  "passwords do not match.": "Mật khẩu không khớp.",
  "mật khẩu hiện tại không chính xác": "Mật khẩu hiện tại không đúng.",
  "mật khẩu hiện tại không chính xác.": "Mật khẩu hiện tại không đúng.",
  "mật khẩu mới không được trùng với mật khẩu hiện tại": "Mật khẩu mới không được trùng với mật khẩu hiện tại.",
  "mật khẩu mới không được trùng với mật khẩu hiện tại.": "Mật khẩu mới không được trùng với mật khẩu hiện tại.",
  "email already in use": "Email này đã được sử dụng.",
  "email already in use.": "Email này đã được sử dụng.",
  "invalid email format": "Địa chỉ email không hợp lệ.",
  "invalid email format.": "Địa chỉ email không hợp lệ.",
  "password must be at least 8 characters long": "Mật khẩu phải có ít nhất 8 ký tự.",
  "password must be at least 8 characters long.": "Mật khẩu phải có ít nhất 8 ký tự.",
  "all fields are valid": "Thông tin hợp lệ.",
  "all fields are valid.": "Thông tin hợp lệ.",
  "internal server error": "Máy chủ đang gặp sự cố. Vui lòng thử lại sau.",
  "internal server error.": "Máy chủ đang gặp sự cố. Vui lòng thử lại sau.",
  "invalid or expired otp": "Mã OTP không hợp lệ hoặc đã hết hạn.",
  "invalid or expired otp.": "Mã OTP không hợp lệ hoặc đã hết hạn.",
  "user registered successfully": "Đăng ký thành công.",
  "user registered successfully.": "Đăng ký thành công.",
  "email and password are required": "Vui lòng nhập email và mật khẩu.",
  "email and password are required.": "Vui lòng nhập email và mật khẩu.",
  "invalid email or password": "Email hoặc mật khẩu không đúng.",
  "invalid email or password.": "Email hoặc mật khẩu không đúng.",
  "cannot sign out another user session": "Bạn không thể đăng xuất phiên của người dùng khác.",
  "cannot sign out another user session.": "Bạn không thể đăng xuất phiên của người dùng khác.",
  "user logged out successfully": "Đăng xuất thành công.",
  "user logged out successfully.": "Đăng xuất thành công.",
  "logged out from all devices successfully": "Đã đăng xuất khỏi tất cả thiết bị.",
  "logged out from all devices successfully.": "Đã đăng xuất khỏi tất cả thiết bị.",
  "unauthorized": "Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.",
  "unauthorized.": "Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.",
  "invalid session": "Phiên đăng nhập không hợp lệ.",
  "invalid session.": "Phiên đăng nhập không hợp lệ.",
  "session expired": "Phiên đăng nhập đã hết hạn.",
  "session expired.": "Phiên đăng nhập đã hết hạn.",
  "session not found": "Không tìm thấy phiên đăng nhập.",
  "session not found.": "Không tìm thấy phiên đăng nhập.",
  "invalid or expired reset token": "Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.",
  "invalid or expired reset token.": "Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.",
  "invalid token purpose": "Token không hợp lệ cho thao tác này.",
  "invalid token purpose.": "Token không hợp lệ cho thao tác này.",
  "user not found": "Không tìm thấy người dùng.",
  "user not found.": "Không tìm thấy người dùng.",
  "server error": "Máy chủ đang gặp sự cố. Vui lòng thử lại sau.",
  "password updated successfully": "Cập nhật mật khẩu thành công.",
  "password updated successfully.": "Cập nhật mật khẩu thành công.",
  "oauth failed": "Đăng nhập bằng Google thất bại.",
  "token not found": "Không tìm thấy token xác thực.",
  "token not found.": "Không tìm thấy token xác thực.",
  "invalid or expired refresh token": "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
  "invalid or expired refresh token.": "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
  "idtoken is required": "Thiếu token đăng nhập Google.",
  "idtoken is required.": "Thiếu token đăng nhập Google.",
  "invalid google token": "Token Google không hợp lệ.",
  "invalid google token.": "Token Google không hợp lệ.",
  "authorization header missing or malformed": "Thiếu thông tin xác thực. Vui lòng đăng nhập lại.",
  "authorization header missing or malformed.": "Thiếu thông tin xác thực. Vui lòng đăng nhập lại.",
  "session expired or not found": "Phiên đăng nhập đã hết hạn hoặc không tồn tại.",
  "session expired or not found.": "Phiên đăng nhập đã hết hạn hoặc không tồn tại.",
  "token expired": "Phiên đăng nhập đã hết hạn.",
  "invalid token": "Token xác thực không hợp lệ.",
  "admin access is required": "Bạn cần quyền quản trị để thực hiện thao tác này.",
  "admin access is required.": "Bạn cần quyền quản trị để thực hiện thao tác này.",
  "user access is required": "Bạn cần đăng nhập để thực hiện thao tác này.",
  "user access is required.": "Bạn cần đăng nhập để thực hiện thao tác này.",
  "conversation not found": "Không tìm thấy cuộc trò chuyện.",
  "conversation not found.": "Không tìm thấy cuộc trò chuyện.",
  "you are not a participant in this conversation": "Bạn không phải thành viên của cuộc trò chuyện này.",
  "you are not a participant in this conversation.": "Bạn không phải thành viên của cuộc trò chuyện này.",
  "you are not a member of this conversation": "Bạn không phải thành viên của cuộc trò chuyện này.",
  "you are not a member of this conversation.": "Bạn không phải thành viên của cuộc trò chuyện này.",
  "you are not in this group": "Bạn không còn là thành viên của nhóm này.",
  "you are not in this group.": "Bạn không còn là thành viên của nhóm này.",
  "you are not friends with this user": "Bạn chỉ có thể nhắn tin hoặc thêm bạn bè của mình.",
  "you are not friends with this user.": "Bạn chỉ có thể nhắn tin hoặc thêm bạn bè của mình.",
  "you can only add your friends to the group": "Bạn chỉ có thể thêm bạn bè vào nhóm.",
  "only group participants can rename the group": "Chỉ thành viên nhóm mới có thể đổi tên nhóm.",
  "only group participants can rename the group.": "Chỉ thành viên nhóm mới có thể đổi tên nhóm.",
  "group name unchanged": "Tên nhóm không thay đổi.",
  "group name unchanged.": "Tên nhóm không thay đổi.",
  "group name updated successfully": "Đã cập nhật tên nhóm.",
  "group name updated successfully.": "Đã cập nhật tên nhóm.",
  "no file uploaded": "Vui lòng chọn file để tải lên.",
  "no file uploaded.": "Vui lòng chọn file để tải lên.",
  "uploaded file is not an image": "File tải lên không phải là ảnh.",
  "uploaded file is not an image.": "File tải lên không phải là ảnh.",
  "only group conversations can update avatar": "Chỉ nhóm mới có thể cập nhật ảnh đại diện.",
  "only group conversations can update avatar.": "Chỉ nhóm mới có thể cập nhật ảnh đại diện.",
  "only group participants can update group avatar": "Chỉ thành viên nhóm mới có thể cập nhật ảnh đại diện nhóm.",
  "only group participants can update group avatar.": "Chỉ thành viên nhóm mới có thể cập nhật ảnh đại diện nhóm.",
  "group avatar updated successfully": "Đã cập nhật ảnh đại diện nhóm.",
  "group avatar updated successfully.": "Đã cập nhật ảnh đại diện nhóm.",
  "only group conversations can be disbanded": "Chỉ nhóm mới có thể giải tán.",
  "only group conversations can be disbanded.": "Chỉ nhóm mới có thể giải tán.",
  "only admins can disband the group": "Chỉ quản trị viên nhóm mới có thể giải tán nhóm.",
  "only admins can disband the group.": "Chỉ quản trị viên nhóm mới có thể giải tán nhóm.",
  "group already disbanded": "Nhóm này đã bị giải tán.",
  "group already disbanded.": "Nhóm này đã bị giải tán.",
  "conversation cleared successfully": "Đã xóa cuộc trò chuyện.",
  "conversation cleared successfully.": "Đã xóa cuộc trò chuyện.",
  "user ids are required and must be an array": "Danh sách người dùng không hợp lệ.",
  "user ids are required and must be an array.": "Danh sách người dùng không hợp lệ.",
  "only group conversations can have members added": "Chỉ nhóm mới có thể thêm thành viên.",
  "only group conversations can have members added.": "Chỉ nhóm mới có thể thêm thành viên.",
  "only group participants can add members": "Chỉ thành viên nhóm mới có thể thêm người.",
  "only group participants can add members.": "Chỉ thành viên nhóm mới có thể thêm người.",
  "settings updated successfully": "Đã cập nhật cài đặt.",
  "settings updated successfully.": "Đã cập nhật cài đặt.",
  "invalid request data": "Dữ liệu yêu cầu không hợp lệ.",
  "invalid request data.": "Dữ liệu yêu cầu không hợp lệ.",
  "only group conversations have settings": "Chỉ nhóm mới có cài đặt này.",
  "only group conversations have settings.": "Chỉ nhóm mới có cài đặt này.",
  "only admins can update group settings": "Chỉ quản trị viên nhóm mới có thể cập nhật cài đặt.",
  "only admins can update group settings.": "Chỉ quản trị viên nhóm mới có thể cập nhật cài đặt.",
  "only group conversations have approvals": "Chỉ nhóm mới có hàng chờ phê duyệt.",
  "only group conversations have approvals.": "Chỉ nhóm mới có hàng chờ phê duyệt.",
  "only admins can handle approvals": "Chỉ quản trị viên nhóm mới có thể xử lý yêu cầu.",
  "only admins can handle approvals.": "Chỉ quản trị viên nhóm mới có thể xử lý yêu cầu.",
  "user is not in the approval queue": "Người dùng không có trong hàng chờ phê duyệt.",
  "user is not in the approval queue.": "Người dùng không có trong hàng chờ phê duyệt.",
  "not a group": "Đây không phải là nhóm.",
  "not a group.": "Đây không phải là nhóm.",
  "only admins can view the queue": "Chỉ quản trị viên nhóm mới có thể xem hàng chờ.",
  "only admins can view the queue.": "Chỉ quản trị viên nhóm mới có thể xem hàng chờ.",
  "only group conversations can have members removed": "Chỉ nhóm mới có thể xóa thành viên.",
  "only group conversations can have members removed.": "Chỉ nhóm mới có thể xóa thành viên.",
  "only admins can remove members": "Chỉ quản trị viên nhóm mới có thể xóa thành viên.",
  "only admins can remove members.": "Chỉ quản trị viên nhóm mới có thể xóa thành viên.",
  "admin cannot remove themselves using this route": "Quản trị viên không thể tự xóa mình bằng thao tác này.",
  "admin cannot remove themselves using this route.": "Quản trị viên không thể tự xóa mình bằng thao tác này.",
  "cannot remove another admin from the group": "Không thể xóa quản trị viên khác khỏi nhóm.",
  "cannot remove another admin from the group.": "Không thể xóa quản trị viên khác khỏi nhóm.",
  "member not found in group": "Không tìm thấy thành viên trong nhóm.",
  "member not found in group.": "Không tìm thấy thành viên trong nhóm.",
  "member removed successfully": "Đã xóa thành viên khỏi nhóm.",
  "member removed successfully.": "Đã xóa thành viên khỏi nhóm.",
  "only group conversations can transfer admin role": "Chỉ nhóm mới có thể chuyển quyền trưởng nhóm.",
  "only group conversations can transfer admin role.": "Chỉ nhóm mới có thể chuyển quyền trưởng nhóm.",
  "only admins can transfer admin role": "Chỉ quản trị viên nhóm mới có thể chuyển quyền trưởng nhóm.",
  "only admins can transfer admin role.": "Chỉ quản trị viên nhóm mới có thể chuyển quyền trưởng nhóm.",
  "user is not a participant in this group": "Người dùng không phải thành viên của nhóm này.",
  "user is not a participant in this group.": "Người dùng không phải thành viên của nhóm này.",
  "only group conversations can be left": "Chỉ nhóm mới có thể rời khỏi.",
  "only group conversations can be left.": "Chỉ nhóm mới có thể rời khỏi.",
  "messageid is required": "Thiếu thông tin tin nhắn.",
  "messageid is required.": "Thiếu thông tin tin nhắn.",
  "message not found": "Không tìm thấy tin nhắn.",
  "message not found.": "Không tìm thấy tin nhắn.",
  "either recipientid (direct) or conversationid (group) is required": "Thiếu thông tin người nhận hoặc cuộc trò chuyện.",
  "either recipientid (direct) or conversationid (group) is required.": "Thiếu thông tin người nhận hoặc cuộc trò chuyện.",
  "recipient id or member id is required": "Thiếu thông tin người nhận hoặc thành viên.",
  "recipient id or member id is required.": "Thiếu thông tin người nhận hoặc thành viên.",
  "email is required": "Vui lòng nhập email.",
  "email is required.": "Vui lòng nhập email.",
  "user with this email not found": "Không tìm thấy người dùng với email này.",
  "user with this email not found.": "Không tìm thấy người dùng với email này.",
  "you cannot send a friend request to this user": "Bạn không thể gửi lời mời kết bạn tới người dùng này.",
  "you cannot send a friend request to this user.": "Bạn không thể gửi lời mời kết bạn tới người dùng này.",
  "you cannot send a friend request to yourself": "Bạn không thể gửi lời mời kết bạn cho chính mình.",
  "you cannot send a friend request to yourself.": "Bạn không thể gửi lời mời kết bạn cho chính mình.",
  "you are already friends with this user": "Hai bạn đã là bạn bè.",
  "you are already friends with this user.": "Hai bạn đã là bạn bè.",
  "you already sent a friend request to this user": "Bạn đã gửi lời mời kết bạn tới người dùng này.",
  "you already sent a friend request to this user.": "Bạn đã gửi lời mời kết bạn tới người dùng này.",
  "friend request not found": "Không tìm thấy lời mời kết bạn.",
  "friend request not found.": "Không tìm thấy lời mời kết bạn.",
  "you are not authorized to accept this friend request": "Bạn không có quyền chấp nhận lời mời này.",
  "you are not authorized to accept this friend request.": "Bạn không có quyền chấp nhận lời mời này.",
  "you are not authorized to reject this friend request": "Bạn không có quyền từ chối lời mời này.",
  "you are not authorized to reject this friend request.": "Bạn không có quyền từ chối lời mời này.",
  "you are not authorized to cancel this friend request": "Bạn không có quyền hủy lời mời này.",
  "you are not authorized to cancel this friend request.": "Bạn không có quyền hủy lời mời này.",
  "you are not authorized to resend this friend request": "Bạn không có quyền gửi lại lời mời này.",
  "you are not authorized to resend this friend request.": "Bạn không có quyền gửi lại lời mời này.",
  "this friend request is no longer pending": "Lời mời kết bạn này không còn chờ xử lý.",
  "this friend request is no longer pending.": "Lời mời kết bạn này không còn chờ xử lý.",
  "this friend request is no longer rejected": "Lời mời kết bạn này không còn ở trạng thái bị từ chối.",
  "this friend request is no longer rejected.": "Lời mời kết bạn này không còn ở trạng thái bị từ chối.",
  "friendship not found": "Không tìm thấy quan hệ bạn bè.",
  "friendship not found.": "Không tìm thấy quan hệ bạn bè.",
  "notification not found": "Không tìm thấy thông báo.",
  "failed to fetch notifications": "Không thể tải thông báo.",
  "notification marked as read": "Đã đánh dấu thông báo là đã đọc.",
  "failed to mark notification as read": "Không thể đánh dấu thông báo là đã đọc.",
  "all notifications marked as read": "Đã đánh dấu tất cả thông báo là đã đọc.",
  "failed to mark all notifications as read": "Không thể đánh dấu tất cả thông báo là đã đọc.",
  "notification marked as unread": "Đã đánh dấu thông báo là chưa đọc.",
  "failed to mark notification as unread": "Không thể đánh dấu thông báo là chưa đọc.",
  "notification deleted": "Đã xóa thông báo.",
  "failed to delete notification": "Không thể xóa thông báo.",
  "status_mode must be auto or manual": "Chế độ trạng thái không hợp lệ.",
  "status_mode must be auto or manual.": "Chế độ trạng thái không hợp lệ.",
  "livekit credentials are missing": "Thiếu cấu hình cuộc gọi. Vui lòng thử lại sau.",
  "email không hợp lệ": "Địa chỉ email không hợp lệ.",
  "email không hợp lệ.": "Địa chỉ email không hợp lệ.",
  "vui lòng mô tả lý do kháng cáo ít nhất 20 ký tự": "Vui lòng mô tả lý do kháng cáo ít nhất 20 ký tự.",
  "vui lòng mô tả lý do kháng cáo ít nhất 20 ký tự.": "Vui lòng mô tả lý do kháng cáo ít nhất 20 ký tự.",
  "nội dung kháng cáo không được vượt quá 2000 ký tự": "Nội dung kháng cáo không được vượt quá 2000 ký tự.",
  "nội dung kháng cáo không được vượt quá 2000 ký tự.": "Nội dung kháng cáo không được vượt quá 2000 ký tự.",
  "tài khoản này không ở trạng thái bị khóa": "Tài khoản này không ở trạng thái bị khóa.",
  "tài khoản này không ở trạng thái bị khóa.": "Tài khoản này không ở trạng thái bị khóa.",
  "không thể gửi kháng cáo. vui lòng thử lại": "Không thể gửi kháng cáo. Vui lòng thử lại.",
  "không thể gửi kháng cáo. vui lòng thử lại.": "Không thể gửi kháng cáo. Vui lòng thử lại.",
  "mã cuộc họp không hợp lệ": "Mã cuộc họp không hợp lệ.",
  "mã cuộc họp không hợp lệ.": "Mã cuộc họp không hợp lệ.",
  "không tìm thấy phòng họp": "Không tìm thấy phòng họp.",
  "không tìm thấy phòng họp.": "Không tìm thấy phòng họp.",
  "cuộc họp đã kết thúc": "Cuộc họp này đã kết thúc.",
  "không thể tạo cuộc họp": "Không thể tạo cuộc họp.",
  "không thể tham gia phòng họp": "Không thể tham gia phòng họp.",
  "không thể lấy thông tin phòng họp": "Không thể lấy thông tin phòng họp.",
  "không thể kết thúc cuộc họp": "Không thể kết thúc cuộc họp.",
  "nhóm này đã bị giải tán": "Nhóm này đã bị giải tán.",
  "nhóm này đã bị giải tán.": "Nhóm này đã bị giải tán.",
  "nhóm này đã bị giải tán, bạn không thể thực hiện thao tác.": "Nhóm này đã bị giải tán, bạn không thể thực hiện thao tác.",
  "bạn không phải thành viên của nhóm này.": "Bạn không phải thành viên của nhóm này.",
  "bạn cần chọn trưởng nhóm mới trước khi rời nhóm.": "Bạn cần chọn trưởng nhóm mới trước khi rời nhóm.",
  "trưởng nhóm mới phải là thành viên còn lại trong nhóm.": "Trưởng nhóm mới phải là thành viên còn lại trong nhóm.",
  "không thể chuyển quyền trưởng nhóm cho tài khoản đã bị khóa.": "Không thể chuyển quyền trưởng nhóm cho tài khoản đã bị khóa.",
  "không thể thêm tài khoản đã bị khóa vào nhóm.": "Không thể thêm tài khoản đã bị khóa vào nhóm.",
  "không thể gửi tin nhắn tới tài khoản đã bị khóa.": "Không thể gửi tin nhắn tới tài khoản đã bị khóa.",
  "không thể gửi lời mời kết bạn tới tài khoản đã bị khóa.": "Không thể gửi lời mời kết bạn tới tài khoản đã bị khóa.",
  "không thể chấp nhận lời mời từ tài khoản đã bị khóa.": "Không thể chấp nhận lời mời từ tài khoản đã bị khóa.",
  "không thể cập nhật biệt danh cho tài khoản đã bị khóa.": "Không thể cập nhật biệt danh cho tài khoản đã bị khóa.",
  "người nhận không tồn tại.": "Người nhận không tồn tại.",
};

const STATUS_MESSAGES: Record<number, string> = {
  400: "Dữ liệu gửi lên không hợp lệ.",
  401: "Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.",
  403: "Bạn không có quyền thực hiện thao tác này.",
  404: "Không tìm thấy dữ liệu phù hợp.",
  409: "Thao tác bị trùng hoặc xung đột với dữ liệu hiện tại.",
  410: "Nội dung này không còn khả dụng.",
  413: "File quá lớn. Vui lòng chọn file nhỏ hơn.",
  423: "Tài khoản đang bị hạn chế.",
  429: "Bạn thao tác quá nhanh. Vui lòng thử lại sau.",
  500: "Máy chủ đang gặp sự cố. Vui lòng thử lại sau.",
  502: "Hệ thống tạm thời không phản hồi. Vui lòng thử lại sau.",
  503: "Hệ thống đang bảo trì hoặc quá tải. Vui lòng thử lại sau.",
  504: "Kết nối tới máy chủ quá lâu. Vui lòng thử lại sau.",
};

const MESSAGE_RULES: Array<{ test: (message: string) => boolean; text: string }> = [
  {
    test: (message) => message.includes("manual_status must be one of"),
    text: "Trạng thái thủ công không hợp lệ.",
  },
  {
    test: (message) => message.includes("not friends"),
    text: "Bạn chỉ có thể nhắn tin hoặc thêm bạn bè của mình.",
  },
  {
    test: (message) => message.includes("not in this group") || message.includes("not a member"),
    text: "Bạn không còn là thành viên của cuộc trò chuyện này.",
  },
  {
    test: (message) => message.includes("conversation not found"),
    text: "Không tìm thấy cuộc trò chuyện.",
  },
  {
    test: (message) => message.includes("message not found"),
    text: "Không tìm thấy tin nhắn.",
  },
  {
    test: (message) => message.includes("upload error"),
    text: "Không thể tải file lên. Vui lòng kiểm tra file và thử lại.",
  },
  {
    test: (message) => message.includes("file too large") || message.includes("too large"),
    text: "File quá lớn. Vui lòng chọn file nhỏ hơn.",
  },
  {
    test: (message) => message.includes("nhóm chỉ có thể chứa tối đa"),
    text: "Nhóm đã đạt giới hạn thành viên.",
  },
  {
    test: (message) => message.includes("tất cả người dùng được chọn đã là thành viên"),
    text: "Tất cả người dùng được chọn đã là thành viên của nhóm.",
  },
  {
    test: (message) => message.includes("tất cả người dùng được chọn đã có trong hàng chờ"),
    text: "Tất cả người dùng được chọn đã có trong hàng chờ phê duyệt.",
  },
  {
    test: (message) => message.includes("room") && message.includes("limit"),
    text: "Phòng đã đạt giới hạn người tham gia.",
  },
  {
    test: (message) => message.includes("phong hop da dat gioi han"),
    text: "Phòng họp đã đạt giới hạn người tham gia.",
  },
  {
    test: (message) => message.includes("waiting") && message.includes("limit"),
    text: "Phòng chờ đã đạt giới hạn.",
  },
  {
    test: (message) => message.includes("phong cho da dat gioi han"),
    text: "Phòng chờ đã đạt giới hạn.",
  },
  {
    test: (message) => message.includes("is already blocked by you"),
    text: "Bạn đã chặn người dùng này.",
  },
  {
    test: (message) => message.includes("is not blocked by you"),
    text: "Bạn chưa chặn người dùng này.",
  },
  {
    test: (message) => message.includes("scheduledat"),
    text: "Thời gian lên lịch không hợp lệ.",
  },
  {
    test: (message) => message.includes("search type"),
    text: "Kiểu tìm kiếm không hợp lệ.",
  },
  {
    test: (message) => message.includes("current password"),
    text: "Mật khẩu hiện tại không đúng.",
  },
];

const hasNetwork = () => typeof navigator === "undefined" || navigator.onLine;

const normalizeMessage = (value: unknown) => String(value || "")
  .trim()
  .toLowerCase()
  .replace(/\s+/g, " ");

const extractPayload = (value: unknown): ApiPayload | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const error = value as ApiErrorLike;
  return error.response?.data || error.details;
};

const extractStatus = (value: unknown): number | undefined => {
  if (!value || typeof value !== "object") return undefined;
  return (value as ApiErrorLike).response?.status;
};

export function translateApiMessage(message: unknown, fallback = "") {
  const normalized = normalizeMessage(message);
  if (!normalized) return fallback;

  const exact = EXACT_MESSAGES[normalized] || EXACT_MESSAGES[normalized.replace(/\.$/, "")];
  if (exact) return exact;

  const rule = MESSAGE_RULES.find((item) => item.test(normalized));
  if (rule) return rule.text;

  return fallback;
}

export function getApiErrorMessage(error: unknown, fallback = DEFAULT_ERROR_MESSAGE) {
  if (!hasNetwork()) return "Không có kết nối mạng.";

  const payload = extractPayload(error);
  const code = String(payload?.code || (error as ApiErrorLike | null)?.code || "").trim();
  if (code && CODE_MESSAGES[code]) return CODE_MESSAGES[code];

  const message = payload?.message || payload?.error || (error as ApiErrorLike | null)?.message;
  const translated = translateApiMessage(message);
  if (translated) return translated;

  const status = extractStatus(error);
  if (status && STATUS_MESSAGES[status]) return STATUS_MESSAGES[status];

  return fallback;
}

export function getApiSuccessMessage(value: unknown, fallback: string) {
  const payload = extractPayload(value) || (value && typeof value === "object" ? value as ApiPayload : undefined);
  return translateApiMessage(payload?.message || value, fallback);
}

export function getApiMessageText(error: unknown) {
  const payload = extractPayload(error);
  return String(payload?.message || payload?.error || "");
}

export function getApiErrorField(error: unknown, fallback: FieldHint = "root"): FieldHint {
  const payload = extractPayload(error);
  const raw = normalizeMessage(payload?.message || payload?.error || (error as ApiErrorLike | null)?.message);

  if (raw.includes("otp")) return "otp";
  if (raw.includes("passwords do not match") || raw.includes("mật khẩu không khớp")) return "confirmPassword";
  if (raw.includes("email")) return "email";
  if (raw.includes("current") || raw.includes("hiện tại")) return "currentPassword";
  if (raw.includes("confirmnewpassword") || raw.includes("confirm password") || raw.includes("xác nhận")) {
    return "confirmPassword";
  }
  if (raw.includes("newpassword") || raw.includes("new password") || raw.includes("mới")) return "newPassword";
  if (raw.includes("password") || raw.includes("mật khẩu")) return "password";

  return fallback;
}
