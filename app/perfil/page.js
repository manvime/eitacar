"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import "@/lib/firebaseClient";
import { db } from "@/lib/firebaseClient";

function onlyDigits(v) {
  return (v || "").replace(/\D+/g, "");
}

// Placa BR: antiga ABC1234 ou Mercosul ABC1D23 (aceita letra/número no meio)
function normalizePlate(input) {
  const v = (input || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return v.slice(0, 7);
}

export default function PerfilPage() {
  const router = useRouter();

  const [authState, setAuthState] = useState({ loading: true, user: null });
  const user = authState.user;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    placa: "",
    whatsapp: "", // só números, sem +55
    ano: "",
    cor: "",
    modelo: "",
    endereco: "",
    cep: "",
  });

  const canAccess = !!user && !!user.emailVerified;

  useEffect(() => {
    const auth = getAuth();
    return onAuthStateChanged(auth, (u) => {
      setAuthState({ loading: false, user: u || null });
    });
  }, []);

  useEffect(() => {
    if (authState.loading) return;

    // Se não estiver logado -> vai pro login
    if (!user) {
      router.push("/login");
      return;
    }

    // Se não verificou email -> volta pro login (lá você já mostra o aviso)
    if (!user.emailVerified) {
      router.push("/login");
      return;
    }

    // Carregar perfil
    (async () => {
      try {
        setLoading(true);
        const ref = doc(db, "profiles", user.uid);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data = snap.data() || {};
          setForm((prev) => ({
            ...prev,
            placa: data.placa || "",
            whatsapp: data.whatsapp || "",
            ano: data.ano || "",
            cor: data.cor || "",
            modelo: data.modelo || "",
            endereco: data.endereco || "",
            cep: data.cep || "",
          }));
        }
      } catch (e) {
        console.error("Erro ao carregar perfil:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [authState.loading, user, router]);

  const styles = useMemo(() => {
    const card = {
      maxWidth: 820,
      margin: "24px auto",
      padding: 18,
      borderRadius: 14,
      border: "1px solid rgba(255,255,255,0.12)",
      background: "rgba(255,255,255,0.02)",
      color: "white",
    };

    const label = { display: "block", marginBottom: 6, opacity: 0.9 };

    const input = {
      width: "100%",
      padding: "12px 12px",
      borderRadius: 10,
      border: "1px solid rgba(255,255,255,0.15)",
      background: "rgba(255,255,255,0.06)",
      color: "white",
      outline: "none",
    };

    const row = {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 12,
    };

    const row3 = {
      display: "grid",
      gridTemplateColumns: "1fr 1fr 1fr",
      gap: 12,
    };

    const btn = (variant = "primary") => ({
      padding: "10px 14px",
      borderRadius: 10,
      border: "1px solid rgba(255,255,255,0.15)",
      background: variant === "primary" ? "rgba(255,255,255,0.12)" : "transparent",
      color: "white",
      fontWeight: 700,
      cursor: "pointer",
      minWidth: 140,
    });

    const help = { marginTop: 6, opacity: 0.75, fontSize: 13 };

    return { card, label, input, row, row3, btn, help };
  }, []);

  function setField(name, value) {
    setForm((p) => ({ ...p, [name]: value }));
  }

  async function handleSave() {
    if (!canAccess) return;

    const placa = normalizePlate(form.placa);
    const whatsapp = onlyDigits(form.whatsapp).slice(0, 11); // BR: DDD + número (11 dígitos geralmente)
    const cep = onlyDigits(form.cep).slice(0, 8);

    if (placa.length !== 7) {
      alert("Placa inválida. Use: ABC1234 ou ABC1D23.");
      return;
    }

    try {
      setSaving(true);
      const ref = doc(db, "profiles", user.uid);
      await setDoc(
        ref,
        {
          uid: user.uid,
          email: (user.email || "").toLowerCase(),

          placa,
          whatsapp,
          ano: form.ano,
          cor: form.cor,
          modelo: form.modelo,
          endereco: form.endereco,
          cep,

          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      alert("Perfil salvo!");
    } catch (e) {
      console.error("Erro ao salvar perfil:", e);
      alert("Erro ao salvar. Veja o console/log.");
    } finally {
      setSaving(false);
    }
  }

  if (authState.loading || loading) {
    return (
      <div style={{ color: "white", padding: 18, maxWidth: 820, margin: "20px auto" }}>
        Carregando perfil...
      </div>
    );
  }

  return (
    <div style={{ padding: 12 }}>
      <div style={styles.card}>
        <h2 style={{ margin: 0, marginBottom: 10 }}>Perfil</h2>
        <div style={{ opacity: 0.75, marginBottom: 18 }}>
          Preencha os dados do seu carro.
        </div>

        <div style={styles.row}>
          <div>
            <label style={styles.label}>Placa</label>
            <input
              style={styles.input}
              value={form.placa}
              onChange={(e) => setField("placa", normalizePlate(e.target.value))}
              placeholder="ABC1234 ou ABC1D23"
              inputMode="text"
              autoComplete="off"
            />
            <div style={styles.help}>(antiga ABC1234 ou Mercosul ABC1D23)</div>
          </div>

          <div>
            <label style={styles.label}>WhatsApp (DDD + número, só números)</label>
            <div style={{ display: "flex", gap: 10 }}>
              <div
                style={{
                  padding: "12px 12px",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.15)",
                  background: "rgba(255,255,255,0.06)",
                  color: "white",
                  fontWeight: 700,
                  minWidth: 86,
                  textAlign: "center",
                }}
                title="Brasil"
              >
                BR +55
              </div>
              <input
                style={styles.input}
                value={form.whatsapp}
                onChange={(e) => setField("whatsapp", onlyDigits(e.target.value))}
                placeholder="11999998888"
                inputMode="numeric"
                autoComplete="off"
              />
            </div>
            <div style={styles.help}>Ex.: 11999998888</div>
          </div>
        </div>

        <div style={{ height: 14 }} />

        <div style={styles.row3}>
          <div>
            <label style={styles.label}>Ano</label>
            <input
              style={styles.input}
              value={form.ano}
              onChange={(e) => setField("ano", e.target.value)}
              placeholder="2020"
              inputMode="numeric"
              autoComplete="off"
            />
          </div>

          <div>
            <label style={styles.label}>Cor</label>
            <input
              style={styles.input}
              value={form.cor}
              onChange={(e) => setField("cor", e.target.value)}
              placeholder="Preto"
              autoComplete="off"
            />
          </div>

          <div>
            <label style={styles.label}>Modelo</label>
            <input
              style={styles.input}
              value={form.modelo}
              onChange={(e) => setField("modelo", e.target.value)}
              placeholder="Onix 1.0"
              autoComplete="off"
            />
          </div>
        </div>

        <div style={{ height: 14 }} />

        <div style={styles.row}>
          <div>
            <label style={styles.label}>Endereço</label>
            <input
              style={styles.input}
              value={form.endereco}
              onChange={(e) => setField("endereco", e.target.value)}
              placeholder="Rua, número, bairro, cidade"
              autoComplete="off"
            />
          </div>

          <div>
            <label style={styles.label}>CEP</label>
            <input
              style={styles.input}
              value={form.cep}
              onChange={(e) => setField("cep", onlyDigits(e.target.value))}
              placeholder="00000000"
              inputMode="numeric"
              autoComplete="off"
            />
          </div>
        </div>

        <div style={{ height: 18 }} />

        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              ...styles.btn("primary"),
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? "Salvando..." : "Salvar"}
          </button>

          <button
            onClick={() => router.push("/buscar")}
            style={styles.btn("ghost")}
          >
            Ir para Buscar
          </button>
        </div>
      </div>
    </div>
  );
}
