import { authAdmin } from "@/lib/firebaseAdmin";

function jsonError(message, status) {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function requireUser(request) {
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  if (!token) throw jsonError("No token", 401);

  const decoded = await authAdmin.verifyIdToken(token);
  return decoded;
}

export async function requireVerified(request) {
  const decoded = await requireUser(request);
  if (!decoded.email_verified) throw jsonError("Email not verified", 412);
  return decoded;
}

export async function requireAdmin(request) {
  const decoded = await requireUser(request);
  if (!decoded.admin) throw jsonError("Admin only", 403);
  return decoded;
}
