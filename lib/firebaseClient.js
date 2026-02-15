"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebaseClient";

function onlyNumbers(s) {
  return (s || "").toString().replace(/\D+/g, "");
}

export default function PerfilPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState("");
  const [verified, setVerified] = useState(false);

  // dados do perfil
  const [plate, setPlate] = useState("");
  const [ddi, setDdi] = useState("55");
  const [whatsLocal, setWhatsLocal] = useState(""); // sem DDI
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
        console.error(e);
        setStatus("Erro ao carregar perfil.");
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, [router]);

  async function save() {
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
      console.error(e);
      setStatus("Erro ao salvar.");
    }
  }

  if (loading) {
    return <div style={{ padding: 20, color: "#fff" }}>Carregando...</div>;
  }

  if (!verified) {
    return (
      <div style={{ padding: 20, color: "#fff" }}>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Perfil</div>
        <div style={{ opacity: 0.85 }}>
          Seu email ainda não está verificado. Verifique seu email e faça login novamente.
        </div>
      </div>
    );
  }

  const box = {
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 14,
    padding: 18,
    maxWidth: 980,
  };

  const label = { fontSize: 13, opacity: 0.85, marginBottom: 6 };
  const input = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.15)",
    background: "rgba(0,0,0,0.25)",
    color: "#fff",
    outline: "none",
  };

  const btn = {
    padding: "10px 16px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.15)",
    background: "rgba(255,255,255,0.10)",
    color: "#fff",
    fontWeight: 700,
    cursor: "pointer",
  };

  return (
    <div style={{ padding: 20, color: "#fff" }}>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <div style={{ marginBottom: 12, opacity: 0.9 }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>Perfil</div>
          <div style={{ marginTop: 6, fontSize: 13, opacity: 0.8 }}>
            Usuário: {userEmail} <br />
            Email verificado: {String(verified)}
          </div>
        </div>

        <div style={box}>
          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 14 }}>
            <div>
              <div style={label}>Placa</div>
              <input
                style={input}
                value={plate}
                onChange={(e) => setPlate(e.target.value)}
                placeholder="ABC1234 ou ABC1D23"
              />
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
                (antiga ABC1234 • Mercosul ABC1D23)
              </div>
            </div>

            <div>
              <div style={label}>WhatsApp (DDD + número, só números)</div>
              <div style={{ display: "flex", gap: 10 }}>
                <input
                  style={{ ...input, width: 110 }}
                  value={`+${ddi}`}
                  onChange={(e) => setDdi(onlyNumbers(e.target.value) || "55")}
                />
                <input
                  style={input}
                  value={whatsLocal}
                  onChange={(e) => setWhatsLocal(onlyNumbers(e.target.value))}
                  placeholder="11999998888"
                />
              </div>
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
                Ex.: 11999998888
              </div>
            </div>

            <div>
              <div style={label}>Ano</div>
              <input style={input} value={year} onChange={(e) => setYear(e.target.value)} placeholder="2020" />
            </div>

            <div>
              <div style={label}>Cor</div>
              <input style={input} value={color} onChange={(e) => setColor(e.target.value)} placeholder="Preto" />
            </div>

            <div>
              <div style={label}>Modelo</div>
              <input style={input} value={model} onChange={(e) => setModel(e.target.value)} placeholder="Onix 1.0" />
            </div>

            <div>
              <div style={label}>CEP</div>
              <input style={input} value={cep} onChange={(e) => setCep(e.target.value)} placeholder="00000000" />
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <div style={label}>Endereço</div>
              <input
                style={input}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Rua, número, bairro, cidade"
              />
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <button style={btn} onClick={save}>
              Salvar
            </button>
            <button style={btn} onClick={() => router.push("/buscar")}>
              Ir para Buscar
            </button>
          </div>

          {status ? (
            <div style={{ marginTop: 12, fontSize: 13, opacity: 0.9 }}>{status}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
