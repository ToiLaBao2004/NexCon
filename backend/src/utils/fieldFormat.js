const LIMITS = {
    displayName: 50,
    groupName: 100,
    phone: 15,
    nickname: 50,
};

const LABELS = {
    displayName: 'Tên hiển thị',
    groupName: 'Tên nhóm',
    phone: 'Số điện thoại',
    nickname: 'Nickname',
};

export function checkFieldFormat(field, value) {
    if (value === undefined || value === null) return null;

    const text = String(value).trim();

    if ((field === 'displayName' || field === 'groupName') && !text) {
        return `${LABELS[field] || field} không được để trống.`;
    }

    if (LIMITS[field] && text.length > LIMITS[field]) {
        return `${LABELS[field] || field} không được vượt quá ${LIMITS[field]} ký tự.`;
    }

    if (field === 'groupName' && text && !/[\p{L}\p{N}]/u.test(text)) {
        return 'Tên nhóm cần có ít nhất một chữ cái hoặc chữ số.';
    }

    if (field === 'phone' && text && !/^\d+$/.test(text)) {
        return 'Số điện thoại chỉ được chứa chữ số.';
    }

    return null;
}
