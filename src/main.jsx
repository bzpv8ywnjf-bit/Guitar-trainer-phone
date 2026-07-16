import React, {useEffect, useMemo, useRef, useState} from "react";
import {createRoot} from "react-dom/client";
import "./style.css";

const NOTES=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const FLATS=["C","Db","D","Eb","E","F","Gb","G","Ab","A","Bb","B"];
const STRINGS=[
 {label:"6th low E",open:"E"},{label:"5th A",open:"A"},{label:"4th D",open:"D"},
 {label:"3rd G",open:"G"},{label:"2nd B",open:"B"},{label:"1st high E",open:"E"}
];
const INTERVALS=[
 ["m2","Minor 2nd",1],["M2","Major 2nd",2],["m3","Minor 3rd",3],["M3","Major 3rd",4],
 ["P4","Perfect 4th",5],["TT","Tritone",6],["P5","Perfect 5th",7],["m6","Minor 6th",8],
 ["M6","Major 6th",9],["m7","Minor 7th",10],["M7","Major 7th",11],["P8","Octave",12]
].map(([id,name,semi])=>({id,name,semi}));

const norm=s=>(s||"").trim().toUpperCase().replace("♯","#").replace("♭","B");
const noteAt=(open,fret,flat=false)=>{const i=(NOTES.indexOf(open)+fret)%12;return flat?FLATS[i]:NOTES[i]};
const answersFor=(open,fret)=>[...new Set([noteAt(open,fret),noteAt(open,fret,true)])].map(norm);
const shuffle=a=>{const b=[...a];for(let i=b.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]]}return b};
const key=x=>x.type==="interval"?`i-${x.rootIndex}-${x.interval.id}`:`f-${x.stringIndex}-${x.fret}`;
const zone=t=>t<=3?"green":t<=6?"yellow":"red";
const average=a=>a.length?(a.reduce((x,y)=>x+y,0)/a.length).toFixed(2):"—";
function heat(rec){
 if(!rec||rec.successTry==null)return"red";
 if(rec.successTry===1&&rec.firstTry<=3)return"green";
 if(rec.successTry===1&&rec.firstTry<=6)return"yellow";
 if(rec.successTry===2&&rec.successTime<=6)return"orange";
 return"red";
}
function load(k,f){try{return JSON.parse(localStorage.getItem(k))??f}catch{return f}}

