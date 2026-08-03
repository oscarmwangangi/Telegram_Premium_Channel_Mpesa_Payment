import { ValidationError } from "@/lib/errors";

/**
 * Normalizes Kenyan phone numbers to the canonical 2547XXXXXXXX / 2541XXXXXXXX
 * format required by the Daraja API. The original prototype only accepted
 * numbers already starting with "254" and silently ignored everything else.
 *
 * Accepts: 07XXXXXXXX, 01XXXXXXXX, 7XXXXXXXX, 2547XXXXXXXX, +2547XXXXXXXX
 */
export function normalizePhoneNumber(raw: string): string {
  const digits = raw.replace(/\D/g, "");

  let normalized: string;

  if (digits.startsWith("254") && digits.length === 12) {
    normalized = digits;
  } else if (digits.startsWith("0") && digits.length === 10) {
    normalized = `254${digits.slice(1)}`;
  } else if ((digits.startsWith("7") || digits.startsWith("1")) && digits.length === 9) {
    normalized = `254${digits}`;
  } else {
    throw new ValidationError(
      "Invalid phone number. Use format 07XXXXXXXX or 2547XXXXXXXX."
    );
  }

  // Kenyan mobile numbers: 2547XXXXXXXX (Safaricom/most networks) or 2541XXXXXXXX (some Airtel/Telkom ranges)
  if (!/^254[17]\d{8}$/.test(normalized)) {
    throw new ValidationError("Phone number is not a recognized Kenyan mobile number.");
  }

  return normalized;
}
