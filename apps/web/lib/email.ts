const GMAIL_DOMAINS = new Set(["gmail.com", "googlemail.com"]);

/**
 * Turns an email address into its quota key (BR-2), so one person can't claim
 * extra free prototypes by writing the same address differently.
 * Gmail ignores dots and anything after "+", so those are removed there only;
 * other mail servers may treat them as part of a different address.
 */
export function normalizeEmail(email: string): string {
  const address = email.trim().toLowerCase();
  const at = address.lastIndexOf("@");
  if (at <= 0 || at === address.length - 1) {
    throw new Error(`Not a valid email address: "${email}"`);
  }

  const local = address.slice(0, at);
  const domain = address.slice(at + 1);
  if (!GMAIL_DOMAINS.has(domain)) return address;

  const mailbox = local.split("+")[0].replaceAll(".", "");
  return `${mailbox}@gmail.com`;
}
