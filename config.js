// Overridable so tests can point the client at a local stub instead of kanka.io.
export const KANKA_API_BASE = process.env.KANKA_API_BASE || "https://api.kanka.io/1.0";

let _token = process.env.KANKA_API_TOKEN || "";

export function getKankaApiToken() {
  return _token;
}

export function setKankaApiToken(token) {
  _token = token;
}
