"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebaseClient";

const styles = {
  card: {
    maxWidth: 980,
    margin: "40px auto",
    padding: 22,
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.04)",
    color: "white",
  },
  row: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
    marginTop: 10,
  },
  label: { fontSize: 13, opacity: 0.85, marginBottom: 6 },
  input: {
    width: "100%",
    padding: "12px 12px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(0,0,0,0.25)",
    color: "white",
    outline: "none",
  },
  btnRow: { display: "flex", gap: 10, marginTop: 16 },
  btn: (kind) => ({
    padding: "10px 14px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.16)",
    background: kind === "primary" ? "rgba(255,255,255,0.10)" : "transparent",
    color: "white",
    cursor: "pointer",
    fontWeight: 700,
  }),
  msgOk: { marginTop: 10, fontSize: 13, color: "#b7ffb7" },
  msgErr: { marginTop: 10, fontSize: 13, color: "#ffb7b7" },
};

function normPlate(v) {
  return (v || "")
    .toString()
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

// Aceita antiga ABC1234 e Mercosul ABC1D23 (também aceita variações digitadas)
function isValidBRPlate(p) {
  if (!p) return false;
  return /^[A-Z]{3}\d{4}$/.test(p) || /^[A-Z]{3}\d[A-Z]\d{2}$/.test(p);
}

function onlyDigits(v) {
  return (v || "").toString().replace(/\D/g, "");
}

export default function PerfilPage() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // campos
  const [plate, setPlate] = useState("");
  const [whats, setWhats] = useState(""); // só números com DDI
  const [ano, setAno] = useState("");
  const [cor, setCor] = useState("");
  const [modelo, setModelo] = useState("");
  const [endereco, setEndereco] = useState("");
  const [cep, setCep] = useState("");

  const [okMsg, setOkMsg] = useState("");
  const [errMsg, setErrMsg] = useState("");

  const uid = user?.uid || null;

  const canSave = useMemo(() => {
    const p = normPlate(plate);
    if (!isValidBRPlate(p)) return false;
    if (!onlyDigits(whats)) return false;
    return true;
  }, [plate, whats]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u || null);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    let alive = true;

    async function load() {
      if (!uid) return;

      setOkMsg("");
      setErrMsg("");
      try {
        // tenta /profiles/{uid}; se não existir, tenta /users/{uid}
        const pRef = doc(db, "profiles", uid);
        const pSnap = await getDoc(pRef);

        let data = null;

        if (pSnap.exists()) {
          data = pSnap.data();
        } else {
          const uRef = doc(db, "users", uid);
          const uSnap = await getDoc(uRef);
          if (uSnap.exists()) data = uSnap.data();
        }

        if (!alive) return;
        if (data) {
          setPlate(data.myPlate || data.plate || "");
          setWhats(data.whatsApp || data.whatsapp || data.phone || "");
          setAno(data.ano || "");
          setCor(data.cor || "");
          setModelo(data.modelo || "");
          setEndereco(data.endereco || "");
          setCep(data.cep || "");
        }
      } catch (e) {
        if (!alive) return;
        setErrMsg(e?.message || "Erro ao carregar perfil.");
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [uid]);

  async function handleSave() {
    setOkMsg("");
    setErrMsg("");

    if (!user) {
      setErrMsg("Faça login primeiro.");
      return;
    }

    const p = normPlate(plate);
    if (!isValidBRPlate(p)) {
      setErrMsg("Placa inválida. Ex.: ABC1234 ou ABC1D23");
      return;
    }

    const w = onlyDigits(whats);
    if (!w) {
      setErrMsg("WhatsApp inválido (somente números com DDI).");
      return;
    }

    try {
      // grava em profiles/{uid} (perfil completo)
      await setDoc(
        doc(db, "profiles", uid),
        {
          myPlate: p,
          whatsApp: w,
          ano: (ano || "").toString().trim(),
          cor: (cor || "").toString().trim(),
          modelo: (modelo || "").toString().trim(),
          endereco: (endereco || "").toString().trim(),
          cep: onlyDigits(cep),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      // também espelha o mínimo em users/{uid} (pra rules/threads)
      await setDoc(
        doc(db, "users", uid),
        {
          myPlate: p,
          whatsApp: w,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setOkMsg("Salvo com sucesso ✅");
    } catch (e) {
      setErrMsg(e?.message || "Falha ao salvar.");
    }
  }

  if (loading) {
    return <div style={{ padding: 24, color: "white", opacity: 0.85 }}>Carregando...</div>;
  }

  if (!user) {
    return (
      <div style={styles.card}>
        <h2 style={{ marginTop: 0 }}>Perfil</h2>
        <div style={{ opacity: 0.85 }}>Você precisa fazer login para editar seu perfil.</div>
        <div style={styles.btnRow}>
          <button style={styles.btn("primary")} onClick={() => router.push("/login")}>
            Ir para Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.card}>
      <h2 style={{ marginTop: 0 }}>Perfil</h2>
      <div style={{ opacity: 0.8, marginBottom: 12 }}>Preencha os dados do seu carro.</div>

      <div style={styles.row}>
        <div>
          <div style={styles.label}>Placa</div>
          <input
            style={styles.input}
            value={plate}
            onChange={(e) => setPlate(e.target.value)}
            placeholder="ABC1234 ou ABC1D23"
            autoCapitalize="characters"
          />
          <div style={{ fontSize: 12, opacity: 0.65, marginTop: 6 }}>
            (antiga ABC1234 ou Mercosul ABC1D23)
          </div>
        </div>

        <div>
          <div style={styles.label}>WhatsApp (DDD + número, só números)</div>
          <div style={{ display: "flex", gap: 10 }}>
            <div
              style={{
                minWidth: 76,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "1px solid rgba(255,255,255,0.14)",
                borderRadius: 10,
                background: "rgba(0,0,0,0.25)",
                padding: "12px 10px",
                fontWeight: 800,
              }}
            >
              BR +55
            </div>
            <input
              style={styles.input}
              value={whats}
              onChange={(e) => setWhats(onlyDigits(e.target.value))}
              placeholder="11999998888"
              inputMode="numeric"
            />
          </div>
          <div style={{ fontSize: 12, opacity: 0.65, marginTop: 6 }}>Ex.: 11999998888</div>
        </div>
      </div>

      <div style={styles.row}>
        <div>
          <div style={styles.label}>Ano</div>
          <input
            style={styles.input}
            value={ano}
            onChange={(e) => setAno(e.target.value)}
            placeholder="2020"
          />
        </div>
        <div>
          <div style={styles.label}>Cor</div>
          <input
            style={styles.input}
            value={cor}
            onChange={(e) => setCor(e.target.value)}
            placeholder="Preto"
          />
        </div>
      </div>

      <div style={styles.row}>
        <div>
          <div style={styles.label}>Modelo</div>
          <input
            style={styles.input}
            value={modelo}
            onChange={(e) => setModelo(e.target.value)}
            placeholder="Onix 1.0"
          />
        </div>
        <div>
          <div style={styles.label}>CEP</div>
          <input
            style={styles.input}
            value={cep}
            onChange={(e) => setCep(onlyDigits(e.target.value))}
            placeholder="00000000"
            inputMode="numeric"
          />
        </div>
      </div>

      <div style={{ marginTop: 10 }}>
        <div style={styles.label}>Endereço</div>
        <input
          style={styles.input}
          value={endereco}
          onChange={(e) => setEndereco(e.target.value)}
          placeholder="Rua, número, bairro, cidade"
        />
      </div>

      <div style={styles.btnRow}>
        <button style={styles.btn("primary")} disabled={!canSave} onClick={handleSave}>
          Salvar
        </button>
        <button style={styles.btn("secondary")} onClick={() => router.push("/buscar")}>
          Ir para Buscar
        </button>
      </div>

      {okMsg ? <div style={styles.msgOk}>{okMsg}</div> : null}
      {errMsg ? <div style={styles.msgErr}>{errMsg}</div> : null}
    </div>
  );
}
