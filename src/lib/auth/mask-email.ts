export function maskEmail(email: string): string {
  if (!email || !email.includes("@")) return "your email";
  const [user, domain] = email.split("@");
  if (!user || !domain) return email;
  if (user.length <= 2) {
    return `${user.charAt(0)}***@${domain}`;
  }
  return `${user.charAt(0)}***${user.charAt(user.length - 1)}@${domain}`;
}