function App(){
 const [page,setPage]=useState("practice");
 const [setup,setSetup]=useState(true);
 const [mode,setMode]=useState("normal");
 const [notation,setNotation]=useState("both");
 const [autoAdvance,setAutoAdvance]=useState(true);
 const [strings,setStrings]=useState([0,1,2,3,4,5]);
 const [frets,setFrets]=useState([3,5,7,10]);
 const [intervals,setIntervals]=useState(["m3","M3","P4","P5"]);
 const [items,setItems]=useState([]),[queue,setQueue]=useState([]),[done,setDone]=useState(new Set());
 const [current,setCurrent]=useState(null),[elapsed,setElapsed]=useState(0),[paused,setPaused]=useState(false),[resolved,setResolved]=useState(false);
 const [feedback,setFeedback]=useState(null),[attempts,setAttempts]=useState({}),[times,setTimes]=useState([]),[streak,setStreak]=useState(0),[bestStreak,setBestStreak]=useState(0);
 const [finished,setFinished]=useState(false);
 const [history,setHistory]=useState(()=>load("gt_history_v3",[]));
 const [mastery,setMastery]=useState(()=>load("gt_mastery_v3",{}));
 const timer=useRef(null),advance=useRef(null);

 useEffect(()=>localStorage.setItem("gt_history_v3",JSON.stringify(history.slice(-100))),[history]);
 useEffect(()=>localStorage.setItem("gt_mastery_v3",JSON.stringify(mastery)),[mastery]);
 useEffect(()=>{
   clearInterval(timer.current);
   if(current&&!paused&&!resolved&&!finished)timer.current=setInterval(()=>setElapsed(v=>Math.round((v+.1)*10)/10),100);
   return()=>clearInterval(timer.current);
 },[current,paused,resolved,finished]);
 useEffect(()=>{if(elapsed>=7&&!resolved)resolve(false,true)},[elapsed]);

 const weakKeys=useMemo(()=>Object.entries(mastery).filter(([,v])=>["orange","red"].includes(v.color)).map(([k])=>k),[mastery]);
 const progress=items.length?Math.round(done.size/items.length*100):0;

 function toggle(arr,v,setter){setter(arr.includes(v)?arr.filter(x=>x!==v):[...arr,v].sort((a,b)=>typeof a==="number"?a-b:String(a).localeCompare(String(b))))}
 function makeFretItems(){const out=[];strings.forEach(si=>frets.forEach(fret=>out.push({type:"fret",stringIndex:si,string:STRINGS[si],fret,answers:answersFor(STRINGS[si].open,fret)})));return out}
 function makeIntervalItems(){const chosen=INTERVALS.filter(x=>intervals.includes(x.id)),out=[];NOTES.forEach((root,rootIndex)=>chosen.forEach(interval=>{const t=(rootIndex+interval.semi)%12;out.push({type:"interval",root,rootIndex,interval,answers:[...new Set([NOTES[t],FLATS[t]])].map(norm)})}));return out}
 function build(){
   let base=mode==="interval"?makeIntervalItems():makeFretItems();
   if(!base.length){alert("Choose at least one item.");return}
   if(mode==="weak"){const f=base.filter(x=>weakKeys.includes(key(x)));base=f.length?f:base}
   if(mode==="review")base=[...base].sort((a,b)=>({red:0,orange:1,yellow:2,green:3}[mastery[key(a)]?.color]??0)-({red:0,orange:1,yellow:2,green:3}[mastery[key(b)]?.color]??0));
   else base=shuffle(base);
   const att={};base.forEach(x=>att[key(x)]={tries:0,firstTry:null,successTry:null,successTime:null});
   setItems(base);setQueue(base);setDone(new Set());setAttempts(att);setTimes([]);setStreak(0);setBestStreak(0);setFinished(false);setFeedback(null);setSetup(false);
   setTimeout(()=>next(base,new Set(),base),0);
 }
 function next(q=queue,d=done,all=items){
   clearTimeout(advance.current);
   if(d.size>=all.length){finish(all);return}
   let active=[...q];if(!active.length)active=shuffle(all.filter(x=>!d.has(key(x))));
   const n=active.shift();setQueue(active);setCurrent(n);setElapsed(0);setPaused(false);setResolved(false);setFeedback(null);
 }
 function threshold(t){return mode==="master"?t<=3:t<=6}
 function record(success){const k=key(current);setAttempts(p=>{const r={...(p[k]||{tries:0})};r.tries=(r.tries||0)+1;if(r.tries===1)r.firstTry=elapsed;if(success&&r.successTry==null){r.successTry=r.tries;r.successTime=elapsed}return{...p,[k]:r}})}
 function answer(v){if(!current||paused||resolved)return;if(current.answers.includes(norm(v)))resolve(true,false)}
 function resolve(correct,timeout){
   if(!current||resolved)return;
   const success=correct&&threshold(elapsed);record(success);setResolved(true);clearInterval(timer.current);
   if(success){
     const nd=new Set(done);nd.add(key(current));setDone(nd);setTimes(t=>[...t,elapsed]);const ns=streak+1;setStreak(ns);setBestStreak(Math.max(bestStreak,ns));setFeedback({type:zone(elapsed),text:`Correct in ${elapsed.toFixed(1)}s · ${display(current)}`});
     if(autoAdvance)advance.current=setTimeout(()=>next(queue,nd,items),850);
   }else{
     setStreak(0);const nq=shuffle([...queue,current]);setQueue(nq);setFeedback({type:"red",text:timeout?`Time · ${display(current)}`:correct?`Correct, but too slow · ${display(current)}`:`Answer · ${display(current)}`});
     if(autoAdvance)advance.current=setTimeout(()=>next(nq,done,items),1100);
   }
 }
 function display(x){
   if(x.type==="interval"){const i=(x.rootIndex+x.interval.semi)%12;return notation==="sharp"?NOTES[i]:notation==="flat"?FLATS[i]:[...new Set([NOTES[i],FLATS[i]])].join(" / ")}
   return notation==="sharp"?noteAt(x.string.open,x.fret):notation==="flat"?noteAt(x.string.open,x.fret,true):[...new Set([noteAt(x.string.open,x.fret),noteAt(x.string.open,x.fret,true)])].join(" / ")
 }
 function finish(all=items){
   setFinished(true);setCurrent(null);clearTimeout(advance.current);clearInterval(timer.current);
   const patch={},colors={green:0,yellow:0,orange:0,red:0};all.forEach(x=>{const c=heat(attempts[key(x)]);colors[c]++;patch[key(x)]={color:c,time:attempts[key(x)]?.successTime??null,label:label(x),date:new Date().toISOString()}});
   setMastery(m=>({...m,...patch}));setHistory(h=>[...h,{date:new Date().toISOString(),mode,total:all.length,average:Number(average(times))||null,bestStreak,...colors}]);
 }
 function label(x){return x.type==="interval"?`${x.root} + ${x.interval.name}`:`${x.string.label}, fret ${x.fret}`}
 function prompt(){if(paused)return"Paused";if(!current)return"";return current.type==="interval"?<><small>Root {current.root}</small>{current.interval.name}</>:<><small>{current.string.label}</small>Fret {current.fret}</>}
 const firstTry=Object.values(attempts).filter(r=>r.successTry===1).length;
 const firstAcc=items.length?Math.round(firstTry/items.length*100):0;
 const fastest=times.length?Math.min(...times).toFixed(1):"—",slowest=times.length?Math.max(...times).toFixed(1):"—";

 return <div className="app">
  <header className="header"><div><h1>FretMind</h1><p>Fretboard and interval trainer</p></div><button onClick={()=>setSetup(true)}>⚙︎</button></header>
  <main>
   {page==="practice"&&<>
    {setup&&<section className="card">
      <h2>Choose a practice mode</h2>
      <div className="modes">{[["normal","Find the Note","Complete positions in 6 seconds."],["master","Answer Till You're a Master","Only answers in 3 seconds count."],["weak","Weak Notes","Practice saved orange and red positions."],["review","Smart Review","Prioritize your weakest saved positions."],["interval","Interval Trainer","Find the target note from a root."]].map(([id,t,s])=><button key={id} onClick={()=>setMode(id)} className={mode===id?"selected":""}><b>{t}</b><span>{s}</span></button>)}</div>
      <div className="settings"><label>Notation<select value={notation} onChange={e=>setNotation(e.target.value)}><option value="both">Sharps & flats</option><option value="sharp">Sharps</option><option value="flat">Flats</option></select></label><label>Session flow<select value={autoAdvance?"auto":"manual"} onChange={e=>setAutoAdvance(e.target.value==="auto")}><option value="auto">Auto-advance</option><option value="manual">Wait for Next</option></select></label></div>
      {mode==="interval"?<><h3>Intervals</h3><div className="chips">{INTERVALS.map(x=><label key={x.id}><input type="checkbox" checked={intervals.includes(x.id)} onChange={()=>toggle(intervals,x.id,setIntervals)}/>{x.name}</label>)}</div></>:<><h3>Strings</h3><div className="chips">{STRINGS.map((x,i)=><label key={i}><input type="checkbox" checked={strings.includes(i)} onChange={()=>toggle(strings,i,setStrings)}/>{x.label}</label>)}</div><h3>Frets</h3><div className="chips">{Array.from({length:25},(_,i)=><label key={i}><input type="checkbox" checked={frets.includes(i)} onChange={()=>toggle(frets,i,setFrets)}/>{i}</label>)}</div><div className="quick"><button onClick={()=>setFrets([3,5,7,10])}>3,5,7,10</button><button onClick={()=>setFrets(Array.from({length:13},(_,i)=>i))}>0–12</button><button onClick={()=>setFrets([])}>Clear</button></div></>}
      <button className="primary full" onClick={build}>Start session</button>
    </section>}
    {!setup&&<section className="practice">
      <div className="progress"><div style={{width:`${progress}%`}}/></div><div className="mini"><span>{done.size}/{items.length} complete</span><span>{average(times)}s avg</span><span>{streak} streak</span></div>
      {!finished?<div className="question"><div className="prompt">{prompt()}</div><div className={`timer ${zone(elapsed)}`}>{Math.min(elapsed,7).toFixed(1)}</div><div className="pad">{NOTES.map(n=><button key={n} onClick={()=>answer(n)}>{n}</button>)}</div>{feedback&&<div className={`feedback ${feedback.type}`}>{feedback.text}</div>}<div className="controls"><button onClick={()=>setPaused(p=>!p)}>{paused?"Resume":"Pause"}</button><button onClick={()=>resolve(false,false)}>Reveal</button>{!autoAdvance&&<button className="primary" onClick={()=>next()}>Next</button>}<button onClick={()=>setSetup(true)}>End</button></div></div>
      :<div className="complete"><div className="check">✓</div><h2>Practice completed</h2><div className="results"><div><b>{average(times)}s</b><span>Average</span></div><div><b>{firstAcc}%</b><span>First-try accuracy</span></div><div><b>{fastest}s</b><span>Fastest</span></div><div><b>{slowest}s</b><span>Slowest success</span></div><div><b>{bestStreak}</b><span>Best streak</span></div><div><b>{items.length}</b><span>Items</span></div></div><button className="primary" onClick={()=>setSetup(true)}>Start another session</button></div>}
    </section>}
   </>}
   {page==="heat"&&<Heat mastery={mastery}/>} 
   {page==="stats"&&<Stats history={history}/>} 
   {page==="settings"&&<section className="card"><h2>Settings</h2><button className="danger" onClick={()=>{if(confirm("Delete all saved progress?")){setHistory([]);setMastery({})}}}>Reset saved progress</button></section>}
  </main>
  <nav><button className={page==="practice"?"active":""} onClick={()=>setPage("practice")}>▶<small>Practice</small></button><button className={page==="heat"?"active":""} onClick={()=>setPage("heat")}>▦<small>Heat map</small></button><button className={page==="stats"?"active":""} onClick={()=>setPage("stats")}>↗<small>Statistics</small></button><button className={page==="settings"?"active":""} onClick={()=>setPage("settings")}>⚙<small>Settings</small></button></nav>
 </div>
}

