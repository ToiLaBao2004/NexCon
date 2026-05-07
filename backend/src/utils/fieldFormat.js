const LIMITS = {
    displayName: 50,
    phone: 15,
    nickname: 50,
};

const LABELS = {
    displayName: 'Tên hiển thị',
    phone: 'Số điện thoại',
    nickname: 'Nickname',
};

export function checkFieldFormat(field, value) {
    if (value === undefined || value === null) return null;

    const text = String(value).trim();

    if (field === 'displayName' && !text) {
        return 'Tên hiển thị không được để trống.';
    }

    if (LIMITS[field] && text.length > LIMITS[field]) {
        return `${LABELS[field] || field} không được vượt quá ${LIMITS[field]} ký tự.`;
    }

    if (field === 'phone' && text && !/^\d+$/.test(text)) {
        return 'Số điện thoại chỉ được chứa chữ số.';
    }

    return null;
}
