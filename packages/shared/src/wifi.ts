/**
 * Builds the standard Wi-Fi QR payload understood by iOS and Android cameras:
 *   WIFI:T:WPA;S:<ssid>;P:<password>;H:false;;
 * Special characters (\ ; , : ") must be backslash-escaped.
 * Note: browsers cannot join a network themselves — the guest scans this code
 * with their camera, or types the password in their settings.
 */
export function escapeWifiValue(value: string): string {
  return value.replace(/([\\;,:"])/g, "\\$1");
}

export function wifiQrPayload(wifi: {
  ssid: string;
  password: string;
  security: "WPA" | "WEP" | "nopass";
  hidden?: boolean;
}): string {
  const parts = [`T:${wifi.security}`, `S:${escapeWifiValue(wifi.ssid)}`];
  if (wifi.security !== "nopass") parts.push(`P:${escapeWifiValue(wifi.password)}`);
  if (wifi.hidden) parts.push("H:true");
  return `WIFI:${parts.join(";")};;`;
}
