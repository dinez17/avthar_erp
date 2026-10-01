export interface PincodeLocation {
  city: string;
  state: string;
}

/** Public India PIN directory lookup. Callers keep the returned fields editable. */
export async function lookupPincode(pincode: string): Promise<PincodeLocation> {
  const response = await fetch(`https://api.pincodeapi.in/api/v1/pincode/${encodeURIComponent(pincode)}`);
  if (!response.ok) throw new Error('PIN code lookup is unavailable');
  const result = await response.json() as {
    success?: boolean;
    data?: { post_offices?: Array<{ district?: string; state?: string; state_name?: string }> };
  };
  const office = result.data?.post_offices?.[0];
  const city = office?.district?.trim() ?? '';
  const state = (office?.state_name ?? office?.state)?.trim() ?? '';
  if (!result.success || !city || !state) throw new Error('No city or state found for this PIN code');
  return { city, state };
}
