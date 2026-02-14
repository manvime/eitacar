import { auth } from "@/lib/firebaseClient";

export async function getAuthToken() {
  // espera a sessão carregar
  if (!auth.currentUser) {
    await new Promise((resolve) => {
      const unsub = auth.onAuthStateChanged(() => {
        unsub();
        resolve();
      });
    });
  }

  const user = auth.currentUser;
  if (!user) throw new Error("Usuário não autenticado.");

  // true = força refresh (evita token expirado)
  return await user.getIdToken(true);
}
