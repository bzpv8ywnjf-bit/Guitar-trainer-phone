
import React, {useEffect, useMemo, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import './style.css';

const sharpNotes = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const flatNotes = ["C","Db","D","Eb","E","F","Gb","G","Ab","A","Bb","B"];
const strings = [
  {label:"6th low E", open:"E", midi:40},
  {label:"5th A", open:"A", midi:45},
  {label:"4th D", open:"D", midi:50},
  {label:"3rd G", open:"G", midi:55},
  {label:"2nd B", open:"B", midi:59},
  {label:"1st high E", open:"E", midi:64}
];

function noteAt(open, fret, style="sharp"){
  const idx = sharpNotes.indexOf(open);
  const n = (idx + fret) % 12;
  return style === "flat" ? flatNotes[n] : sharpNotes[n];
}
function accepted(open, fret){
  return [...new Set([noteAt(open,fret,"sharp").toUpperCase(), noteAt(open,fret,"flat").toUpperCase()])];
}
function shuffle(arr){
  const a=[...arr];
  for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]];}
  return a;
}
function normalize(s){return (s || "").trim().toUpperCase().replace("♯","#").replace("♭","B");}
function colorFor(t){ if(t <= 3) return "green"; if(t <= 6) return "yellow"; return "red"; }
function heatColor(rec){
  if(!rec || rec.successTry == null) return "red";
  if(rec.successTry === 1 && rec.firstTryTime <= 3) return "green";
  if(rec.successTry === 1 && rec.firstTryTime <= 6) return "yellow";
  if(rec.successTry === 2 && rec.successTime <= 6) return "orange";
  return "red";
}
function key(it){return `${it.stringIndex}-${it.fret}`;}
function avg(xs){return xs.length ? (xs.reduce((a,b)=>a+b,0)/xs.length).toFixed(2)+"s" : "—";}

