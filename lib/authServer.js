import { authAdmin } from "@/lib/firebaseAdmin";

export async function requireUser(request) {
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  if (!token) throw new Response("No token", { status: 401 });

  const decoded = await authAdmin.verifyIdToken(token);
  return decoded;
}

export async function requireVerified(request) {
  const decoded = await requireUser(request);
  if (!decoded.email_verified) throw new Response("Email not verified", { status: 412 });
  return decoded;
}

export async function requireAdmin(request) {
  const decoded = await requireUser(request);
  if (!decoded.admin) throw new Response("Admin only", { status: 403 });
  return decoded;
}
