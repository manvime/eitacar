import { auth } from "@/lib/firebaseClient";

export async function apiPost(path, body) {
  const user = auth.currentUser;
  if (!user) throw new Error("Faça login.");

  const token = await user.getIdToken(true);

  const res = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body ?? {}),
  });

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await res.json() : await res.text();

  if (!res.ok) {
    const msg = data?.error || data || `Erro ${res.status}`;
    throw new Error(msg);
  }
  return data;
}
