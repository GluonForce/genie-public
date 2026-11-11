/**
 * Turns an email address into its quota key (BR-2): trimmed and lower-cased.
 * Dots and "+tags" are kept, because two such addresses may belong to
 * different people.
 */
export function normalizeEmail(email: string): string {
  const address = email.trim().toLowerCase();
  const at = address.lastIndexOf("@");
  if (at <= 0 || at === address.length - 1) {
    throw new Error(`Not a valid email address: "${email}"`);
  }
  return address;
}
