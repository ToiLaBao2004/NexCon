export const FIELD_LIMITS = {
  displayName: 50,
  groupName: 100,
  phone: 15,
  nickname: 50,
} as const;

const LABELS = {
  displayName: "Tên hiển thị",
  groupName: "Tên nhóm",
  phone: "Số điện thoại",
  nickname: "Nickname",
} as const;

type FieldName = keyof typeof FIELD_LIMITS;

export function checkFieldFormat(field: FieldName, value?: string | null) {
  if (value === undefined || value === null) return null;

  const text = String(value).trim();

  if ((field === "displayName" || field === "groupName") && !text) {
    return `${LABELS[field]} không được để trống.`;
  }

  if (text.length > FIELD_LIMITS[field]) {
    return `${LABELS[field]} không được vượt quá ${FIELD_LIMITS[field]} ký tự.`;
  }

  if (field === "groupName" && text && !/[\p{L}\p{N}]/u.test(text)) {
    return "Tên nhóm cần có ít nhất một chữ cái hoặc chữ số.";
  }

  if (field === "phone" && text && !/^\d+$/.test(text)) {
    return "Số điện thoại chỉ được chứa chữ số.";
  }

  return null;
}
