import { useState, useEffect, useRef } from "react";

const TIERS = ["GOAT", "L7AS Y LATIF", "IMT3NA", "5RAT KBIR", "MLA 3OS", "MNAYEK 3LA ROU7O"];
const TIER_COLORS = { "GOAT": "#e74c3c", "L7AS Y LATIF": "#e67e22", "IMT3NA": "#f1c40f", "5RAT KBIR": "#2ecc71", "MLA 3OS": "#3498db", "MNAYEK 3LA ROU7O": "#9b59b6" };
const ITEMS = Array.from({ length: 19 }, (_, i) => `/items/${i + 1}.webp`);

const STORAGE_KEY = "tierlist_users";

const API_BASE = import.meta.env.DEV ? 'http://localhost:3001' : '';

async function loadDB(key) {
  try {
    const res = await fetch(`${API_BASE}/api/db/${key}`);
    const data = await res.json();
    return data.value ? JSON.parse(data.value) : {};
  } catch (err) {
    console.error('Error loading DB:', err);
    return {};
  }
}

async function saveDB(key, data) {
  try {
    await fetch(`${API_BASE}/api/db/${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: JSON.stringify(data) })
    });
  } catch (err) {
    console.error('Error saving DB:', err);
  }
}

function shuffle(arr) { return [...arr].sort(() => Math.random() - 0.5); }

function getConsensus(usersData) {
  const counts = { "GOAT":{}, "L7AS Y LATIF":{}, "IMT3NA":{}, "5RAT KBIR":{}, "MLA 3OS":{}, "MNAYEK 3LA ROU7O":{} };
  Object.values(usersData).forEach(u => {
    if(!u.tierList) return;
    TIERS.forEach(t => {
      if(u.tierList[t]) {
        u.tierList[t].forEach(img => {
          counts[t][img] = (counts[t][img] || 0) + 1;
        });
      }
    });
  });
  
  const consensus = {};
  TIERS.forEach(t => {
    const sorted = Object.entries(counts[t]).sort((a, b) => b[1] - a[1]);
    const result = [];
    let rank = 1;
    for (let i = 0; i < sorted.length; i++) {
      if (i > 0 && sorted[i][1] < sorted[i-1][1]) {
        rank = i + 1;
      }
      if (rank > 3) break;
      result.push({ img: sorted[i][0], count: sorted[i][1], rank });
    }
    consensus[t] = result;
  });
  return consensus;
}

export default function App() {
  const [screen, setScreen] = useState("loading"); // build | feed | consensus | truth
  const [userId, setUserId] = useState("");
  const [tierList, setTierList] = useState({ "GOAT":[], "L7AS Y LATIF":[], "IMT3NA":[], "5RAT KBIR":[], "MLA 3OS":[], "MNAYEK 3LA ROU7O":[], unranked: [] });
  const [truth, setTruth] = useState({}); // { imgPath: base64 }
  const [users, setUsers] = useState({});
  const [dragging, setDragging] = useState(null); // { item, from }
  const [consensusData, setConsensusData] = useState(null);

  const fileInputRef = useRef({});

  useEffect(() => {
    let uid = localStorage.getItem("tierlist_uid");
    if (!uid) {
      uid = "anon_" + Math.random().toString(36).substring(2, 9);
      localStorage.setItem("tierlist_uid", uid);
    }
    setUserId(uid);

    async function fetchDB(isInitial) {
      const dUsers = await loadDB(STORAGE_KEY);
      
      // Update state without wiping local dragging operations
      setUsers(dUsers);
      setConsensusData(getConsensus(dUsers));

      if (isInitial) {
        if (dUsers[uid]) {
          if (dUsers[uid].tierList) setTierList(dUsers[uid].tierList);
          if (dUsers[uid].truth) setTruth(dUsers[uid].truth);
        } else {
          setTierList({ "GOAT":[], "L7AS Y LATIF":[], "IMT3NA":[], "5RAT KBIR":[], "MLA 3OS":[], "MNAYEK 3LA ROU7O":[], unranked: shuffle(ITEMS) });
        }
        setScreen("build");
      }
    }

    fetchDB(true);

    // Auto-download (poll) from DB every 3 seconds to keep feed and consensus live
    const interval = setInterval(() => fetchDB(false), 3000);
    return () => clearInterval(interval);
  }, []);

  function handleDragStart(item, from) { setDragging({ item, from }); }
  
  function handleDrop(tier) {
    if (!dragging) return;
    const { item, from } = dragging;
    setTierList(prev => {
      const next = { ...prev };
      next[from] = next[from].filter(i => i !== item);
      next[tier] = [...(next[tier]||[]), item];
      
      const newUsers = { ...users, [userId]: { ...users[userId], tierList: next, truth, ts: Date.now() } };
      setUsers(newUsers);
      setConsensusData(getConsensus(newUsers));
      saveDB(STORAGE_KEY, newUsers);

      return next;
    });
    setDragging(null);
  }

  function handleFileUpload(e, item) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 240;
        const scaleSize = MAX_WIDTH / img.width;
        canvas.width = MAX_WIDTH;
        canvas.height = img.height * scaleSize;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/webp', 0.8);
        
        setTruth(prev => {
          const next = { ...prev, [item]: dataUrl };
          const newUsers = { ...users, [userId]: { ...users[userId], tierList, truth: next, ts: Date.now() } };
          setUsers(newUsers);
          saveDB(STORAGE_KEY, newUsers);
          return next;
        });
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  }

  const otherUsers = Object.entries(users).filter(([id]) => id !== userId);

  if (screen === "loading") {
    return <div style={{ minHeight: "100vh", background: "var(--color-background-tertiary)", display: "flex", justifyContent: "center", alignItems: "center", color: "#fff", fontFamily: "'Inter', sans-serif" }}>Synchronizing DB...</div>;
  }

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", minHeight: "100vh", background: "var(--color-background-tertiary)", color: "var(--color-text-primary)", paddingBottom: 60 }}>
      
      <style>{`
        ::-webkit-scrollbar { width: 8px; }
        ::-webkit-scrollbar-track { background: var(--color-background-tertiary); }
        ::-webkit-scrollbar-thumb { background: var(--color-border-primary); border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: var(--color-text-secondary); }

        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .fade-in { animation: fadeIn 0.4s ease forwards; }

        .header-btn {
          background: transparent; border: 1px solid transparent; color: var(--color-text-secondary);
          padding: 8px 16px; border-radius: 20px; font-size: 14px; font-weight: 600; cursor: pointer;
          transition: all 0.2s ease; display: flex; align-items: center; gap: 8px;
        }
        .header-btn:hover { background: rgba(255,255,255,0.05); color: #fff; }
        .header-btn.active { background: var(--color-background-secondary); border-color: var(--color-border-primary); color: #fff; }

        .tier-row { display:flex; align-items:stretch; margin-bottom:6px; border-radius:12px; overflow:hidden; min-height:64px; box-shadow: 0 4px 12px rgba(0,0,0,0.2); }
        .tier-label { width:120px; min-width:120px; display:flex; align-items:center; justify-content:center; text-align:center; padding:0 8px; font-size:15px; font-weight:800; color:#111; flex-shrink:0; text-shadow: 0 1px 2px rgba(255,255,255,0.3); line-height:1.2; word-break:break-word; }
        .tier-drop { flex:1; display:flex; flex-wrap:wrap; gap:8px; padding:10px; background: rgba(255,255,255,0.03); border:1.5px dashed transparent; transition:all 0.2s; min-height:64px; align-items:center; }
        .tier-drop.drag-over { border-color: var(--color-border-primary); background: rgba(255,255,255,0.06); }
        
        .chip { 
          background: #000; border:1px solid var(--color-border-secondary); border-radius:8px; 
          width:64px; height:64px; display:flex; align-items:center; justify-content:center; overflow:hidden;
          cursor:grab; user-select:none; transition:transform 0.15s, box-shadow 0.15s; 
          box-shadow: 0 2px 8px rgba(0,0,0,0.4);
        }
        .chip:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.6); border-color: var(--color-border-primary); }
        .chip:active { cursor:grabbing; transform:scale(1.05); }
        .chip img { width:100%; height:100%; object-fit:cover; pointer-events:none; }

        .unranked-pool { 
          display:flex; flex-wrap:wrap; gap:10px; padding:16px; 
          background: rgba(0,0,0,0.3); border-radius:14px; min-height:64px; 
          align-items:center; border:1.5px dashed var(--color-border-secondary);
        }

        .feed-card {
          background: linear-gradient(145deg, rgba(30,30,30,0.9) 0%, rgba(18,18,18,0.9) 100%);
          border: 1px solid var(--color-border-secondary); border-radius: 16px;
          padding: 20px; margin-bottom: 20px; box-shadow: 0 8px 24px rgba(0,0,0,0.4);
        }

        .truth-card {
          background: rgba(255,255,255,0.02); border: 1px solid var(--color-border-secondary);
          border-radius: 16px; overflow: hidden; display: flex; transition: border-color 0.2s;
        }
        .truth-card:hover { border-color: var(--color-border-primary); }
        .truth-left { width: 140px; background: #000; display:flex; align-items:center; justify-content:center; }
        .truth-left img { width: 100%; height: 100%; object-fit: cover; }
        .truth-right { flex: 1; display: flex; align-items: center; justify-content: center; padding: 16px; position: relative; min-height: 140px; }
        .truth-upload-btn {
          background: rgba(255,255,255,0.05); border: 1px dashed var(--color-border-primary);
          border-radius: 10px; color: var(--color-text-secondary); cursor: pointer;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          width: 100%; height: 100%; min-height: 100px; transition: all 0.2s;
        }
        .truth-upload-btn:hover { background: rgba(255,255,255,0.1); color: #fff; }
        .truth-meme { width: 100%; height: 100%; object-fit: contain; position: absolute; top:0; left:0; padding: 10px; box-sizing: border-box; }
      `}</style>

      {/* HEADER */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'rgba(18, 18, 18, 0.75)', backdropFilter: 'blur(16px)',
        borderBottom: '1px solid var(--color-border-tertiary)',
        padding: '16px 24px', display: 'flex', justifyContent: 'center', gap: 12,
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
      }}>
        {[
          { id: 'build', icon: '🏗️', label: 'My List' },
          { id: 'feed', icon: '🌍', label: 'Feed' },
          { id: 'consensus', icon: '📊', label: 'Consensus' },
          { id: 'truth', icon: '👁️', label: 'The Truth' },
          { id: 'gallery', icon: '🖼️', label: 'Meme Gallery' }
        ].map(t => (
          <button key={t.id} onClick={() => setScreen(t.id)} className={`header-btn ${screen === t.id ? 'active' : ''}`}>
            <span style={{ fontSize: 16 }}>{t.icon}</span> {t.label}
          </button>
        ))}
      </header>

      <main style={{ maxWidth: 800, margin: "40px auto 0", padding: "0 20px" }}>
        
        {/* SCREEN: BUILD */}
        {screen === "build" && (
          <div className="fade-in">
            <div style={{ textAlign: "center", marginBottom: 32 }}>
              <h1 style={{ fontSize: 32, fontWeight: 800, margin: "0 0 8px", background: "linear-gradient(90deg, #fff, #888)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Your Arena</h1>
              <p style={{ color: "var(--color-text-secondary)", margin: 0, fontSize: 15 }}>Drag and drop to shape your legacy. Auto-saved to the void.</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {TIERS.map(tier => (
                <div key={tier} className="tier-row">
                  <div className="tier-label" style={{ background: TIER_COLORS[tier] }}>{tier}</div>
                  <div className="tier-drop"
                    onDragOver={e=>{e.preventDefault();e.currentTarget.classList.add("drag-over")}}
                    onDragLeave={e=>e.currentTarget.classList.remove("drag-over")}
                    onDrop={e=>{e.currentTarget.classList.remove("drag-over");handleDrop(tier)}}>
                    {tierList[tier].map(item => (
                      <div key={item} className="chip" draggable onDragStart={()=>handleDragStart(item,tier)}>
                        <img src={item} alt="item" />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 24 }}>
              <h3 style={{ fontSize: 14, color: "var(--color-text-secondary)", margin: "0 0 10px", textTransform: "uppercase", letterSpacing: 1 }}>Unranked Arsenal</h3>
              <div className="unranked-pool"
                onDragOver={e=>e.preventDefault()}
                onDrop={()=>handleDrop("unranked")}>
                {tierList.unranked.length === 0
                  ? <span style={{ fontSize:14, color:"var(--color-text-tertiary)", width: '100%', textAlign: 'center', padding: '20px 0' }}>The void is empty. You have judged them all. ⚖️</span>
                  : tierList.unranked.map(item => (
                    <div key={item} className="chip" draggable onDragStart={()=>handleDragStart(item,"unranked")}>
                      <img src={item} alt="item" />
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}

        {/* SCREEN: FEED */}
        {screen === "feed" && (
          <div className="fade-in">
            <div style={{ textAlign: "center", marginBottom: 32 }}>
              <h1 style={{ fontSize: 32, fontWeight: 800, margin: "0 0 8px" }}>The Void's Echoes</h1>
              <p style={{ color: "var(--color-text-secondary)", margin: 0, fontSize: 15 }}>Anonymous judgments from parallel universes.</p>
            </div>

            {otherUsers.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 0", color: "var(--color-text-tertiary)" }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>🌌</div>
                It's quiet here. Too quiet.
              </div>
            ) : (
              otherUsers.reverse().map(([id, u], index) => (
                <div key={id + index} className="feed-card fade-in" style={{ animationDelay: `${index * 0.1}s` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--color-border-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>👤</div>
                    <span style={{ fontWeight: 600, color: 'var(--color-text-secondary)', letterSpacing: 1, fontSize: 13 }}>ANONYMOUS ENTITY</span>
                  </div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {TIERS.map(t => u.tierList[t] && u.tierList[t].length > 0 && (
                      <div key={t} style={{ display: 'flex', gap: 12, alignItems: 'center', background: 'rgba(0,0,0,0.2)', padding: '6px 12px', borderRadius: 8 }}>
                        <span style={{ color: TIER_COLORS[t], fontWeight: 800, fontSize: 13, minWidth: 80, maxWidth: 100, textAlign: 'center', wordBreak: 'break-word', lineHeight: 1.2 }}>{t}</span>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, flex: 1 }}>
                          {u.tierList[t].map(img => (
                            <img key={img} src={img} style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover', border: '1px solid var(--color-border-secondary)' }} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Render truth if they have any */}
                  {u.truth && Object.keys(u.truth).length > 0 && (
                    <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                      <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: 1 }}>Meme Reactions</span>
                      <div style={{ display: 'flex', gap: 12, marginTop: 8, overflowX: 'auto', paddingBottom: 8 }}>
                        {Object.entries(u.truth).map(([item, base64]) => (
                          <div key={item} style={{ position: 'relative', width: 48, height: 48, flexShrink: 0 }}>
                            <img src={item} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8, opacity: 0.5 }} />
                            <img src={base64} style={{ position: 'absolute', top: -4, right: -4, width: 24, height: 24, objectFit: 'contain', background: '#000', borderRadius: '50%', border: '1px solid var(--color-border-primary)' }} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* SCREEN: CONSENSUS */}
        {screen === "consensus" && consensusData && (
          <div className="fade-in">
            <div style={{ textAlign: "center", marginBottom: 32 }}>
              <h1 style={{ fontSize: 32, fontWeight: 800, margin: "0 0 8px" }}>Global Consensus</h1>
              <p style={{ color: "var(--color-text-secondary)", margin: 0, fontSize: 15 }}>The definitive ranking, decided by the collective consciousness.</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {TIERS.map(tier => (
                <div key={tier} style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${TIER_COLORS[tier]}40`, borderRadius: 16, overflow: 'hidden' }}>
                  <div style={{ background: `${TIER_COLORS[tier]}15`, padding: '12px 20px', borderBottom: `1px solid ${TIER_COLORS[tier]}30`, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ color: TIER_COLORS[tier], fontSize: 24, fontWeight: 900 }}>{tier}</span>
                    <span style={{ color: 'var(--color-text-secondary)', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1 }}>Top Selections</span>
                  </div>
                  <div style={{ padding: 20, display: 'flex', gap: 16, overflowX: 'auto' }}>
                    {consensusData[tier].length === 0 ? (
                      <span style={{ color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>No data yet</span>
                    ) : (
                      consensusData[tier].map((item, idx) => (
                        <div key={item.img} style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                          <div style={{ position: 'relative' }}>
                            <img src={item.img} style={{ width: 72, height: 72, borderRadius: 12, objectFit: 'cover', border: `2px solid ${item.rank === 1 ? TIER_COLORS[tier] : 'var(--color-border-secondary)'}`, boxShadow: item.rank === 1 ? `0 0 16px ${TIER_COLORS[tier]}40` : 'none' }} />
                            {item.rank === 1 && <div style={{ position: 'absolute', top: -10, right: -10, fontSize: 20 }}>👑</div>}
                            {item.rank > 1 && <div style={{ position: 'absolute', top: -8, left: -8, background: 'var(--color-background-primary)', color: 'var(--color-text-secondary)', fontSize: 11, fontWeight: 'bold', border: '1px solid var(--color-border-secondary)', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>#{item.rank}</div>}
                          </div>
                          <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', background: 'var(--color-background-secondary)', padding: '2px 8px', borderRadius: 10 }}>{item.count} votes</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SCREEN: TRUTH */}
        {screen === "truth" && (
          <div className="fade-in">
            <div style={{ textAlign: "center", marginBottom: 32 }}>
              <h1 style={{ fontSize: 32, fontWeight: 800, margin: "0 0 8px" }}>The Truth</h1>
              <p style={{ color: "var(--color-text-secondary)", margin: 0, fontSize: 15 }}>Reveal the true nature of these entities. Attach your meme reactions.</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 20 }}>
              {ITEMS.map(item => (
                <div key={item} className="truth-card fade-in">
                  <div className="truth-left">
                    <img src={item} alt="original" />
                  </div>
                  <div className="truth-right">
                    {truth[item] ? (
                      <>
                        <img src={truth[item]} className="truth-meme" alt="meme" />
                        <button onClick={() => {
                          setTruth(prev => {
                            const next = {...prev}; delete next[item];
                            const newUsers = { ...users, [userId]: { ...users[userId], truth: next, ts: Date.now() } };
                            setUsers(newUsers); saveDB(STORAGE_KEY, newUsers);
                            return next;
                          });
                        }} style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.7)', color: '#fff', border: 'none', width: 28, height: 28, borderRadius: '50%', cursor: 'pointer', zIndex: 10 }}>×</button>
                      </>
                    ) : (
                      <label className="truth-upload-btn">
                        <span style={{ fontSize: 24, marginBottom: 8 }}>+</span>
                        <span style={{ fontSize: 12 }}>Upload Meme / Sticker</span>
                        <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => handleFileUpload(e, item)} />
                      </label>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SCREEN: GALLERY */}
        {screen === "gallery" && (
          <div className="fade-in">
            <div style={{ textAlign: "center", marginBottom: 32 }}>
              <h1 style={{ fontSize: 32, fontWeight: 800, margin: "0 0 8px" }}>Community Meme Gallery</h1>
              <p style={{ color: "var(--color-text-secondary)", margin: 0, fontSize: 15 }}>See the truth assigned to each entity by the collective.</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              {ITEMS.map(item => {
                const itemMemes = Object.values(users)
                  .filter(u => u.truth && u.truth[item])
                  .map(u => u.truth[item]);
                  
                if (itemMemes.length === 0) return null;

                return (
                  <div key={item} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--color-border-secondary)', borderRadius: 16, overflow: 'hidden', display: 'flex' }}>
                    <div style={{ width: 120, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <img src={item} alt="original" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                    <div style={{ padding: 20, flex: 1, display: 'flex', gap: 16, overflowX: 'auto', alignItems: 'center' }}>
                      {itemMemes.map((meme, idx) => (
                        <div key={idx} style={{ position: 'relative', flexShrink: 0, transition: 'transform 0.2s', cursor: 'pointer' }} onMouseOver={e => e.currentTarget.style.transform = 'scale(1.1)'} onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}>
                          <img src={meme} alt="meme" style={{ width: 80, height: 80, objectFit: 'contain', background: '#000', borderRadius: 8, border: '2px solid var(--color-border-primary)', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }} />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
              
              {ITEMS.filter(item => Object.values(users).some(u => u.truth && u.truth[item])).length === 0 && (
                <div style={{ textAlign: "center", padding: "60px 0", color: "var(--color-text-tertiary)" }}>
                  <div style={{ fontSize: 48, marginBottom: 16 }}>🦗</div>
                  No memes uploaded yet. Be the first in 'The Truth' tab!
                </div>
              )}
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
