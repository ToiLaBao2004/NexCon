export const FIELD_LIMITS = {
  displayName: 50,
  phone: 15,
  nickname: 50,
} as const;

const LABELS = {
  displayName: "Tên hiển thị",
  phone: "Số điện thoại",
  nickname: "Nickname",
} as const;

type FieldName = keyof typeof FIELD_LIMITS;

export function checkFieldFormat(field: FieldName, value?: string | null) {
  if (value === undefined || value === null) return null;

  const text = String(value).trim();

  if (field === "displayName" && !text) {
    return "Tên hiển thị không được để trống.";
  }

  if (text.length > FIELD_LIMITS[field]) {
    return `${LABELS[field]} không được vượt quá ${FIELD_LIMITS[field]} ký tự.`;
  }

  if (field === "phone" && text && !/^\d+$/.test(text)) {
    return "Số điện thoại chỉ được chứa chữ số.";
  }

  return null;
}
