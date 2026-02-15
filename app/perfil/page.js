"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebaseClient";

function onlyNumbers(v) {
  return (v || "").toString().replace(/\D+/g, "");
}

export default function PerfilPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState("");
  const [verified, setVerified] = useState(false);

  // Campos do perfil
  const [plate, setPlate] = useState("");
  const [ddi, setDdi] = useState("55");
  const [whatsLocal, setWhatsLocal] = useState("");

  const [year, setYear] = useState("");
  const [color, setColor] = useState("");
  const [model, setModel] = useState("");
  const [address, setAddress] = useState("");
  const [cep, setCep] = useState("");

  const [status, setStatus] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setStatus("");

      if (!u) {
        setLoading(false);
        router.push("/login");
        return;
      }

      setUserEmail(u.email || "");
      setVerified(!!u.emailVerified);

      // se não verificou, ainda renderiza página avisando
      if (!u.emailVerified) {
        setLoading(false);
        return;
      }

      try {
        const ref = doc(db, "users", u.uid);
        const snap = await getDoc(ref);

        if (snap.exists()) {
          const d = snap.data() || {};

          setPlate((d.myPlate || "").toString());

          const full = onlyNumbers(d.whatsapp || "");
          if (full.startsWith("55") && full.length > 2) {
            setDdi("55");
            setWhatsLocal(full.slice(2));
          } else {
            setDdi("55");
            setWhatsLocal(full);
          }

          setYear((d.year || "").toString());
          setColor((d.color || "").toString());
          setModel((d.model || "").toString());
          setAddress((d.address || "").toString());
          setCep((d.cep || "").toString());
        }
      } catch (e) {
        console.error("Erro ao carregar perfil:", e);
        setStatus("Erro ao carregar perfil.");
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, [router]);

  async function handleSave() {
    setStatus("");

    const u = auth.currentUser;
    if (!u) return setStatus("Você precisa estar logado.");
    if (!u.emailVerified) return setStatus("Verifique seu email para usar o perfil.");

    try {
      const whatsapp = onlyNumbers(`${ddi}${whatsLocal}`);

      const payload = {
        myPlate: (plate || "").trim().toUpperCase(),
        whatsapp,
        year: (year || "").toString().trim(),
        color: (color || "").toString().trim(),
        model: (model || "").toString().trim(),
        address: (address || "").toString().trim(),
        cep: onlyNumbers(cep),
        updatedAt: new Date().toISOString(),
      };

      await setDoc(doc(db, "users", u.uid), payload, { merge: true });
      setStatus("Salvo com sucesso!");
    } catch (e) {
      console.error("Erro ao salvar perfil:", e);
      setStatus("Erro ao salvar.");
    }
  }

  if (loading) {
    return <div style={{ padding: 24, color: "white", opacity: 0.85 }}>Carregando...</div>;
  }

  if (!verified) {
    return (
      <div style={{ padding: 24, color: "white" }}>
        <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>Perfil</div>
        <div style={{ opacity: 0.85 }}>
          Seu email ainda não está verificado. Verifique seu email e faça login novamente.
        </div>
      </div>
    );
  }

  const styles = {
    card: {
      maxWidth: 980,
      margin: "0 auto",
      background: "rgba(255,255,255,0.06)",
      border: "1px solid rgba(255,255,255,0.12)",
      borderRadius: 14,
      padding: 18,
      color: "white",
    },
    grid: {
      display: "grid",
      gridTemplateColumns: "1.2fr 1fr",
      gap: 14,
    },
    label: { fontSize: 13, opacity: 0.85, marginBottom: 6 },
    input: {
      width: "100%",
      padding: "10px 12px",
      borderRadius: 10,
      border: "1px solid rgba(255,255,255,0.15)",
      background: "rgba(0,0,0,0.25)",
      color: "#fff",
      outline: "none",
    },
    btnRow: { display: "flex", gap: 10, marginTop: 14 },
    btn: {
      padding: "10px 16px",
      borderRadius: 10,
      border: "1px solid rgba(255,255,255,0.15)",
      background: "rgba(255,255,255,0.10)",
      color: "#fff",
      fontWeight: 700,
      cursor: "pointer",
    },
    small: { fontSize: 12, opacity: 0.7, marginTop: 6 },
  };

  return (
    <div style={{ padding: 20 }}>
      <div style={{ maxWidth: 980, margin: "0 auto", color: "white", marginBottom: 12, opacity: 0.9 }}>
        <div style={{ fontSize: 20, fontWeight: 800 }}>Perfil</div>
        <div style={{ marginTop: 6, fontSize: 13, opacity: 0.8 }}>
          Usuário: {userEmail}
          <br />
          Email verificado: {String(verified)}
        </div>
      </div>

      <div style={styles.card}>
        <div style={{ marginBottom: 10, opacity: 0.8 }}>
          Preencha os dados do seu carro.
        </div>

        <div style={styles.grid}>
          <div>
            <div style={styles.label}>Placa</div>
            <input
              style={styles.input}
              value={plate}
              onChange={(e) => setPlate(e.target.value)}
              placeholder="ABC1234 ou ABC1D23"
            />
            <div style={styles.small}>(antiga ABC1234 • Mercosul ABC1D23)</div>
          </div>

          <div>
            <div style={styles.label}>WhatsApp (DDD + número, só números)</div>
            <div style={{ display: "flex", gap: 10 }}>
              <input
                style={{ ...styles.input, width: 110 }}
                value={`+${ddi}`}
                onChange={(e) => setDdi(onlyNumbers(e.target.value) || "55")}
              />
              <input
                style={styles.input}
                value={whatsLocal}
                onChange={(e) => setWhatsLocal(onlyNumbers(e.target.value))}
                placeholder="11999998888"
              />
            </div>
            <div style={styles.small}>Ex.: 11999998888</div>
          </div>

          <div>
            <div style={styles.label}>Ano</div>
            <input style={styles.input} value={year} onChange={(e) => setYear(e.target.value)} placeholder="2020" />
          </div>

          <div>
            <div style={styles.label}>Cor</div>
            <input style={styles.input} value={color} onChange={(e) => setColor(e.target.value)} placeholder="Preto" />
          </div>

          <div>
            <div style={styles.label}>Modelo</div>
            <input style={styles.input} value={model} onChange={(e) => setModel(e.target.value)} placeholder="Onix 1.0" />
          </div>

          <div>
            <div style={styles.label}>CEP</div>
            <input style={styles.input} value={cep} onChange={(e) => setCep(e.target.value)} placeholder="00000000" />
          </div>

          <div style={{ gridColumn: "1 / -1" }}>
            <div style={styles.label}>Endereço</div>
            <input
              style={styles.input}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Rua, número, bairro, cidade"
            />
          </div>
        </div>

        <div style={styles.btnRow}>
          <button style={styles.btn} onClick={handleSave}>Salvar</button>
          <button style={styles.btn} onClick={() => router.push("/buscar")}>Ir para Buscar</button>
        </div>

        {status ? <div style={{ marginTop: 12, fontSize: 13, opacity: 0.9 }}>{status}</div> : null}
      </div>
    </div>
  );
}