function Heat({mastery}){const frets=Array.from({length:13},(_,i)=>i);return <section className="card"><h2>Saved fretboard heat map</h2><p>Orange and red positions feed Weak Notes and Smart Review.</p><div className="legend"><span className="greenBg">Green</span><span className="yellowBg">Yellow</span><span className="orangeBg">Orange</span><span className="redBg">Red</span></div><div className="table"><table><thead><tr><th>String</th>{frets.map(f=><th key={f}>{f}</th>)}</tr></thead><tbody>{STRINGS.map((s,si)=><tr key={si}><th>{6-si}</th>{frets.map(f=>{const m=mastery[`f-${si}-${f}`];return <td key={f} className={m?m.color:"empty"}><b>{noteAt(s.open,f)}</b>{m?.time!=null&&<small>{m.time.toFixed(1)}s</small>}</td>})}</tr>)}</tbody></table></div></section>}
function Stats({history}){const recent=history.slice(-10).reverse(),av=history.filter(x=>x.average!=null);const all=av.length?(av.reduce((s,x)=>s+x.average,0)/av.length).toFixed(2):"—";const best=av.length?Math.min(...av.map(x=>x.average)).toFixed(2):"—";return <section className="card"><h2>Statistics</h2><div className="results"><div><b>{history.length}</b><span>Sessions</span></div><div><b>{all}s</b><span>Overall average</span></div><div><b>{best}s</b><span>Best session</span></div><div><b>{history.reduce((s,x)=>s+x.total,0)}</b><span>Items completed</span></div></div><h3>Recent sessions</h3><div className="sessions">{recent.map((x,i)=><div key={i}><span><b>{new Date(x.date).toLocaleDateString()}</b><small>{x.mode}</small></span><span><b>{x.average?.toFixed(2)??"—"}s</b><small>{x.total} items</small></span></div>)}</div></section>}
createRoot(document.getElementById("root")).render(<App/>);