function App(){
  const [screen,setScreen]=useState("home");
  const [mode,setMode]=useState("normal");
  const [noteStyle,setNoteStyle]=useState("both");
  const [selectedStrings,setSelectedStrings]=useState([0,1,2,3,4,5]);
  const [selectedFrets,setSelectedFrets]=useState([3,5,7,10]);

  const [items,setItems]=useState([]);
  const [queue,setQueue]=useState([]);
  const [completed,setCompleted]=useState(new Set());
  const [current,setCurrent]=useState(null);
  const [time,setTime]=useState(0);
  const [running,setRunning]=useState(false);
  const [paused,setPaused]=useState(false);
  const [answered,setAnswered]=useState(false);
  const [feedback,setFeedback]=useState("");
  const [feedbackColor,setFeedbackColor]=useState("green");
  const [attempts,setAttempts]=useState({});
  const [successTimes,setSuccessTimes]=useState([]);
  const [streak,setStreak]=useState(0);
  const [bestStreak,setBestStreak]=useState(0);
  const [sessions,setSessions]=useState(()=>JSON.parse(localStorage.getItem("guitarTrainerSessions") || "[]"));

  const timerRef=useRef(null);
  const inputRef=useRef(null);

  useEffect(()=>{ localStorage.setItem("guitarTrainerSessions", JSON.stringify(sessions.slice(-200))); },[sessions]);
  useEffect(()=>{
    if(!running || paused || answered) return;
    timerRef.current=setInterval(()=>setTime(t=>Math.round((t+0.1)*10)/10),100);
    return ()=>clearInterval(timerRef.current);
  },[running,paused,answered]);
  useEffect(()=>{ if(running && time >= 7) reveal(true); },[time]);

  const total=items.length;
  const done=completed.size;
  const heatCounts=useMemo(()=>{
    const out={green:0,yellow:0,orange:0,red:0};
    items.forEach(it=>out[heatColor(attempts[key(it)])]++);
    return out;
  },[items,attempts]);

  function displayAnswer(it=current){
    if(!it) return "";
    if(noteStyle === "sharp") return noteAt(it.string.open,it.fret,"sharp");
    if(noteStyle === "flat") return noteAt(it.string.open,it.fret,"flat");
    return it.answers.join(" / ");
  }

  function buildItems(){
    const built=[];
    selectedStrings.forEach(si=>selectedFrets.forEach(fret=>{
      built.push({stringIndex:si,string:strings[si],fret,midi:strings[si].midi+fret,answers:accepted(strings[si].open,fret)});
    }));
    return built;
  }

  function startSession(){
    if(!selectedStrings.length || !selectedFrets.length){ alert("Choose at least one string and one fret."); return; }
    const built=buildItems();
    const att={}; built.forEach(it=>att[key(it)]={tries:0,firstTryTime:null,successTry:null,successTime:null});
    setItems(built); setQueue(shuffle(built)); setCompleted(new Set()); setAttempts(att);
    setSuccessTimes([]); setStreak(0); setBestStreak(0); setFeedback(""); setScreen("practice");
    setTimeout(()=>nextNote(shuffle(built), new Set(), built),0);
  }

  function nextNote(q=queue, comp=completed, allItems=items){
    if(comp.size >= allItems.length){ completeSession(allItems, comp); return; }
    let activeQ=[...q];
    if(!activeQ.length) activeQ=shuffle(allItems.filter(it=>!comp.has(key(it))));
    const next=activeQ.shift();
    setQueue(activeQ); setCurrent(next); setTime(0); setAnswered(false); setPaused(false); setRunning(true); setFeedback("");
    setTimeout(()=>inputRef.current?.focus(),50);
  }

  function shouldComplete(t){ return mode === "master" ? t <= 3 : t <= 6; }

  function recordAttempt(it, success){
    const k=key(it);
    setAttempts(prev=>{
      const rec={...(prev[k] || {tries:0})};
      rec.tries=(rec.tries || 0)+1;
      if(rec.tries===1) rec.firstTryTime=time;
      if(success && rec.successTry == null){ rec.successTry=rec.tries; rec.successTime=time; }
      return {...prev,[k]:rec};
    });
  }

  function answer(value){
    if(!current || answered || paused) return;
    if(current.answers.map(normalize).includes(normalize(value))) markCorrect();
  }

  function markCorrect(){
    const completes=shouldComplete(time);
    const c=colorFor(time);
    recordAttempt(current, completes);
    setAnswered(true); setRunning(false);
    const newStreak=streak+1;
    setStreak(newStreak); setBestStreak(Math.max(bestStreak,newStreak));
    setFeedbackColor(c);

    if(completes){
      const newComp=new Set(completed); newComp.add(key(current)); setCompleted(newComp);
      const newTimes=[...successTimes,time]; setSuccessTimes(newTimes);
      setFeedback(mode==="master" ? `Mastered in ${time.toFixed(1)}s. Answer: ${displayAnswer()}` : `Correct in ${time.toFixed(1)}s. Answer: ${displayAnswer()}`);
      if(newComp.size >= items.length) setTimeout(()=>completeSession(items,newComp,newTimes),700);
    } else {
      setQueue(q=>shuffle([...q,current]));
      setFeedback(mode==="master" ? `Correct in ${time.toFixed(1)}s, but not mastered yet. Repeats later. Answer: ${displayAnswer()}` : `Correct in ${time.toFixed(1)}s, but too slow. Repeats later. Answer: ${displayAnswer()}`);
    }
  }

  function reveal(timeout=false){
    if(!current || answered) return;
    recordAttempt(current,false);
    setAnswered(true); setRunning(false); setStreak(0); setFeedbackColor("red");
    setQueue(q=>shuffle([...q,current]));
    setFeedback(timeout ? `Time! Answer: ${displayAnswer()} — repeats later.` : `Answer: ${displayAnswer()} — repeats later.`);
  }

  function completeSession(allItems=items, comp=completed, times=successTimes){
    setRunning(false); setAnswered(true);
    const counts={green:0,yellow:0,orange:0,red:0};
    allItems.forEach(it=>counts[heatColor(attempts[key(it)])]++);
    setSessions(s=>[...s,{date:new Date().toISOString(),mode,total:allItems.length,avg:times.length?times.reduce((a,b)=>a+b,0)/times.length:null,...counts}]);
    setScreen("complete");
  }

  function toggle(arr,val,setter){
    setter(arr.includes(val) ? arr.filter(x=>x!==val) : [...arr,val].sort((a,b)=>a-b));
  }

  return <div className="app">
    <header className="topbar">
      <div><h1>🎸 Guitar Trainer</h1><p>Installable iPhone-friendly fretboard trainer</p></div>
      <button className="secondary" onClick={()=>setScreen("home")}>Home</button>
    </header>

    {screen==="home" && <section className="card">
      <h2>Choose practice mode</h2>
      <div className="modeGrid">
        <button onClick={()=>setMode("normal")} className={"modeCard "+(mode==="normal"?"active":"")}>
          <span>🎯</span><b>Find the Note</b><small>Correct in 6 seconds or less completes the note.</small>
        </button>
        <button onClick={()=>setMode("master")} className={"modeCard "+(mode==="master"?"active":"")}>
          <span>🔥</span><b>Answer Till You're a Master</b><small>Repeats randomly until every note is answered in 0–3 seconds.</small>
        </button>
      </div>
      <button className="primary wide" onClick={()=>setScreen("setup")}>Continue</button>
    </section>}

    {screen==="setup" && <section className="card">
      <h2>Session builder</h2>
      <div className="settings">
        <label>Answer display<select value={noteStyle} onChange={e=>setNoteStyle(e.target.value)}>
          <option value="both">Sharps or flats</option><option value="sharp">Sharps only</option><option value="flat">Flats only</option>
        </select></label>
      </div>
      <h3>Strings</h3><div className="pills">{strings.map((s,i)=><label key={i}><input type="checkbox" checked={selectedStrings.includes(i)} onChange={()=>toggle(selectedStrings,i,setSelectedStrings)}/>{s.label}</label>)}</div>
      <h3>Frets</h3><div className="pills frets">{Array.from({length:25},(_,i)=><label key={i}><input type="checkbox" checked={selectedFrets.includes(i)} onChange={()=>toggle(selectedFrets,i,setSelectedFrets)}/>{i}</label>)}</div>
      <div className="actions">
        <button className="secondary" onClick={()=>setSelectedFrets([3,5,7,10])}>3,5,7,10</button>
        <button className="secondary" onClick={()=>setSelectedFrets(Array.from({length:13},(_,i)=>i))}>0–12</button>
        <button className="secondary" onClick={()=>setSelectedFrets([])}>Clear</button>
      </div>
      <button className="primary wide" onClick={startSession}>Start Session</button>
    </section>}

    {screen==="practice" && <section className="card">
      {mode==="master" && <div className="info"><b>Answer Till You're a Master:</b> only answers in 0–3 seconds remove the note.</div>}
      <div className="progress"><div style={{width: total?`${100*done/total}%`:"0%"}} /></div>
      <div className="stats">
        <div><span>Completed</span><b>{done} / {total}</b></div><div><span>Remaining</span><b>{Math.max(0,total-done)}</b></div>
        <div><span>Average</span><b>{avg(successTimes)}</b></div><div><span>Streak</span><b>{streak}</b></div>
      </div>
      <div className="prompt">{paused ? "PAUSED" : current ? `${current.string.label}, fret ${current.fret}` : "Press Start"}</div>
      <div className={"timer "+colorFor(time)}>{Math.min(7,time).toFixed(1)}</div>
      <input ref={inputRef} className="hiddenInput" onChange={e=>answer(e.target.value)} autoCapitalize="characters" />
      <div className="notePad">{sharpNotes.map(n=><button key={n} onClick={()=>answer(n)}>{n}</button>)}</div>
      <div className="actions">
        <button className="primary" onClick={()=>nextNote()}>Next Note</button>
        <button className="warning" disabled={!current || answered} onClick={()=>setPaused(p=>!p)}>{paused?"Resume":"Pause"}</button>
        <button className="secondary" onClick={()=>reveal(false)}>Reveal</button>
        <button className="secondary" onClick={()=>setScreen("setup")}>End</button>
      </div>
      <div className={"feedback "+feedbackColor}>{feedback}</div>
    </section>}

    {screen==="complete" && <section className="card">
      <h2>🎉 Practice completed successfully!</h2>
      <div className="stats">
        <div><span>Total</span><b>{total}</b></div><div><span>Green</span><b>{heatCounts.green}</b></div><div><span>Yellow</span><b>{heatCounts.yellow}</b></div>
        <div><span>Orange</span><b>{heatCounts.orange}</b></div><div><span>Red</span><b>{heatCounts.red}</b></div><div><span>Average</span><b>{avg(successTimes)}</b></div>
        <div><span>Best streak</span><b>{bestStreak}</b></div><div><span>Sessions</span><b>{sessions.length}</b></div>
      </div>
      <div className="actions"><button className="primary" onClick={()=>setScreen("setup")}>Resume practicing</button><button className="secondary" onClick={()=>setScreen("heatmap")}>View heat map</button></div>
    </section>}

    {screen==="heatmap" && <section className="card">
      <h2>Heat map</h2>
      <p>Green = first try ≤3 sec. Yellow = first try 3–6 sec. Orange = 2 tries to get ≤6 sec. Red = 3+ tries to get ≤6 sec.</p>
      <div className="legend"><span className="g">Green</span><span className="y">Yellow</span><span className="o">Orange</span><span className="r">Red</span></div>
      <Heatmap items={items} attempts={attempts} />
    </section>}
  </div>
}

function Heatmap({items,attempts}){
  const frets=[...new Set(items.map(i=>i.fret))].sort((a,b)=>a-b);
  return <div className="heatWrap"><table><thead><tr><th>String</th>{frets.map(f=><th key={f}>{f}</th>)}</tr></thead><tbody>
    {strings.map((s,si)=><tr key={si}><th>{s.label}</th>{frets.map(f=>{
      const it=items.find(x=>x.stringIndex===si && x.fret===f);
      if(!it) return <td key={f}>—</td>;
      const rec=attempts[key(it)];
      const hc=heatColor(rec);
      const info=rec?.successTry == null ? `${rec?.tries||0} tries / not ≤6s` : `${rec.successTry} ${rec.successTry===1?"try":"tries"} / ${rec.successTime.toFixed(1)}s`;
      return <td key={f} className={"cell "+hc}><b>{noteAt(s.open,f,"sharp")}</b><br/><small>{info}</small></td>
    })}</tr>)}
  </tbody></table></div>
}

createRoot(document.getElementById('root')).render(<App />);
