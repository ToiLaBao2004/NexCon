export async function isSupported() {
  return false;
}

export function getMessaging() {
  return null;
}

export async function getToken() {
  return '';
}

export async function deleteToken() {
  return true;
}

export function onMessage() {
  return () => {};
}
