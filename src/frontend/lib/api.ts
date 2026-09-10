const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL;

export const API_URL = configuredApiUrl || "http://localhost:5000";
export const BACKEND_ACTIVE = process.env.NEXT_PUBLIC_BACKEND_ACTIVE === "true";

export async function fetchToken(): Promise<string> {
  if (!BACKEND_ACTIVE) {
    return "demo-token";
  }

  const response = await fetch(`${API_URL}/api/v1/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      access_key: process.env.NEXT_PUBLIC_API_ACCESS_KEY || "",
    }),
  });

  if (!response.ok) {
    throw new Error("Could not authenticate with the pipeline API");
  }

  const data = (await response.json()) as { access_token?: string; token?: string };
  const token = data.access_token || data.token;
  if (!token) {
    throw new Error("The pipeline API did not return an access token");
  }

  return token;
}

export function outputUrl(path: string, token: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }

  if (!BACKEND_ACTIVE) {
    return path;
  }

  const url = new URL(path, API_URL);
  if (token) {
    url.searchParams.set("token", token);
  }
  return url.toString();
}
