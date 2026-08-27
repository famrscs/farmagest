const DEFAULT_OWNER_EMAIL = "admin@farmagest.app";

function parseEmails(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function getSaasOwnerEmails() {
  const configured = parseEmails(process.env.SAAS_OWNER_EMAILS ?? process.env.ADMIN_EMAILS);
  return configured.length > 0 ? configured : [DEFAULT_OWNER_EMAIL];
}

export function isSaasOwnerEmail(email: string | null | undefined) {
  if (!email) {
    return false;
  }

  return getSaasOwnerEmails().includes(email.trim().toLowerCase());
}
